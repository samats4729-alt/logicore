import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AccountingDocumentDirection, AccountingDocumentStatus, AccountingDocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CONTRACT, CP, ORG } from './onec-import.service';
import {
    ContractKey, CounterpartyKey, OrganizationKey, PurchaseDocument, contractObject, currencyOf, isLegalEntity, purchaseDeletion, purchaseObject,
    salesDeletion, salesObject, serviceObject, shortNumber, vatRateOf,
} from './enterprise-data';

export const SALES = 'Документ.РеализацияТоваровУслуг';
export const PURCHASE = 'Документ.ПоступлениеТоваровУслуг';
export const SERVICE = 'Справочник.Номенклатура';
/** Сколько документов за одно сообщение: остальное уйдёт следующей синхронизацией. */
const BATCH = 200;
/** Отпечаток удаления: документ отменён, удаление в 1С отправлено. */
const DELETED = 'deleted';

/** Что компания отправляет в 1С (кабинет → «Обмен с 1С» → «Отправляем в 1С»). */
export interface ExportChoices {
    /** Свои акты выполненных работ → «Реализация». */
    acts: boolean;
    /** Акты перевозчиков → «Поступление услуг». */
    carrierActs: boolean;
    /** Договоры: документ ложится в 1С на свой договор, а не на «Основной». */
    contracts: boolean;
}

export interface ExportResult {
    /** Готовые объекты для тела сообщения. */
    body: string;
    sales: number;
    purchases: number;
    contracts: number;
    deletions: number;
    /** Что не ушло и почему — для журнала. */
    skipped: string[];
    /** Отметить отправленным, когда сообщение собрано: что и с каким отпечатком. */
    commit: (messageNo: number) => Promise<void>;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);
const money = (v: unknown) => Number(v ?? 0).toFixed(2);
const qty = (v: unknown) => String(Number(v ?? 0));
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Свои акты — «Реализация», акты перевозчиков — «Поступление». */
const KINDS = [
    { objectType: SALES, direction: AccountingDocumentDirection.OUTGOING, deletion: salesDeletion, choice: 'acts' as const },
    { objectType: PURCHASE, direction: AccountingDocumentDirection.INCOMING, deletion: purchaseDeletion, choice: 'carrierActs' as const },
];

/**
 * Что LogiCore отправляет в 1С.
 *
 * Свои акты выполненных работ — «Реализация (акт, накладная)», акты
 * перевозчиков — «Поступление (акт, накладная)»: это расход на перевозку,
 * бухгалтер больше не вбивает его руками. К ним, если компания включила, —
 * договоры, чтобы 1С положила документ на свой договор.
 *
 * Счета на оплату не отправляются: ни российская, ни казахстанская
 * «Бухгалтерия» не принимают «Счёт покупателю» в обмене (в списке объектов,
 * который 1С присылает при синхронизации, его нет), да и в учёте 1С счёт не
 * нужен — долг и выручку даёт акт.
 *
 * Уходят документы, проведённые после того, как обмен настроили: старые
 * компания уже переносила в 1С руками, и вторая их копия задвоила бы учёт.
 * Документ уходит ещё раз, если его изменили или если 1С не подтвердила
 * сообщение, в котором он ушёл. Отменённый после отправки — уходит удалением.
 */
@Injectable()
export class OneCExportService {
    constructor(private readonly prisma: PrismaService) {}

