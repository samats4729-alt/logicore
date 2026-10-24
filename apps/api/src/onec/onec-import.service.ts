import { Injectable, Logger } from '@nestjs/common';
import {
    AccountingDocumentDirection, AccountingDocumentStatus, AccountingDocumentType, PaymentDirection, PaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalCompaniesService } from '../external-companies/external-companies.service';
import { AccountingService } from '../accounting/accounting.service';
import { PaymentAllocationService } from '../accounting-documents/payment-allocation.service';
import { currencyLetter } from './enterprise-data';
import { XmlNode } from './xdto';

/**
 * Разнесение того, что прислала 1С, по LogiCore (обмен с 1С, этап 3).
 *
 * Формат EnterpriseData одинаков у российской и казахстанской 1С: БИН/ИИН
 * приходит в поле ИНН (проверено 23.10 на «Бухгалтерии для Казахстана» в
 * 1cFresh, формат 1.6, и на учебной БП 3.0, формат 1.10).
 *
 * Правила — чтобы 1С ничего не портила в LogiCore:
 *  - контрагент ищется сначала по связи (уже приходил из этой 1С), потом по
 *    БИН среди своих контрагентов; нашёлся — связываем, второго не заводим;
 *  - не нашёлся — заводим тем же путём, что и руками в кабинете: с проверкой
 *    чёрного списка и дублей по БИН;
 *  - без БИН не заводим: такие записи в 1С — розница, физлица без ИИН,
 *    служебные; в справочнике LogiCore они только мешают;
 *  - в уже заведённой карточке дописываем только пустые поля — что люди
 *    заполнили в LogiCore, 1С не перезаписывает;
 *  - удаления из 1С не применяем: карточку убирает человек;
 *  - оплата от покупателя (поступление на счёт, приходный ордер) заводится
 *    платежом LogiCore тем же путём, что кнопкой в кабинете; если 1С
 *    указала, что это оплата нашего акта, — гасит счета по заявкам этого
 *    акта, остаток — сам акт. Без указания — платёж ложится на контрагента,
 *    разносит бухгалтер;
 *  - оплата перевозчику (списание со счёта, расходный ордер) — так же
 *    исходящим платежом; по нашему акту перевозчика (он ушёл в 1С
 *    «Поступлением») гасит его счета по тем же заявкам и сам акт.
 */

export const CP = 'Справочник.Контрагенты';
export const ORG = 'Справочник.Организации';
export const BANK = 'Справочник.БанковскиеСчета';
export const CONTRACT = 'Справочник.Договоры';
export const PAY_BANK = 'Документ.ПБДСРасчетыСКонтрагентами';
export const PAY_CASH = 'Документ.ПКОРасчетыСКонтрагентами';
export const PAY_OUT_BANK = 'Документ.СБДСРасчетыСКонтрагентами';
export const PAY_OUT_CASH = 'Документ.РКОРасчетыСКонтрагентами';
const PAY_IN = [PAY_BANK, PAY_CASH];
const PAY_OUT = [PAY_OUT_BANK, PAY_OUT_CASH];
/** Наши акты в 1С — те же виды, что в onec-export (здесь, чтобы не было цикла импортов). */
const SALES_REF = 'Документ.РеализацияТоваровУслуг';
const PURCHASE_REF = 'Документ.ПоступлениеТоваровУслуг';

/** Что компания решила принимать из 1С. */
export interface ImportChoices {
    counterparties: boolean;
    /** Оплаты от клиентов. */
    payments: boolean;
    /** Оплаты перевозчикам. */
    carrierPayments?: boolean;
}

export interface ImportSummary {
    counterparties: { created: number; linked: number; noBin: number; blocked: number };
    bankFilled: number;
    organizationLinked: boolean;
    payments: { created: number; allocated: number; known: number; notCustomer: number };
    carrierPayments: { created: number; allocated: number; known: number; notSupplier: number };
    /** Что пришло, но пока не разносится: вид объекта → сколько. */
    other: Record<string, number>;
    /** Что пришло, но компания приём этого выключила: вид объекта → сколько. */
    ignored: Record<string, number>;
    errors: string[];
}

// ==================== чтение объектов ====================

