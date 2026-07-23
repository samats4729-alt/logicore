import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentDirection, PaymentMethod, AccountKind, CostType, DictionaryKind } from '@prisma/client';
import { EXCLUDED_INCOME_CATEGORIES, EXCLUDED_EXPENSE_CATEGORIES } from '../constants';

@Injectable()
export class FinancialSettingsService {
    constructor(private prisma: PrismaService) { }

    async ensureCompanyFinanceSettings(companyId: string) {
        // Clean up duplicates if any already exist due to previous race conditions
        const accounts = await this.prisma.financeAccount.findMany({
            where: { companyId }
        });
        const seenAcc = new Set<string>();
        for (const acc of accounts) {
            const key = `${acc.name}__${acc.kind}`;
            if (seenAcc.has(key)) {
                try {
                    await this.prisma.financeAccount.delete({ where: { id: acc.id } });
                } catch {}
            } else {
                seenAcc.add(key);
            }
        }

        const categories = await this.prisma.financeCategory.findMany({
            where: { companyId }
        });
        const seenCat = new Set<string>();
        for (const cat of categories) {
            const key = `${cat.name}__${cat.direction}`;
            if (seenCat.has(key)) {
                try {
                    await this.prisma.financeCategory.delete({ where: { id: cat.id } });
                } catch {}
            } else {
                seenCat.add(key);
            }
        }

        // Re-read after cleanup
        const existingAccounts = await this.prisma.financeAccount.findMany({
            where: { companyId }
        });
        const existingCategories = await this.prisma.financeCategory.findMany({
            where: { companyId }
        });

        const accountsToCreate = [
            { name: 'Наличные', kind: AccountKind.CASH },
            { name: 'Расчетный счет', kind: AccountKind.BANK }
        ].filter(acc => !existingAccounts.some(ea => ea.name === acc.name && ea.kind === acc.kind));

        // Типы затрат по умолчанию для расходных статей (по заявке / по машине / общий)
        const DEFAULT_COST_TYPES: Record<string, CostType> = {
            'ГСМ': CostType.PER_ORDER,
            'Ремонт': CostType.PER_VEHICLE,
            'Зарплата': CostType.GENERAL,
            'Аренда': CostType.GENERAL,
            'Налоги': CostType.GENERAL,
            'Прочие расходы': CostType.GENERAL,
            'Оплата исполнителю': CostType.PER_ORDER,
        };

        const categoriesToCreate = [
            { name: 'Оплата за рейс', direction: PaymentDirection.IN, isSystem: true, costType: null },
            { name: 'Прочие поступления', direction: PaymentDirection.IN, isSystem: true, costType: null },
            { name: 'ГСМ', direction: PaymentDirection.OUT, isSystem: true, costType: CostType.PER_ORDER },
            { name: 'Ремонт', direction: PaymentDirection.OUT, isSystem: true, costType: CostType.PER_VEHICLE },
            { name: 'Зарплата', direction: PaymentDirection.OUT, isSystem: true, costType: CostType.GENERAL },
            { name: 'Аренда', direction: PaymentDirection.OUT, isSystem: true, costType: CostType.GENERAL },
            { name: 'Налоги', direction: PaymentDirection.OUT, isSystem: true, costType: CostType.GENERAL },
            { name: 'Прочие расходы', direction: PaymentDirection.OUT, isSystem: true, costType: CostType.GENERAL },
            { name: 'Оплата исполнителю', direction: PaymentDirection.OUT, isSystem: true, costType: CostType.PER_ORDER },
        ].filter(cat => !existingCategories.some(ec => ec.name === cat.name && ec.direction === cat.direction));

        // Бэкфилл: у уже заведённых системных расходных статей проставим тип, если он пустой
        const needCostType = existingCategories.filter(
            ec => ec.direction === PaymentDirection.OUT && !ec.costType && DEFAULT_COST_TYPES[ec.name]
        );
        for (const ec of needCostType) {
            await this.prisma.financeCategory.update({
                where: { id: ec.id },
                data: { costType: DEFAULT_COST_TYPES[ec.name] },
            });
        }

        if (accountsToCreate.length > 0) {
            await this.prisma.financeAccount.createMany({
                data: accountsToCreate.map(a => ({
                    companyId,
                    name: a.name,
                    kind: a.kind,
                    isDefault: true,
                    isActive: true
                }))
            });
        }

        if (categoriesToCreate.length > 0) {
            await this.prisma.financeCategory.createMany({
                data: categoriesToCreate.map(c => ({
                    companyId,
                    name: c.name,
                    direction: c.direction,
                    costType: c.costType,
                    isSystem: c.isSystem,
                    isActive: true
                }))
            });
        }
    }

