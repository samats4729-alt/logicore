import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalCompaniesService } from '../external-companies/external-companies.service';
import { findBlock } from '../blocklist/blocklist';
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
 *  - удаления из 1С не применяем: карточку убирает человек.
 */

export const CP = 'Справочник.Контрагенты';
export const ORG = 'Справочник.Организации';
export const BANK = 'Справочник.БанковскиеСчета';
export const CONTRACT = 'Справочник.Договоры';

export interface ImportSummary {
    counterparties: { created: number; linked: number; noBin: number; blocked: number };
    bankFilled: number;
    organizationLinked: boolean;
    /** Что пришло, но пока не разносится: вид объекта → сколько. */
    other: Record<string, number>;
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
    ) {}

    async import(connectionId: string, companyId: string, objects: XmlNode[]): Promise<ImportSummary> {
        const summary: ImportSummary = {
            counterparties: { created: 0, linked: 0, noBin: 0, blocked: 0 },
            bankFilled: 0,
            organizationLinked: false,
            other: {},
            errors: [],
        };
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

        for (const o of objects.filter((x) => ![CP, BANK, ORG].includes(x.name))) {
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
        // Чёрный список — не заводим, и это не ошибка обмена.
        if (await findBlock(this.prisma, companyId, { binIin: [cp.bin] })) return 'blocked';

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