const child = (node: XmlNode | undefined, name: string) => node?.children.find((c) => c.name === name);
const text = (node: XmlNode | undefined) => {
    const t = node?.text.trim();
    return t ? t : null;
};
/** Ключевые свойства объекта; у ссылки внутри другого объекта обёртки нет — поля лежат прямо в ней. */
const keysOf = (node: XmlNode) => child(node, 'КлючевыеСвойства') ?? node;

/** БИН/ИИН (или российский ИНН) из поля ИНН: только цифры, 10 или 12, не одни нули. */
export function binOf(raw: string | null): string | null {
    const digits = (raw ?? '').replace(/\D/g, '');
    if (!/^(\d{10}|\d{12})$/.test(digits) || /^0+$/.test(digits)) return null;
    return digits;
}

/** Номер счёта: без пробелов, заглавными, кириллица-двойник → латиница (в 1С бывает «КZ…» с русской К). */
export function accountOf(raw: string | null): string | null {
    if (!raw) return null;
    const twins: Record<string, string> = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X' };
    const s = raw.replace(/\s+/g, '').toUpperCase().replace(/[АВЕКМНОРСТХ]/g, (c) => twins[c] ?? c);
    return s || null;
}

export interface Counterparty1C {
    ref: string;
    name: string;
    bin: string | null;
}

export function readCounterparty(node: XmlNode): Counterparty1C | null {
    const keys = keysOf(node);
    const ref = text(child(keys, 'Ссылка'));
    const short = text(child(keys, 'Наименование'));
    const full = text(child(keys, 'НаименованиеПолное'));
    if (!ref || !(full || short)) return null;
    // В документы LogiCore идёт полное юридическое название — короткое у 1С бывает «ГК ПДГ».
    return { ref, name: (full || short)!, bin: binOf(text(child(keys, 'ИНН'))) };
}

export interface BankAccount1C {
    account: string;
    bic: string | null;
    bankName: string | null;
    owner: Counterparty1C | null;
}

export function readBankAccount(node: XmlNode): BankAccount1C | null {
    const keys = keysOf(node);
    const account = accountOf(text(child(keys, 'НомерСчета')));
    if (!account) return null;
    const bank = child(keys, 'Банк');
    const ownerRef = child(child(keys, 'Владелец'), 'КонтрагентыСсылка');
    return {
        account,
        bic: text(child(bank, 'БИК')),
        bankName: text(child(bank, 'Наименование')),
        owner: ownerRef ? readCounterparty(ownerRef) : null,
    };
}

/**
 * Кто контрагент по договорам из этого же сообщения: договор «с покупателем»
 * — заказчик, «с поставщиком» — перевозчик. Прочие виды роли не меняют.
 */
export interface Payment1C {
    ref: string;
    cash: boolean;
    /** Деньги ушли от нас (списание со счёта, расходный ордер). */
    out: boolean;
    date: string;
    number: string;
    amount: number;
    /** Буквенный код валюты; не узнали — null. */
    currency: string | null;
    customer: boolean;
    /** Расчёты «с поставщиком» — для нас это перевозчик. */
    supplier: boolean;
    counterparty: Counterparty1C | null;
    purpose: string | null;
    /** Строки расшифровки: сумма и, если 1С указала, наш акт или акт перевозчика (ссылка). */
    lines: Array<{ amount: number; actRef: string | null; purchaseRef: string | null }>;
}

