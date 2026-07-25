import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceCalculatorService } from '../accounting/services/finance-calculator.service';
import { money } from '../common/utils/money';

@Injectable()
export class PayrollService {
    private readonly logger = new Logger(PayrollService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly calculator: FinanceCalculatorService,
    ) {}

    async getSchemeFor(companyId: string, userId: string) {
        // Персональная схема (userId)
        let scheme = await this.prisma.payrollScheme.findFirst({
            where: { companyId, userId, isActive: true },
        });
        if (!scheme) {
            // Иначе общая схема компании (userId = null)
            scheme = await this.prisma.payrollScheme.findFirst({
                where: { companyId, userId: null, isActive: true },
            });
        }
        return scheme;
    }

    async processOrderTrigger(orderId: string, trigger: string) {
        try {
            const normalizedTrigger = trigger.startsWith('STATUS:') ? trigger.slice(7) : trigger;

            // Отмена заявки: экономики рейса больше нет, поэтому ранее начисленный
            // менеджеру процент по этой заявке сторнируем. Саму запись не удаляем
            // (это финансовый след) — обнуляем сумму и помечаем причину в снимке.
            if (normalizedTrigger === 'CANCELLED') {
                const existing = await this.prisma.payrollAccrual.findFirst({
                    where: { orderId, kind: 'PERCENT' },
                });
                if (existing && existing.amount !== 0) {
                    await this.prisma.payrollAccrual.update({
                        where: { id: existing.id },
                        data: {
                            amount: 0,
                            schemeSnapshot: {
                                ...((existing.schemeSnapshot as any) || {}),
                                _reversedReason: 'order_cancelled',
                                _reversedAt: new Date().toISOString(),
                            },
                        },
                    });
                }
                return;
            }

            // Взять заявку
            const order = await this.prisma.order.findUnique({
                where: { id: orderId },
                include: {
                    responsibleManager: true,
                },
            });
            if (!order || !order.responsibleManagerId) {
                return;
            }

            const manager = order.responsibleManager;
            if (!manager) {
                return;
            }
            const managerCompanyId = manager.companyId;
            if (!managerCompanyId) {
                return;
            }

            // Получить схему менеджера
            const scheme = await this.getSchemeFor(managerCompanyId, manager.id);
            if (!scheme || !scheme.isActive || scheme.accrualStatus !== normalizedTrigger) {
                return;
            }

            // Если тип FIXED, проценты не начисляем
            if (scheme.type === 'FIXED') {
                return;
            }

            // Вычисляем базу
            let base = 0;
            if (scheme.percentBase === 'ORDER_AMOUNT') {
                base = order.customerPrice || 0;
            } else if (scheme.percentBase === 'MARGIN') {
                // Собрать входные данные так же, как getFinancialRegistry
                const [payments, incomes, expenses] = await Promise.all([
                    this.prisma.payment.findMany({
                        where: { orderId, isDeleted: false },
                    }),
                    this.prisma.income.findMany({
                        where: { orderId, companyId: managerCompanyId, isDeleted: false },
                    }),
                    this.prisma.expense.findMany({
                        where: { orderId, companyId: managerCompanyId, isDeleted: false },
                    }),
                ]);

                const fin = this.calculator.computeOrderFinance({
                    order,
                    payments,
                    incomes,
                    expenses,
                    companyId: managerCompanyId,
                });
                base = fin.margin;
            }

            const amount = money(base * (scheme.percentValue || 0) / 100);
            const periodMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

            // Защита от двойного начисления по уникальному индексу @@unique([orderId, userId, kind]).
            // Если начисление уже есть — заявку пересчитали (изменилась цена/маржа) или
            // триггер сработал повторно: обновляем сумму вместо того, чтобы молча оставить
            // устаревшую (см. H-6), а не создаём новую запись поверх уникального индекса.
            const existing = await this.prisma.payrollAccrual.findUnique({
                where: { orderId_userId_kind: { orderId, userId: manager.id, kind: 'PERCENT' } },
            });
            if (existing) {
                if (existing.amount !== amount || existing.baseAmount !== base) {
                    await this.prisma.payrollAccrual.update({
                        where: { id: existing.id },
                        data: { amount, baseAmount: base, schemeSnapshot: scheme as any },
                    });
                }
            } else {
                await this.prisma.payrollAccrual.create({
                    data: {
                        companyId: managerCompanyId,
                        userId: manager.id,
                        orderId,
                        kind: 'PERCENT',
                        amount,
                        periodMonth,
                        baseAmount: base,
                        schemeSnapshot: scheme as any,
                    },
                });
            }
        } catch (error: any) {
            this.logger.warn(`Failed to process payroll trigger for order ${orderId}: ${error.message}`);
        }
    }

