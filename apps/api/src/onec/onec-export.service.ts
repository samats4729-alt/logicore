import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AccountingDocumentDirection, AccountingDocumentStatus, AccountingDocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CP, ORG } from './onec-import.service';
import {
    CounterpartyKey, OrganizationKey, SalesDocument, currencyOf, salesDeletion, salesObject, serviceObject, shortNumber, vatRateOf,
} from './enterprise-data';

export const SALES = 'Документ.РеализацияТоваровУслуг';
export const SERVICE = 'Справочник.Номенклатура';
/** Сколько актов за одно сообщение: остальное уйдёт следующей синхронизацией. */
const BATCH = 200;
/** Отпечаток удаления: документ отменён, удаление в 1С отправлено. */
const DELETED = 'deleted';

export interface ExportResult {
    /** Готовые объекты для тела сообщения. */
    body: string;
    sales: number;
    deletions: number;
    /** Что не ушло и почему — для журнала. */
    skipped: string[];
    /** Отметить отправленным, когда сообщение собрано: что и с каким отпечатком. */
    commit: (messageNo: number) => Promise<void>;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);
const money = (v: unknown) => Number(v ?? 0).toFixed(2);
const qty = (v: unknown) => String(Number(v ?? 0));

/**
 * Что LogiCore отправляет в 1С (обмен с 1С, этап 4).
 *
 * Акты выполненных работ — «Реализация (акт, накладная)» с услугами. Счета
 * на оплату не отправляются: ни российская, ни казахстанская «Бухгалтерия»
 * не принимают «Счёт покупателю» в обмене (в списке объектов, который 1С
 * присылает при синхронизации, его нет), да и в учёте 1С счёт не нужен —
 * долг и выручку даёт акт.
 *
 * Уходят акты, проведённые после того, как обмен настроили: старые компания
 * уже переносила в 1С руками, и вторая их копия задвоила бы выручку. Акт
 * уходит ещё раз, если его изменили или если 1С не подтвердила сообщение,
 * в котором он ушёл. Отменённый после отправки — уходит удалением.
 */
@Injectable()
export class OneCExportService {
    constructor(private readonly prisma: PrismaService) {}