export function readPayment(node: XmlNode): Payment1C | null {
    const keys = keysOf(node);
    const ref = text(child(keys, 'Ссылка'));
    const common = child(node, 'ОбщиеДанные');
    const amount = Number(text(child(common, 'Сумма')));
    if (!ref || !amount) return null;
    const cash = node.name === PAY_CASH || node.name === PAY_OUT_CASH;
    const cp = child(node, 'Контрагент');
    const rows = child(child(node, 'РасшифровкаПлатежа'), 'Строка') ? child(node, 'РасшифровкаПлатежа')!.children : [];
    const kind = text(child(node, 'ВидРасчетов'));
    return {
        ref,
        cash,
        out: PAY_OUT.includes(node.name),
        date: (text(child(keys, 'Дата')) ?? '').slice(0, 10),
        number: text(child(keys, 'Номер')) ?? '',
        amount,
        // До версии формата 1.7 код прямо в «Валюта», с 1.7 — в «ДанныеКлассификатора».
        currency: currencyLetter(text(child(child(common, 'Валюта'), 'Код'))
            ?? text(child(child(child(common, 'Валюта'), 'ДанныеКлассификатора'), 'Код'))),
        customer: kind === 'СПокупателем',
        supplier: kind === 'СПоставщиком',
        counterparty: cp ? readCounterparty(cp) : null,
        purpose: text(child(common, cash ? 'Основание' : 'НазначениеПлатежа')) ?? text(child(common, 'Комментарий')),
        lines: rows.filter((r) => r.name === 'Строка').map((r) => ({
            amount: Number(text(child(r, 'Сумма'))) || 0,
            actRef: text(child(child(child(r, 'ДокументРасчетов'), 'РеализацияТоваровУслугСсылка'), 'Ссылка')),
            purchaseRef: text(child(child(child(r, 'ДокументРасчетов'), 'ПоступлениеТоваровУслугСсылка'), 'Ссылка')),
        })),
    };
}

export function rolesFromContracts(objects: XmlNode[]): Map<string, { customer: boolean; carrier: boolean }> {
    const roles = new Map<string, { customer: boolean; carrier: boolean }>();
    for (const o of objects.filter((x) => x.name === CONTRACT)) {
        const keys = keysOf(o);
        const kind = text(child(keys, 'ВидДоговора')) ?? text(child(o, 'ВидДоговора'));
        const ref = text(child(child(keys, 'Контрагент'), 'Ссылка'));
        if (!ref || !kind) continue;
        const r = roles.get(ref) ?? { customer: false, carrier: false };
        if (kind === 'СПокупателем') r.customer = true;
        if (kind === 'СПоставщиком') r.carrier = true;
        roles.set(ref, r);
    }
    return roles;
}

/** Названия объектов 1С для журнала — словами бухгалтера. */
export const OBJECT_LABELS: Record<string, string> = {
    [ORG]: 'организации',
    [CP]: 'контрагенты',
    [CONTRACT]: 'договоры',
    [BANK]: 'банковские счета',
    'Документ.ПБДСРасчетыСКонтрагентами': 'оплаты на счёт',
    'Документ.ПКОРасчетыСКонтрагентами': 'оплаты в кассу',
    [PAY_OUT_BANK]: 'оплаты перевозчикам со счёта',
    [PAY_OUT_CASH]: 'оплаты перевозчикам из кассы',
    УдалениеОбъекта: 'удаления',
};

/** Строка журнала: что пришло из 1С и что с этим сделано. */
export function describeImport(s: ImportSummary, counts: Record<string, number>): string {
    const parts: string[] = [];
    if (counts[CP]) {
        const c = s.counterparties;
        const d = [
            c.created && `новых — ${c.created}`,
            c.linked && `уже были в LogiCore — ${c.linked}`,
            c.noBin && `без БИН, не заведены — ${c.noBin}`,
            c.blocked && `в чёрном списке, не заведены — ${c.blocked}`,
        ].filter(Boolean);
        parts.push(`контрагенты ${counts[CP]}${d.length ? ` (${d.join(', ')})` : ''}`);
    }
    if (counts[BANK]) parts.push(`банковские счета ${counts[BANK]}${s.bankFilled ? ` (реквизиты дописаны в карточки — ${s.bankFilled})` : ''}`);
    if (counts[ORG]) parts.push(s.organizationLinked ? 'ваша организация сверена' : 'организация с другим БИН — не связана');
    const other = Object.entries(s.other).map(([name, n]) => `${OBJECT_LABELS[name] ?? name} — ${n}`);
    if (other.length) parts.push(`пока только в журнал: ${other.join(', ')}`);
    if (counts[PAY_BANK] || counts[PAY_CASH]) {
        const p = s.payments;
        const d = [
            p.created && `приняты — ${p.created}${p.allocated ? `, из них разнесены на документы — ${p.allocated}` : ''}`,
            p.known && `уже были — ${p.known}`,
            p.notCustomer && `не от покупателей, пропущены — ${p.notCustomer}`,
        ].filter(Boolean);
        parts.push(`оплаты ${(counts[PAY_BANK] ?? 0) + (counts[PAY_CASH] ?? 0)}${d.length ? ` (${d.join(', ')})` : ''}`);
    }
    if (counts[PAY_OUT_BANK] || counts[PAY_OUT_CASH]) {
        const p = s.carrierPayments;
        const d = [
            p.created && `приняты — ${p.created}${p.allocated ? `, из них разнесены на документы — ${p.allocated}` : ''}`,
            p.known && `уже были — ${p.known}`,
            p.notSupplier && `не перевозчикам, пропущены — ${p.notSupplier}`,
        ].filter(Boolean);
        parts.push(`оплаты перевозчикам ${(counts[PAY_OUT_BANK] ?? 0) + (counts[PAY_OUT_CASH] ?? 0)}${d.length ? ` (${d.join(', ')})` : ''}`);
    }
    const ignored = Object.entries(s.ignored).map(([name, n]) => `${OBJECT_LABELS[name] ?? name} — ${n}`);
    if (ignored.length) parts.push(`не принято, приём выключен в настройках обмена: ${ignored.join(', ')}`);
    if (s.errors.length) parts.push(`не разнесено из-за ошибок — ${s.errors.length}`);
    return parts.length ? `Из 1С: ${parts.join('; ')}` : '1С на связи: новых данных нет';
}

