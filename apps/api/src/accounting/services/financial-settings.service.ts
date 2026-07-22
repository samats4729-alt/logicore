import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentDirection, AccountKind, CostType } from '@prisma/client';

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

    async updateFinanceAccount(companyId: string, id: string, data: { name: string }) {
        await this.ensureCompanyFinanceSettings(companyId);
        const account = await this.prisma.financeAccount.findFirst({
            where: { id, companyId },
        });
        if (!account) throw new NotFoundException('Счет/касса не найден');

        return this.prisma.financeAccount.update({
            where: { id },
            data: { name: data.name },
        });
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
}