    async build(connectionId: string): Promise<ExportResult> {
        const conn = await this.prisma.oneCConnection.findUniqueOrThrow({
            where: { id: connectionId },
            select: {
                companyId: true, setupAt: true, peerReceivedNo: true, formatVersion: true,
                company: { select: { name: true, bin: true } },
            },
        });
        const empty: ExportResult = { body: '', sales: 0, deletions: 0, skipped: [], commit: async () => {} };
        if (!conn.setupAt) return empty;

        const pending: Array<{ objectType: string; localId: string; ref: string; hash: string }> = [];
        const parts: string[] = [];
        const skipped: string[] = [];
        const servicesInMessage = new Set<string>();

        // Организация — только та, что пришла из этой 1С. Своей ссылки не
        // придумываем: не узнав её, 1С завела бы себе вторую организацию.
        const org = await this.prisma.oneCObjectMap.findFirst({
            where: { connectionId, objectType: ORG, localId: conn.companyId },
            orderBy: { createdAt: 'asc' },
            select: { ref: true },
        });
        if (!org) {
            const waiting = await this.prisma.accountingDocument.count({ where: this.actsWhere(conn.companyId, conn.setupAt) });
            if (!waiting) return empty;
            return {
                ...empty,
                skipped: ['акты пока не отправляются: 1С ещё не прислала свою организацию. '
                    + 'Проверьте, что в 1С заполнены реквизиты организации, и синхронизируйте ещё раз'],
            };
        }
        const organization: OrganizationKey = { ref: org.ref, name: conn.company.name, bin: conn.company.bin };

        const sent = await this.prisma.oneCObjectMap.findMany({
            where: { connectionId, objectType: SALES },
            select: { localId: true, ref: true, sentNo: true, hash: true },
        });
        const sentById = new Map(sent.map((s) => [s.localId, s]));
        const unconfirmed = (s?: { sentNo: number | null }) => !!s?.sentNo && s.sentNo > conn.peerReceivedNo;

        // Отменённые после отправки — удаление в 1С.
        const cancelled = sent.length
            ? await this.prisma.accountingDocument.findMany({
                where: { id: { in: sent.map((s) => s.localId) }, companyId: conn.companyId, status: AccountingDocumentStatus.CANCELLED },
                select: { id: true },
            })
            : [];
        let deletions = 0;
        for (const doc of cancelled) {
            const s = sentById.get(doc.id)!;
            if (s.hash === DELETED && !unconfirmed(s)) continue;
            parts.push(salesDeletion(s.ref));
            pending.push({ objectType: SALES, localId: doc.id, ref: s.ref, hash: DELETED });
            deletions++;
        }

        const acts = await this.prisma.accountingDocument.findMany({
            where: this.actsWhere(conn.companyId, conn.setupAt),
            orderBy: [{ documentDate: 'asc' }, { createdAt: 'asc' }],
            select: {
                id: true, number: true, documentDate: true, currency: true, total: true,
                counterparty: { select: { id: true, name: true, bin: true } },
                lines: {
                    orderBy: { lineNumber: 'asc' },
                    select: { name: true, description: true, quantity: true, total: true, vatTreatment: true, vatRate: true, vatAmount: true },
                },
            },
        });

        let sales = 0;
        for (const act of acts) {
            if (sales >= BATCH) break;
            const currency = currencyOf(act.currency);
            if (!currency) {
                skipped.push(`акт ${act.number}: валюта ${act.currency} — 1С её не знает по коду`);
                continue;
            }
            if (!act.lines.length) continue;

            const prev = sentById.get(act.id);
            const counterparty: CounterpartyKey = {
                ref: await this.refFor(connectionId, CP, act.counterparty.id),
                name: act.counterparty.name,
                bin: act.counterparty.bin,
                legal: true,
            };
            const services = await Promise.all(act.lines.map(async (l) => ({
                ref: await this.refFor(connectionId, SERVICE, serviceId(l.name)), name: l.name.trim(),
            })));
            const doc: SalesDocument = {
                ref: prev?.ref ?? randomUUID(),
                date: act.documentDate.toISOString().slice(0, 10),
                number: shortNumber(act.number),
                organization,
                counterparty,
                currency,
                amount: money(act.total),
                comment: `LogiCore: ${act.number}`,
                lines: act.lines.map((l, i) => {
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
            const xml = salesObject(doc, conn.formatVersion);
            const hash = sha(xml);
            if (prev && prev.hash === hash && !unconfirmed(prev)) continue;

            // Услуга уходит один раз на сообщение и только если 1С о ней ещё не знает.
            for (const s of services) {
                if (servicesInMessage.has(s.ref)) continue;
                servicesInMessage.add(s.ref);
                const objectXml = serviceObject(s, conn.formatVersion);
                const known = await this.prisma.oneCObjectMap.findUnique({
                    where: { connectionId_objectType_ref: { connectionId, objectType: SERVICE, ref: s.ref } },
                    select: { localId: true, sentNo: true, hash: true },
                });
                if (known?.hash === sha(objectXml) && !unconfirmed(known)) continue;
                parts.push(objectXml);
                pending.push({ objectType: SERVICE, localId: known!.localId, ref: s.ref, hash: sha(objectXml) });
            }
            parts.push(xml);
            pending.push({ objectType: SALES, localId: act.id, ref: doc.ref, hash });
            sales++;
        }

        return {
            body: parts.join(''),
            sales,
            deletions,
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

    /** Какие акты уходят в 1С: свои исходящие, проведённые после настройки обмена. */
    private actsWhere(companyId: string, setupAt: Date) {
        return {
            companyId,
            type: AccountingDocumentType.SERVICE_ACT,
            direction: AccountingDocumentDirection.OUTGOING,
            status: AccountingDocumentStatus.POSTED,
            postedAt: { gte: setupAt },
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
