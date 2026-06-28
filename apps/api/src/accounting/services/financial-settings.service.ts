import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentDirection, AccountKind } from '@prisma/client';

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

        const categoriesToCreate = [
            { name: 'Оплата за рейс', direction: PaymentDirection.IN, isSystem: true },
            { name: 'Прочие поступления', direction: PaymentDirection.IN, isSystem: true },
            { name: 'ГСМ', direction: PaymentDirection.OUT, isSystem: true },
            { name: 'Ремонт', direction: PaymentDirection.OUT, isSystem: true },
            { name: 'Зарплата', direction: PaymentDirection.OUT, isSystem: true },
            { name: 'Аренда', direction: PaymentDirection.OUT, isSystem: true },
            { name: 'Налоги', direction: PaymentDirection.OUT, isSystem: true },
            { name: 'Прочие расходы', direction: PaymentDirection.OUT, isSystem: true },
            { name: 'Оплата исполнителю', direction: PaymentDirection.OUT, isSystem: true },
        ].filter(cat => !existingCategories.some(ec => ec.name === cat.name && ec.direction === cat.direction));

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

    async createFinanceCategory(companyId: string, data: { name: string; direction: PaymentDirection }) {
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

        return this.prisma.financeCategory.create({
            data: {
                companyId,
                name: data.name,
                direction: data.direction,
                isSystem: false,
                isActive: true,
            },
        });
    }

    async updateFinanceCategory(companyId: string, id: string, data: { name: string }) {
        await this.ensureCompanyFinanceSettings(companyId);
        const category = await this.prisma.financeCategory.findFirst({
            where: { id, companyId },
        });
        if (!category) throw new NotFoundException('Статья не найдена');
        if (category.isSystem) throw new BadRequestException('Системные статьи нельзя редактировать');

        return this.prisma.financeCategory.update({
            where: { id },
            data: { name: data.name },
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