// ==================== разнесение ====================

@Injectable()
export class OneCImportService {
    private readonly logger = new Logger(OneCImportService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly externalCompanies: ExternalCompaniesService,
        private readonly accounting: AccountingService,
        private readonly allocations: PaymentAllocationService,
    ) {}

    /**
     * @param userId от чьего имени заводить платежи — кто подключал 1С.
     * @param accept что компания решила принимать из 1С (кабинет → «Обмен с 1С»).
     *   Организация принимается всегда: по ней 1С узнаёт себя в наших актах.
     */
    async import(
        connectionId: string, companyId: string, objects: XmlNode[], userId?: string | null,
        accept: ImportChoices = { counterparties: false, payments: false },
    ): Promise<ImportSummary> {
        const summary: ImportSummary = {
            counterparties: { created: 0, linked: 0, noBin: 0, blocked: 0 },
            bankFilled: 0,
            organizationLinked: false,
            payments: { created: 0, allocated: 0, known: 0, notCustomer: 0 },
            carrierPayments: { created: 0, allocated: 0, known: 0, notSupplier: 0 },
            other: {},
            ignored: {},
            errors: [],
        };
        // Выключенное компанией 1С не присылает — мы его и не просим. Пришло
        // всё-таки (старая настройка в 1С, ручная выгрузка) — не разносим.
        const off = new Set([
            ...(accept.counterparties ? [] : [CP, BANK, CONTRACT]),
            ...(accept.payments ? [] : PAY_IN),
            ...(accept.carrierPayments ? [] : PAY_OUT),
        ]);
        for (const o of objects.filter((x) => off.has(x.name))) summary.ignored[o.name] = (summary.ignored[o.name] ?? 0) + 1;
        objects = objects.filter((x) => !off.has(x.name));
        const roles = rolesFromContracts(objects);

        // Сначала контрагенты: банковские счета ссылаются на них, а в сообщении
        // 1С счета могут идти раньше.
        for (const o of objects.filter((x) => x.name === CP)) {
            const cp = readCounterparty(o);
            if (!cp) continue;
            try {
                const result = await this.counterparty(connectionId, companyId, cp, roles.get(cp.ref));
                summary.counterparties[result]++;
            } catch (e) {
                this.fail(summary, `контрагент «${cp.name}»`, e);
            }
        }

        for (const o of objects.filter((x) => x.name === BANK)) {
            const acc = readBankAccount(o);
            if (!acc?.owner) continue; // счёт нашей организации или без владельца
            try {
                if (await this.bankAccount(connectionId, companyId, acc)) summary.bankFilled++;
            } catch (e) {
                this.fail(summary, `банковский счёт ${acc.account}`, e);
            }
        }

        for (const o of objects.filter((x) => x.name === ORG)) {
            try {
                if (await this.organization(connectionId, companyId, o)) summary.organizationLinked = true;
            } catch (e) {
                this.fail(summary, 'организация', e);
            }
        }

        for (const o of objects.filter((x) => PAY_IN.includes(x.name))) {
            const pay = readPayment(o);
            if (!pay) continue;
            try {
                const result = await this.payment(connectionId, companyId, pay, userId, accept.counterparties);
                if (result === 'allocated') summary.payments.created++;
                summary.payments[result]++;
            } catch (e) {
                this.fail(summary, `оплата №${pay.number} от ${pay.date}`, e);
            }
        }

        for (const o of objects.filter((x) => PAY_OUT.includes(x.name))) {
            const pay = readPayment(o);
            if (!pay) continue;
            try {
                const result = await this.carrierPayment(connectionId, companyId, pay, userId, accept.counterparties);
                if (result === 'allocated') summary.carrierPayments.created++;
                summary.carrierPayments[result]++;
            } catch (e) {
                this.fail(summary, `оплата перевозчику №${pay.number} от ${pay.date}`, e);
            }
        }

        for (const o of objects.filter((x) => ![CP, BANK, ORG, ...PAY_IN, ...PAY_OUT].includes(x.name))) {
            summary.other[o.name] = (summary.other[o.name] ?? 0) + 1;
        }
        return summary;
    }