    async build(connectionId: string, choices: ExportChoices = { acts: true, carrierActs: false, contracts: false }): Promise<ExportResult> {
        const conn = await this.prisma.oneCConnection.findUniqueOrThrow({
            where: { id: connectionId },
            select: {
                companyId: true, setupAt: true, peerReceivedNo: true, formatVersion: true,
                company: { select: { name: true, bin: true } },
            },
        });
        const empty: ExportResult = { body: '', sales: 0, purchases: 0, contracts: 0, deletions: 0, skipped: [], commit: async () => {} };
        const kinds = KINDS.filter((k) => choices[k.choice]);
        if (!conn.setupAt || !kinds.length) return empty;
        const setupAt = conn.setupAt;
        const version = conn.formatVersion;

        const pending: Array<{ objectType: string; localId: string; ref: string; hash: string }> = [];
        const parts: string[] = [];
        const skipped: string[] = [];
        const inMessage = new Set<string>();
        const unconfirmed = (s?: { sentNo: number | null } | null) => !!s?.sentNo && s.sentNo > conn.peerReceivedNo;

        // Организация — только та, что пришла из этой 1С. Своей ссылки не
        // придумываем: не узнав её, 1С завела бы себе вторую организацию.
        const org = await this.prisma.oneCObjectMap.findFirst({
            where: { connectionId, objectType: ORG, localId: conn.companyId },
            orderBy: { createdAt: 'asc' },
            select: { ref: true },
        });
        if (!org) {
            let waiting = 0;
            for (const k of kinds) waiting += await this.prisma.accountingDocument.count({ where: this.docsWhere(conn.companyId, setupAt, k.direction) });
            if (!waiting) return empty;
            return {
                ...empty,
                skipped: ['документы пока не отправляются: 1С ещё не прислала свою организацию. '
                    + 'Проверьте, что в 1С заполнены реквизиты организации, и синхронизируйте ещё раз'],
            };
        }
        const organization: OrganizationKey = { ref: org.ref, name: conn.company.name, bin: conn.company.bin };

        /** Справочный объект (услуга, договор) — один раз на сообщение и только если 1С его ещё не знает или он изменился. */
        const reference = async (objectType: string, ref: string, objectXml: string): Promise<boolean> => {
            if (inMessage.has(ref)) return false;
            inMessage.add(ref);
            const known = await this.prisma.oneCObjectMap.findUnique({
                where: { connectionId_objectType_ref: { connectionId, objectType, ref } },
                select: { localId: true, sentNo: true, hash: true },
            });
            const hash = sha(objectXml);
            if (known?.hash === hash && !unconfirmed(known)) return false;
            parts.push(objectXml);
            pending.push({ objectType, localId: known!.localId, ref, hash });
            return true;
        };

        const counts = { sales: 0, purchases: 0, contracts: 0, deletions: 0 };
        let total = 0;
        for (const kind of kinds) {
            const sent = await this.prisma.oneCObjectMap.findMany({
                where: { connectionId, objectType: kind.objectType },
                select: { localId: true, ref: true, sentNo: true, hash: true },
            });
            const sentById = new Map(sent.map((s) => [s.localId, s]));

            // Отменённые после отправки — удаление в 1С.
            const cancelled = sent.length
                ? await this.prisma.accountingDocument.findMany({
                    where: { id: { in: sent.map((s) => s.localId) }, companyId: conn.companyId, status: AccountingDocumentStatus.CANCELLED },
                    select: { id: true },
                })
                : [];
            for (const doc of cancelled) {
                const s = sentById.get(doc.id)!;
                if (s.hash === DELETED && !unconfirmed(s)) continue;
                parts.push(kind.deletion(s.ref));
                pending.push({ objectType: kind.objectType, localId: doc.id, ref: s.ref, hash: DELETED });
                counts.deletions++;
            }

            const docs = await this.prisma.accountingDocument.findMany({
                where: this.docsWhere(conn.companyId, setupAt, kind.direction),
                orderBy: [{ documentDate: 'asc' }, { createdAt: 'asc' }],
                select: {
                    id: true, number: true, documentDate: true, currency: true, total: true, externalNumber: true, externalDate: true,
                    counterparty: { select: { id: true, name: true, bin: true } },
                    contract: { select: { id: true, contractNumber: true, startDate: true, endDate: true, forwarderCompanyId: true } },
                    lines: {
                        orderBy: { lineNumber: 'asc' },
                        select: { name: true, description: true, quantity: true, total: true, vatTreatment: true, vatRate: true, vatAmount: true },
                    },
                },
            });

            for (const d of docs) {
                if (total >= BATCH) break;
                const what = kind.objectType === SALES ? 'акт' : 'акт перевозчика';
                const currency = currencyOf(d.currency);
                if (!currency) {
                    skipped.push(`${what} ${d.number}: валюта ${d.currency} — 1С её не знает по коду`);
                    continue;
                }
                if (!d.lines.length) continue;

                const prev = sentById.get(d.id);
                const counterparty: CounterpartyKey = {
                    ref: await this.refFor(connectionId, CP, d.counterparty.id),
                    name: d.counterparty.name,
                    bin: d.counterparty.bin,
                    legal: isLegalEntity(d.counterparty.bin, d.counterparty.name),
                };
                const services = await Promise.all(d.lines.map(async (l) => ({
                    ref: await this.refFor(connectionId, SERVICE, serviceId(l.name)), name: l.name.trim(),
                })));
                // Договор документа — только если компания отправляет договоры.
                const contract: ContractKey | null = choices.contracts && d.contract ? {
                    ref: await this.refFor(connectionId, CONTRACT, d.contract.id),
                    // Мы экспедитор по договору — договор с заказчиком; иначе — с перевозчиком.
                    kind: d.contract.forwarderCompanyId === conn.companyId ? 'СПокупателем' : 'СПоставщиком',
                    organization,
                    counterparty,
                    currency,
                    number: d.contract.contractNumber,
                    date: day(d.contract.startDate),
                    validTo: day(d.contract.endDate),
                } : null;
                const doc: PurchaseDocument = {
                    ref: prev?.ref ?? randomUUID(),
                    date: d.documentDate.toISOString().slice(0, 10),
                    number: shortNumber(d.number),
                    organization,
                    counterparty,
                    currency,
                    amount: money(d.total),
                    comment: kind.objectType === SALES ? `LogiCore: ${d.number}` : `LogiCore: акт перевозчика ${d.number}`,
                    contract,
                    incomingNumber: d.externalNumber ?? d.number,
                    incomingDate: day(d.externalDate) ?? day(d.documentDate),
                    lines: d.lines.map((l, i) => {
                        const quantity = Number(l.quantity) || 1;
                        return {
                            service: services[i],
                            quantity: qty(quantity),
                            amount: money(l.total),
                            price: money(Number(l.total) / quantity),
                            vatRate: vatRateOf(l.vatTreatment, Number(l.vatRate)),
                            vatAmount: money(l.vatAmount),
                            content: l.description,
                        };
                    }),
                };
                const xml = kind.objectType === SALES ? salesObject(doc, version) : purchaseObject(doc, version);
                const hash = sha(xml);
                if (prev && prev.hash === hash && !unconfirmed(prev)) continue;

                // Сначала справочное: 1С загружает объекты по порядку.
                for (const s of services) await reference(SERVICE, s.ref, serviceObject(s, version));
                if (contract && await reference(CONTRACT, contract.ref, contractObject(contract, version))) counts.contracts++;
                parts.push(xml);
                pending.push({ objectType: kind.objectType, localId: d.id, ref: doc.ref, hash });
                if (kind.objectType === SALES) counts.sales++; else counts.purchases++;
                total++;
            }
        }

        return {
            body: parts.join(''),
            ...counts,
            skipped,
            commit: async (messageNo: number) => {
                for (const p of pending) {
                    await this.prisma.oneCObjectMap.upsert({
                        where: { connectionId_objectType_ref: { connectionId, objectType: p.objectType, ref: p.ref } },
                        create: { connectionId, objectType: p.objectType, ref: p.ref, localId: p.localId, sentNo: messageNo, hash: p.hash },
                        update: { sentNo: messageNo, hash: p.hash },
                    });
                }
            },
        };
    }