    async getFinanceAccounts(companyId: string) {
        await this.ensureCompanyFinanceSettings(companyId);
        return this.prisma.financeAccount.findMany({
            where: { companyId },
            orderBy: { kind: 'asc' },
        });
    }

    async updateFinanceAccount(companyId: string, id: string, data: { name?: string; openingBalance?: number; openingDate?: string | null }) {
        await this.ensureCompanyFinanceSettings(companyId);
        const account = await this.prisma.financeAccount.findFirst({
            where: { id, companyId },
        });
        if (!account) throw new NotFoundException('Счет/касса не найден');

        return this.prisma.financeAccount.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.openingBalance !== undefined && { openingBalance: data.openingBalance || 0 }),
                ...(data.openingDate !== undefined && { openingDate: data.openingDate ? new Date(data.openingDate) : null }),
            },
        });
    }

    /** Остатки по кассам и счетам: начальный остаток + приход − расход = текущий остаток */
    async getAccountBalances(companyId: string) {
        await this.ensureCompanyFinanceSettings(companyId);
        return this.buildAccountBalances(companyId, null);
    }

    /**
     * Денежная позиция компании на момент времени.
     * before = null → только начальные остатки (движений ещё «не было»);
     * before = дата → начальные остатки + все движения строго до этой даты.
     * Единый источник правды для «Остатков по кассам» и стартового остатка ДДС.
     */
    async getCashPosition(companyId: string, before: Date | null): Promise<number> {
        await this.ensureCompanyFinanceSettings(companyId);
        const accounts = await this.prisma.financeAccount.findMany({
            where: { companyId, isActive: true },
            select: { openingBalance: true },
        });
        const openingTotal = accounts.reduce((s, a) => s + (a.openingBalance || 0), 0);
        if (!before) return openingTotal;
        const { totals } = await this.buildAccountBalances(companyId, before);
        return totals.balance;
    }

    /**
     * Считает остатки по каждому счёту/кассе.
     * Операции без указанного счёта относим на счёт по умолчанию
     * (наличный платёж → касса, всё остальное → банк) — так «Остатки по кассам»
     * видят те же деньги, что и ДДС. Легаси-дубли (order_payment/driver_payment
     * в доходах/расходах) исключаем — они уже учтены платежами.
     */
    private async buildAccountBalances(companyId: string, before: Date | null) {
        const accounts = await this.prisma.financeAccount.findMany({
            where: { companyId, isActive: true },
            orderBy: { kind: 'asc' },
        });

        const defaultCash = accounts.find(a => a.kind === AccountKind.CASH && a.isDefault) || accounts.find(a => a.kind === AccountKind.CASH);
        const defaultBank = accounts.find(a => a.kind === AccountKind.BANK && a.isDefault) || accounts.find(a => a.kind === AccountKind.BANK);
        const accById = new Map(accounts.map(a => [a.id, a]));

        const dateFilter = before ? { date: { lt: before } } : {};
        const [payments, incomes, expenses] = await Promise.all([
            this.prisma.payment.findMany({
                where: { companyId, isDeleted: false, ...dateFilter },
                select: { accountId: true, direction: true, amount: true, date: true, method: true },
            }),
            this.prisma.income.findMany({
                where: { companyId, isDeleted: false, ...dateFilter },
                select: { accountId: true, amount: true, date: true, category: true },
            }),
            this.prisma.expense.findMany({
                where: { companyId, isDeleted: false, ...dateFilter },
                select: { accountId: true, amount: true, date: true, category: true },
            }),
        ]);

        const flows = new Map<string, { in: number; out: number }>();
        const getFlow = (accId: string) => {
            if (!flows.has(accId)) flows.set(accId, { in: 0, out: 0 });
            return flows.get(accId)!;
        };

        const resolveAccount = (accountId: string | null, preferCash: boolean) => {
            if (accountId && accById.has(accountId)) return accById.get(accountId)!;
            return (preferCash ? defaultCash : defaultBank) || defaultBank || defaultCash || null;
        };

        const countsForAccount = (acc: { openingDate: Date | null }, opDate: Date) =>
            !acc.openingDate || opDate >= acc.openingDate;

        for (const p of payments) {
            const acc = resolveAccount(p.accountId, p.method === PaymentMethod.CASH);
            if (!acc || !countsForAccount(acc, p.date)) continue;
            const f = getFlow(acc.id);
            if (p.direction === PaymentDirection.IN) f.in += p.amount;
            else f.out += p.amount;
        }
        for (const i of incomes) {
            if (EXCLUDED_INCOME_CATEGORIES.includes(i.category)) continue;
            const acc = resolveAccount(i.accountId, false);
            if (!acc || !countsForAccount(acc, i.date)) continue;
            getFlow(acc.id).in += i.amount;
        }
        for (const e of expenses) {
            if (EXCLUDED_EXPENSE_CATEGORIES.includes(e.category)) continue;
            const acc = resolveAccount(e.accountId, false);
            if (!acc || !countsForAccount(acc, e.date)) continue;
            getFlow(acc.id).out += e.amount;
        }

        const rows = accounts.map((acc) => {
            const f = flows.get(acc.id) || { in: 0, out: 0 };
            return {
                id: acc.id,
                name: acc.name,
                kind: acc.kind,
                openingBalance: acc.openingBalance || 0,
                openingDate: acc.openingDate,
                totalIn: f.in,
                totalOut: f.out,
                balance: (acc.openingBalance || 0) + f.in - f.out,
            };
        });

        const totals = rows.reduce(
            (t, r) => ({
                openingBalance: t.openingBalance + r.openingBalance,
                totalIn: t.totalIn + r.totalIn,
                totalOut: t.totalOut + r.totalOut,
                balance: t.balance + r.balance,
            }),
            { openingBalance: 0, totalIn: 0, totalOut: 0, balance: 0 },
        );

        return { accounts: rows, totals };
    }

    async getFinanceCategories(companyId: string) {
        await this.ensureCompanyFinanceSettings(companyId);
        return this.prisma.financeCategory.findMany({
            where: { companyId },
            orderBy: [{ direction: 'asc' }, { isSystem: 'desc' }, { name: 'asc' }],
        });
    }

    async createFinanceCategory(companyId: string, data: { name: string; direction: PaymentDirection; costType?: CostType | null }) {
        await this.ensureCompanyFinanceSettings(companyId);
        const existing = await this.prisma.financeCategory.findFirst({
            where: { companyId, name: data.name, direction: data.direction },
        });
        if (existing) {
            if (!existing.isActive) {
                return this.prisma.financeCategory.update({
                    where: { id: existing.id },
                    data: { isActive: true },
                });
            }
            throw new BadRequestException('Статья с таким названием уже существует');
        }

        // Тип затрат имеет смысл только для расходных статей
        const costType = data.direction === PaymentDirection.OUT ? (data.costType ?? null) : null;

        return this.prisma.financeCategory.create({
            data: {
                companyId,
                name: data.name,
                direction: data.direction,
                costType,
                isSystem: false,
                isActive: true,
            },
        });
    }

    async updateFinanceCategory(companyId: string, id: string, data: { name?: string; costType?: CostType | null }) {
        await this.ensureCompanyFinanceSettings(companyId);
        const category = await this.prisma.financeCategory.findFirst({
            where: { id, companyId },
        });
        if (!category) throw new NotFoundException('Статья не найдена');
        if (category.isSystem) throw new BadRequestException('Системные статьи нельзя редактировать');

        const patch: { name?: string; costType?: CostType | null } = {};
        if (data.name !== undefined) patch.name = data.name;
        // Тип затрат меняем только у расходных статей
        if (data.costType !== undefined && category.direction === PaymentDirection.OUT) {
            patch.costType = data.costType;
        }

        return this.prisma.financeCategory.update({
            where: { id },
            data: patch,
        });
    }

    async deactivateFinanceCategory(companyId: string, id: string, active: boolean) {
        await this.ensureCompanyFinanceSettings(companyId);
        const category = await this.prisma.financeCategory.findFirst({
            where: { id, companyId },
        });
        if (!category) throw new NotFoundException('Статья не найдена');
        if (category.isSystem) throw new BadRequestException('Системные статьи нельзя деактивировать');

        return this.prisma.financeCategory.update({
            where: { id },
            data: { isActive: active },
        });
    }

    // ==================== НАЧАЛЬНЫЕ ДОЛГИ КОНТРАГЕНТОВ ====================

    async getCounterpartyOpenings(companyId: string) {
        const records = await this.prisma.counterpartyOpeningBalance.findMany({
            where: { companyId },
        });
        return records.map((r) => ({
            counterpartyId: r.counterpartyId,
            openingReceivable: r.openingReceivable || 0,
            openingPayable: r.openingPayable || 0,
            openingDate: r.openingDate,
            note: r.note,
        }));
    }

    async upsertCounterpartyOpening(
        companyId: string,
        counterpartyId: string,
        data: { openingReceivable?: number; openingPayable?: number; openingDate?: string | null; note?: string | null },
    ) {
        if (counterpartyId === companyId) {
            throw new BadRequestException('Нельзя ввести долг самому себе');
        }
        const counterparty = await this.prisma.company.findUnique({ where: { id: counterpartyId }, select: { id: true } });
        if (!counterparty) throw new NotFoundException('Контрагент не найден');

        const receivable = Math.max(data.openingReceivable ?? 0, 0);
        const payable = Math.max(data.openingPayable ?? 0, 0);
        const openingDate = data.openingDate ? new Date(data.openingDate) : null;
        const note = data.note ?? null;

        return this.prisma.counterpartyOpeningBalance.upsert({
            where: { companyId_counterpartyId: { companyId, counterpartyId } },
            create: { companyId, counterpartyId, openingReceivable: receivable, openingPayable: payable, openingDate, note },
            update: { openingReceivable: receivable, openingPayable: payable, openingDate, note },
        });
    }

    // ==================== СПРАВОЧНИК НАИМЕНОВАНИЙ УСЛУГ ====================

    private readonly DEFAULT_SERVICES = [
        { name: 'Транспортно-экспедиционные услуги', unit: 'услуга', isDefault: true },
        { name: 'Перевозка груза автомобильным транспортом', unit: 'рейс', isDefault: false },
    ];

    async getServiceCatalog(companyId: string) {
        const count = await this.prisma.serviceCatalogItem.count({ where: { companyId } });
        if (count === 0) {
            await this.prisma.serviceCatalogItem.createMany({
                data: this.DEFAULT_SERVICES.map((s) => ({ companyId, ...s })),
                skipDuplicates: true,
            });
        }
        return this.prisma.serviceCatalogItem.findMany({
            where: { companyId },
            orderBy: [{ isActive: 'desc' }, { isDefault: 'desc' }, { name: 'asc' }],
        });
    }

    async createServiceItem(companyId: string, data: { name: string; unit?: string; isDefault?: boolean }) {
        const name = (data.name || '').trim();
        if (!name) throw new BadRequestException('Укажите наименование услуги');
        const existing = await this.prisma.serviceCatalogItem.findFirst({ where: { companyId, name } });
        if (existing) {
            if (!existing.isActive) return this.prisma.serviceCatalogItem.update({ where: { id: existing.id }, data: { isActive: true } });
            throw new BadRequestException('Услуга с таким наименованием уже существует');
        }
        if (data.isDefault) {
            await this.prisma.serviceCatalogItem.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
        }
        return this.prisma.serviceCatalogItem.create({
            data: { companyId, name, unit: (data.unit || 'услуга').trim() || 'услуга', isDefault: !!data.isDefault },
        });
    }

    async updateServiceItem(companyId: string, id: string, data: { name?: string; unit?: string; isDefault?: boolean }) {
        const item = await this.prisma.serviceCatalogItem.findFirst({ where: { id, companyId } });
        if (!item) throw new NotFoundException('Услуга не найдена');
        if (data.isDefault) {
            await this.prisma.serviceCatalogItem.updateMany({ where: { companyId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
        }
        const patch: { name?: string; unit?: string; isDefault?: boolean } = {};
        if (data.name !== undefined) patch.name = data.name.trim();
        if (data.unit !== undefined) patch.unit = data.unit.trim() || 'услуга';
        if (data.isDefault !== undefined) patch.isDefault = data.isDefault;
        return this.prisma.serviceCatalogItem.update({ where: { id }, data: patch });
    }

    async deactivateServiceItem(companyId: string, id: string, active: boolean) {
        const item = await this.prisma.serviceCatalogItem.findFirst({ where: { id, companyId } });
        if (!item) throw new NotFoundException('Услуга не найдена');
        return this.prisma.serviceCatalogItem.update({ where: { id }, data: { isActive: active } });
    }

    // ==================== УНИВЕРСАЛЬНЫЕ СПРАВОЧНИКИ ====================

    private readonly DICTIONARY_DEFAULTS: Record<DictionaryKind, { name: string; code?: string; isDefault?: boolean }[]> = {
        [DictionaryKind.PAYMENT_CONDITION]: [
            { name: 'Предоплата 100%' },
            { name: 'Оплата по факту выгрузки', isDefault: true },
            { name: 'Отсрочка 3 банковских дня' },
            { name: 'Отсрочка 5 банковских дней' },
            { name: 'Отсрочка 7 банковских дней' },
            { name: 'Отсрочка 10 банковских дней' },
            { name: 'По оригиналам документов' },
        ],
        [DictionaryKind.PAYMENT_FORM]: [
            { name: 'Безналичный расчёт', isDefault: true },
            { name: 'Наличный расчёт' },
            { name: 'Банковская карта' },
        ],
        [DictionaryKind.OWNERSHIP_TYPE]: [
            { name: 'ТОО', isDefault: true },
            { name: 'ИП' },
            { name: 'АО' },
            { name: 'ГП' },
            { name: 'КХ' },
            { name: 'Физическое лицо' },
        ],
        [DictionaryKind.BANK]: [
            { name: 'Народный банк Казахстана (Halyk Bank)', code: 'HSBKKZKX' },
            { name: 'Kaspi Bank', code: 'CASPKZKA' },
            { name: 'ForteBank', code: 'IRTYKZKA' },
            { name: 'Bank CenterCredit', code: 'KCJBKZKX' },
            { name: 'Jusan Bank', code: 'TSESKZKA' },
            { name: 'Bereke Bank', code: 'BRKEKZKA' },
            { name: 'Freedom Bank Kazakhstan', code: 'KSNBKZKA' },
        ],
    };

    async getDictionary(companyId: string, kind: DictionaryKind) {
        const count = await this.prisma.dictionaryItem.count({ where: { companyId, kind } });
        if (count === 0 && this.DICTIONARY_DEFAULTS[kind]) {
            await this.prisma.dictionaryItem.createMany({
                data: this.DICTIONARY_DEFAULTS[kind].map((d, i) => ({ companyId, kind, name: d.name, code: d.code || null, isDefault: !!d.isDefault, sortOrder: i })),
                skipDuplicates: true,
            });
        }
        return this.prisma.dictionaryItem.findMany({
            where: { companyId, kind },
            orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        });
    }

    async createDictionaryItem(companyId: string, kind: DictionaryKind, data: { name: string; code?: string; isDefault?: boolean }) {
        const name = (data.name || '').trim();
        if (!name) throw new BadRequestException('Укажите наименование');
        const existing = await this.prisma.dictionaryItem.findFirst({ where: { companyId, kind, name } });
        if (existing) {
            if (!existing.isActive) return this.prisma.dictionaryItem.update({ where: { id: existing.id }, data: { isActive: true } });
            throw new BadRequestException('Запись с таким наименованием уже существует');
        }
        if (data.isDefault) {
            await this.prisma.dictionaryItem.updateMany({ where: { companyId, kind, isDefault: true }, data: { isDefault: false } });
        }
        return this.prisma.dictionaryItem.create({
            data: { companyId, kind, name, code: data.code?.trim() || null, isDefault: !!data.isDefault },
        });
    }

    async updateDictionaryItem(companyId: string, id: string, data: { name?: string; code?: string; isDefault?: boolean }) {
        const item = await this.prisma.dictionaryItem.findFirst({ where: { id, companyId } });
        if (!item) throw new NotFoundException('Запись не найдена');
        if (data.isDefault) {
            await this.prisma.dictionaryItem.updateMany({ where: { companyId, kind: item.kind, isDefault: true, NOT: { id } }, data: { isDefault: false } });
        }
        const patch: { name?: string; code?: string | null; isDefault?: boolean } = {};
        if (data.name !== undefined) patch.name = data.name.trim();
        if (data.code !== undefined) patch.code = data.code.trim() || null;
        if (data.isDefault !== undefined) patch.isDefault = data.isDefault;
        return this.prisma.dictionaryItem.update({ where: { id }, data: patch });
    }

    async deactivateDictionaryItem(companyId: string, id: string, active: boolean) {
        const item = await this.prisma.dictionaryItem.findFirst({ where: { id, companyId } });
        if (!item) throw new NotFoundException('Запись не найдена');
        return this.prisma.dictionaryItem.update({ where: { id }, data: { isActive: active } });
    }
}