    private fail(summary: ImportSummary, what: string, e: unknown) {
        const message = (e as Error)?.message ?? String(e);
        this.logger.warn(`1С → LogiCore, ${what}: ${message}`);
        if (summary.errors.length < 10) summary.errors.push(`${what}: ${message}`);
    }

    /** Связь 1С → наша запись, если есть и запись ещё жива. */
    private async mapped(connectionId: string, objectType: string, ref: string) {
        const row = await this.prisma.oneCObjectMap.findUnique({
            where: { connectionId_objectType_ref: { connectionId, objectType, ref } },
            select: { localId: true },
        });
        return row?.localId ?? null;
    }

    private async link(connectionId: string, objectType: string, ref: string, localId: string) {
        await this.prisma.oneCObjectMap.upsert({
            where: { connectionId_objectType_ref: { connectionId, objectType, ref } },
            create: { connectionId, objectType, ref, localId },
            update: { localId },
        });
    }

    /** Свой контрагент: по связи из этой 1С, потом по БИН. */
    private async findCounterparty(connectionId: string, companyId: string, cp: Counterparty1C) {
        const select = { id: true, bin: true, bankAccount: true, bankBic: true, bankName: true } as const;
        const localId = await this.mapped(connectionId, CP, cp.ref);
        if (localId) {
            const byLink = await this.prisma.company.findFirst({ where: { id: localId, isExternal: true, createdByCompanyId: companyId }, select });
            if (byLink) return byLink;
        }
        if (!cp.bin) return null;
        return this.prisma.company.findFirst({ where: { bin: cp.bin, isExternal: true, createdByCompanyId: companyId }, select });
    }

    private async counterparty(
        connectionId: string, companyId: string, cp: Counterparty1C, role?: { customer: boolean; carrier: boolean },
    ): Promise<keyof ImportSummary['counterparties']> {
        const existing = await this.findCounterparty(connectionId, companyId, cp);
        if (existing) {
            if (!existing.bin && cp.bin) await this.prisma.company.update({ where: { id: existing.id }, data: { bin: cp.bin } });
            await this.link(connectionId, CP, cp.ref, existing.id);
            return 'linked';
        }
        if (!cp.bin) return 'noBin';
        // Проверка по чёрному списку компании (findBlock, «не заводим — и это не
        // ошибка обмена») вернётся вместе с самим списком: он пока в ветке
        // boss-tasks-set3 и в main не пришёл. Счётчик blocked оставлен под неё.

        const carrier = !!role?.carrier && !role.customer;
        const created = await this.externalCompanies.createExternalCompany(companyId, {
            name: cp.name,
            bin: cp.bin,
            type: carrier ? 'FORWARDER' : 'CUSTOMER',
            isCustomer: !carrier || !!role?.customer,
            isCarrier: !!role?.carrier,
        });
        await this.link(connectionId, CP, cp.ref, created.id);
        return 'created';
    }