    async ensureMonthlyAccruals(companyId: string, userId: string, months: string[]) {
        const nowStr = new Date().toISOString().slice(0, 7);
        const filteredMonths = months.filter(m => m <= nowStr);

        for (const periodMonth of filteredMonths) {
            // Проверка закрытого периода
            const [yearStr, monthStr] = periodMonth.split('-');
            if (yearStr && monthStr) {
                const year = parseInt(yearStr, 10);
                const month = parseInt(monthStr, 10);
                const closedPeriod = await this.prisma.closedPeriod.findUnique({
                    where: { companyId_year_month: { companyId, year, month } },
                    select: { id: true },
                });
                if (closedPeriod) continue; // Период закрыт — пропускаем
            }

            const scheme = await this.getSchemeFor(companyId, userId);
            if (!scheme || !scheme.isActive) {
                continue;
            }

            // 1. Оклад (SALARY)
            if ((scheme.type === 'FIXED' || scheme.type === 'HYBRID') && (scheme.fixedAmount || 0) > 0) {
                const existing = await this.prisma.payrollAccrual.findFirst({
                    where: { userId, periodMonth, kind: 'SALARY' },
                });
                if (existing) {
                    if (existing.amount !== scheme.fixedAmount) {
                        await this.prisma.payrollAccrual.update({
                            where: { id: existing.id },
                            data: { amount: scheme.fixedAmount, schemeSnapshot: scheme as any },
                        });
                    }
                } else {
                    try {
                        await this.prisma.payrollAccrual.create({
                            data: {
                                companyId,
                                userId,
                                kind: 'SALARY',
                                amount: scheme.fixedAmount,
                                periodMonth,
                                schemeSnapshot: scheme as any,
                            },
                        });
                    } catch (e: any) {
                        if (e.code !== 'P2002') throw e;
                    }
                }
            }

            // 2. KPI Rules
            const kpiRules = await this.prisma.payrollKpiRule.findMany({
                where: {
                    companyId,
                    isActive: true,
                    OR: [
                        { userId: null },
                        { userId },
                    ],
                },
            });

            for (const rule of kpiRules) {
                if (rule.metric === 'COMPLETED_ORDERS_MONTH') {
                    // Вычисляем количество завершенных заявок за месяц
                    const start = new Date(periodMonth + '-01T00:00:00.000Z');
                    const end = new Date(start);
                    end.setMonth(start.getMonth() + 1);

                    const count = await this.prisma.order.count({
                        where: {
                            responsibleManagerId: userId,
                            status: 'COMPLETED',
                            completedAt: {
                                gte: start,
                                lt: end,
                            },
                        },
                    });

                    if (count >= rule.threshold) {
                        const existingKpi = await this.prisma.payrollAccrual.findFirst({
                            where: { userId, periodMonth, kind: 'KPI', kpiRuleId: rule.id },
                        });
                        if (existingKpi) {
                            if (existingKpi.amount !== rule.bonusAmount) {
                                await this.prisma.payrollAccrual.update({
                                    where: { id: existingKpi.id },
                                    data: { amount: rule.bonusAmount, schemeSnapshot: rule as any },
                                });
                            }
                        } else {
                            try {
                                await this.prisma.payrollAccrual.create({
                                    data: {
                                        companyId,
                                        userId,
                                        kind: 'KPI',
                                        amount: rule.bonusAmount,
                                        periodMonth,
                                        kpiRuleId: rule.id,
                                        schemeSnapshot: rule as any,
                                    },
                                });
                            } catch (e: any) {
                                if (e.code !== 'P2002') throw e;
                            }
                        }
                    }
                }
            }
        }
    }
}