    /**
     * Какие документы уходят в 1С: акты (свои исходящие или входящие от
     * перевозчиков), проведённые после настройки обмена. Акт перевозчика,
     * в согласовании которого отказали, не уходит: платить по нему не будут.
     */
    private docsWhere(companyId: string, setupAt: Date, direction: AccountingDocumentDirection): Prisma.AccountingDocumentWhereInput {
        return {
            companyId,
            type: AccountingDocumentType.SERVICE_ACT,
            direction,
            status: AccountingDocumentStatus.POSTED,
            postedAt: { gte: setupAt },
            ...(direction === AccountingDocumentDirection.INCOMING
                ? { OR: [{ approvalStatus: null }, { approvalStatus: { not: 'REJECTED' } }] }
                : {}),
        };
    }

    /**
     * Ссылка 1С для нашей записи. Пришла из 1С — берём её: 1С узнает свой
     * объект. Не приходила — заводим новую и запоминаем: так 1С при обратной
     * отправке (оплата по нашему акту) назовёт её той же ссылкой.
     */
    private async refFor(connectionId: string, objectType: string, localId: string): Promise<string> {
        const row = await this.prisma.oneCObjectMap.findFirst({
            where: { connectionId, objectType, localId },
            orderBy: { createdAt: 'asc' },
            select: { ref: true },
        });
        if (row) return row.ref;
        const ref = randomUUID();
        await this.prisma.oneCObjectMap.create({ data: { connectionId, objectType, ref, localId } });
        return ref;
    }
}

/** Услуга LogiCore в 1С узнаётся по названию. */
export const serviceId = (name: string) => `service:${name.trim().toLowerCase()}`;