    /** Оплата от покупателя → платёж LogiCore; по нашему акту — сразу разнесённый. */
    private async payment(
        connectionId: string, companyId: string, pay: Payment1C, userId: string | null | undefined, mayCreateCounterparty: boolean,
    ): Promise<'created' | 'allocated' | 'known' | 'notCustomer'> {
        if (!pay.customer) return 'notCustomer';
        return this.recordPayment(connectionId, companyId, pay, userId, mayCreateCounterparty, {
            objectType: pay.cash ? PAY_CASH : PAY_BANK,
            direction: PaymentDirection.IN,
            kind: pay.cash ? 'приходный кассовый ордер' : 'поступление на расчётный счёт',
            role: { customer: true, carrier: false },
            docRef: SALES_REF,
            docDirection: AccountingDocumentDirection.OUTGOING,
        });
    }

    /** Оплата перевозчику → исходящий платёж LogiCore; по акту перевозчика — сразу разнесённый. */
    private async carrierPayment(
        connectionId: string, companyId: string, pay: Payment1C, userId: string | null | undefined, mayCreateCounterparty: boolean,
    ): Promise<'created' | 'allocated' | 'known' | 'notSupplier'> {
        if (!pay.supplier) return 'notSupplier';
        return this.recordPayment(connectionId, companyId, pay, userId, mayCreateCounterparty, {
            objectType: pay.cash ? PAY_OUT_CASH : PAY_OUT_BANK,
            direction: PaymentDirection.OUT,
            kind: pay.cash ? 'расходный кассовый ордер' : 'списание с расчётного счёта',
            role: { customer: false, carrier: true },
            docRef: PURCHASE_REF,
            docDirection: AccountingDocumentDirection.INCOMING,
        });
    }

    /**
     * Общее для оплат в обе стороны: платёж заводится тем же путём, что
     * кнопкой в кабинете, связь с документом 1С запоминается (повтор не
     * задвоит), затем — разнесение по документу, который 1С указала.
     */
    private async recordPayment(
        connectionId: string, companyId: string, pay: Payment1C, userId: string | null | undefined, mayCreateCounterparty: boolean,
        how: {
            objectType: string; direction: PaymentDirection; kind: string; role: { customer: boolean; carrier: boolean };
            docRef: string; docDirection: AccountingDocumentDirection;
        },
    ): Promise<'created' | 'allocated' | 'known'> {
        if (await this.mapped(connectionId, how.objectType, pay.ref)) return 'known';
        if (!pay.counterparty) throw new Error('в 1С у оплаты не указан контрагент');
        if (!pay.currency) throw new Error('валюта оплаты не распознана');
        if (!userId) throw new Error('не знаем, от чьего имени завести платёж: подключение 1С без автора');

        let company = await this.findCounterparty(connectionId, companyId, pay.counterparty);
        if (!company && !mayCreateCounterparty) {
            throw new Error(`контрагента «${pay.counterparty.name}» нет в LogiCore. Заведите его или включите в настройках обмена «Принимаем из 1С → Контрагенты»`);
        }
        if (!company) {
            const made = await this.counterparty(connectionId, companyId, pay.counterparty, how.role);
            if (made !== 'created') throw new Error(`контрагента «${pay.counterparty.name}» нет в LogiCore, и завести его нельзя (${made === 'noBin' ? 'без БИН' : 'в чёрном списке'})`);
            company = await this.findCounterparty(connectionId, companyId, pay.counterparty);
        }

        const payment = await this.accounting.createPayment(companyId, userId, {
            counterpartyId: company!.id,
            direction: how.direction,
            amount: pay.amount,
            date: pay.date,
            method: pay.cash ? PaymentMethod.CASH : PaymentMethod.BANK,
            currency: pay.currency,
            note: `Из 1С: ${how.kind} №${pay.number} от ${pay.date}${pay.purpose ? `. ${pay.purpose}` : ''}`,
        });
        await this.link(connectionId, how.objectType, pay.ref, payment.id);

        const plan = await this.allocationPlan(connectionId, companyId, company!.id, pay, how.docRef, how.docDirection);
        if (!plan.length) return 'created';
        try {
            await this.allocations.apply(companyId, userId, payment.id, plan);
            return 'allocated';
        } catch (e) {
            // Платёж записан; не разнёсся (например, счёт перевозчика ещё не
            // согласован) — разнесёт бухгалтер, причина в журнале сервера.
            this.logger.warn(`1С → LogiCore, разнесение оплаты №${pay.number}: ${(e as Error).message}`);
            return 'created';
        }
    }

    /**
     * Куда разнести оплату по акту (нашему или перевозчика): сначала
     * неоплаченные счета того же контрагента по тем же заявкам (долг в
     * LogiCore висит на счёте), старые вперёд; что осталось — на сам акт,
     * если по нему есть долг.
     */
    private async allocationPlan(
        connectionId: string, companyId: string, counterpartyId: string, pay: Payment1C,
        docRef: string, direction: AccountingDocumentDirection,
    ) {
        const plan = new Map<string, number>();
        const open = new Map<string, number>();
        for (const line of pay.lines) {
            const ref = docRef === PURCHASE_REF ? line.purchaseRef : line.actRef;
            if (!ref || line.amount <= 0) continue;
            const actId = await this.mapped(connectionId, docRef, ref);
            if (!actId) continue;
            const act = await this.prisma.accountingDocument.findFirst({
                where: { id: actId, companyId, counterpartyId, direction, status: AccountingDocumentStatus.POSTED },
                select: { id: true, currency: true, balanceDue: true, orders: { select: { orderId: true } } },
            });
            if (!act || act.currency !== pay.currency) continue;
            const orderIds = act.orders.map((o) => o.orderId);
            const invoices = orderIds.length
                ? await this.prisma.accountingDocument.findMany({
                    where: {
                        companyId, counterpartyId, currency: pay.currency,
                        type: AccountingDocumentType.PAYMENT_INVOICE,
                        direction,
                        status: AccountingDocumentStatus.POSTED,
                        balanceDue: { gt: 0 },
                        orders: { some: { orderId: { in: orderIds } } },
                    },
                    orderBy: [{ documentDate: 'asc' }, { createdAt: 'asc' }],
                    select: { id: true, balanceDue: true },
                })
                : [];
            let rest = line.amount;
            for (const target of [...invoices, act]) {
                if (rest <= 0) break;
                const left = open.get(target.id) ?? Number(target.balanceDue);
                const take = Math.min(rest, left);
                if (take <= 0) continue;
                plan.set(target.id, (plan.get(target.id) ?? 0) + take);
                open.set(target.id, left - take);
                rest -= take;
            }
        }
        return [...plan.entries()].map(([documentId, amount]) => ({ documentId, amount: amount.toFixed(2) }));
    }

    /** Реквизиты счёта — только в пустые поля карточки. */
    private async bankAccount(connectionId: string, companyId: string, acc: BankAccount1C): Promise<boolean> {
        const company = await this.findCounterparty(connectionId, companyId, acc.owner!);
        if (!company || company.bankAccount) return false;
        await this.prisma.company.update({
            where: { id: company.id },
            data: {
                bankAccount: acc.account,
                ...(company.bankBic ? {} : { bankBic: acc.bic }),
                ...(company.bankName ? {} : { bankName: acc.bankName }),
            },
        });
        return true;
    }

    /**
     * Организация из 1С — это сама компания. Связь пригодится, когда
     * LogiCore начнёт отправлять в 1С счета и акты от её имени. Если в 1С
     * указан БИН и он не совпадает с БИН компании — не связываем: это другая
     * организация той же базы.
     */
    private async organization(connectionId: string, companyId: string, node: XmlNode): Promise<boolean> {
        const keys = keysOf(node);
        const ref = text(child(keys, 'Ссылка'));
        if (!ref) return false;
        const bin = binOf(text(child(keys, 'ИНН')));
        const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { bin: true } });
        if (bin && company?.bin && bin !== company.bin.replace(/\D/g, '')) return false;
        await this.link(connectionId, ORG, ref, companyId);
        return true;
    }
}
