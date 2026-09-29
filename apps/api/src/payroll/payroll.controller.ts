import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollService, responsibleOrdersWhere } from './payroll.service';
import { D, ZERO, sumOf, toNum } from '../common/utils/money';
import { kzCurrentMonth, kzMonthBounds } from '../common/utils/business-date';

const SCHEME_TYPES = ['FIXED', 'PERCENT', 'HYBRID'];
const PERCENT_BASES = ['MARGIN', 'ORDER_AMOUNT'];

/**
 * Поля схемы — перечислены руками и проверены.
 *
 * Раньше сюда шло что угодно: отрицательный оклад, процент 5000 (база его
 * не вмещает — сохранение падало ошибкой сервера) или выдуманный тип схемы.
 */
function schemeData(dto: any) {
    const type = dto?.type;
    if (!SCHEME_TYPES.includes(type)) {
        throw new BadRequestException('Неизвестный тип схемы');
    }
    const fixedAmount = Number(dto.fixedAmount || 0);
    const percentValue = Number(dto.percentValue || 0);
    if (!Number.isFinite(fixedAmount) || fixedAmount < 0) {
        throw new BadRequestException('Оклад не может быть отрицательным');
    }
    if (!Number.isFinite(percentValue) || percentValue < 0 || percentValue > 100) {
        throw new BadRequestException('Процент — от 0 до 100');
    }
    const percentBase = dto.percentBase || 'MARGIN';
    if (!PERCENT_BASES.includes(percentBase)) {
        throw new BadRequestException('Процент считается от маржи или от суммы рейса');
    }
    const accrualStatus = dto.accrualStatus || 'COMPLETED';
    if (typeof accrualStatus !== 'string') {
        throw new BadRequestException('Некорректный момент начисления');
    }
    return {
        type,
        fixedAmount,
        percentValue,
        percentBase,
        accrualStatus,
        isActive: dto.isActive !== undefined ? !!dto.isActive : true,
    };
}

/** Кто в зарплатной ведомости: без водителей и получателей груза. */
const NOT_ON_PAYROLL: UserRole[] = [UserRole.DRIVER, UserRole.RECIPIENT];

/** Почему процент по рейсу обнулён — словами для сотрудника. */
function reversedReason(snapshot: any): string | null {
    switch (snapshot?._reversedReason) {
        case 'order_cancelled': return 'рейс отменён';
        case 'responsible_changed': return 'рейс передан другому менеджеру';
        case 'payment_cancelled': return 'оплата снята — вернётся, когда заказчик оплатит';
        default: return null;
    }
}

function getMonthsRange(fromStr: string, toStr: string): string[] {
    try {
        const start = new Date(fromStr + '-02');
        const end = new Date(toStr + '-02');
        const result: string[] = [];
        const current = new Date(start);
        while (current <= end) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            result.push(`${y}-${m}`);
            current.setMonth(current.getMonth() + 1);
        }
        return result;
    } catch {
        return [];
    }
}

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly payrollService: PayrollService,
    ) {}

    // ==================== ADMIN ENDPOINTS ====================

    @Get('schemes')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async getSchemes(@Request() req: any) {
        const companyId = req.user.companyId;
        const schemes = await this.prisma.payrollScheme.findMany({
            where: { companyId },
            orderBy: { userId: 'asc' },
        });

        const userIds = schemes.map(s => s.userId).filter((id): id is string => !!id);
        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        return schemes.map(s => ({
            ...s,
            user: s.userId ? userMap.get(s.userId) : null,
        }));
    }

    @Put('schemes')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async upsertGeneralScheme(@Request() req: any, @Body() dto: any) {
        const companyId = req.user.companyId;
        const data = schemeData(dto);
        const existing = await this.prisma.payrollScheme.findFirst({
            where: { companyId, userId: null },
        });
        if (existing) {
            return this.prisma.payrollScheme.update({
                where: { id: existing.id },
                data,
            });
        } else {
            return this.prisma.payrollScheme.create({
                data: { companyId, userId: null, ...data },
            });
        }
    }

    @Put('schemes/user/:userId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async upsertPersonalScheme(@Param('userId') userId: string, @Request() req: any, @Body() dto: any) {
        const companyId = req.user.companyId;
        const user = await this.prisma.user.findFirst({
            where: {
                id: userId,
                OR: [
                    { companyId },
                    { userCompanyRelations: { some: { companyId } } }
                ]
            },
        });
        if (!user) {
            throw new BadRequestException('Пользователь не найден в вашей компании');
        }

        const data = schemeData(dto);
        const existing = await this.prisma.payrollScheme.findFirst({
            where: { companyId, userId },
        });
        if (existing) {
            return this.prisma.payrollScheme.update({
                where: { id: existing.id },
                data,
            });
        } else {
            return this.prisma.payrollScheme.create({
                data: { companyId, userId, ...data },
            });
        }
    }

    @Delete('schemes/user/:userId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async deletePersonalScheme(@Param('userId') userId: string, @Request() req: any) {
        const companyId = req.user.companyId;
        const existing = await this.prisma.payrollScheme.findFirst({
            where: { companyId, userId },
        });
        if (!existing) {
            throw new NotFoundException('Персональная схема не найдена');
        }
        return this.prisma.payrollScheme.delete({
            where: { id: existing.id },
        });
    }

    @Get('kpi-rules')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async getKpiRules(@Request() req: any) {
        const rules = await this.prisma.payrollKpiRule.findMany({
            where: { companyId: req.user.companyId },
            orderBy: { createdAt: 'desc' },
        });

        const userIds = rules.map(r => r.userId).filter((id): id is string => !!id);
        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        return rules.map(r => ({
            ...r,
            user: r.userId ? userMap.get(r.userId) : null,
        }));
    }

    @Post('kpi-rules')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async createKpiRule(@Request() req: any, @Body() dto: any) {
        const companyId = req.user.companyId;
        if (dto.userId) {
            const user = await this.prisma.user.findFirst({
                where: {
                    id: dto.userId,
                    OR: [
                        { companyId },
                        { userCompanyRelations: { some: { companyId } } }
                    ]
                },
            });
            if (!user) {
                throw new BadRequestException('Пользователь не найден в вашей компании');
            }
        }
        const threshold = Number(dto.threshold);
        const bonusAmount = Number(dto.bonusAmount);
        if (!Number.isInteger(threshold) || threshold < 1) {
            throw new BadRequestException('Норма — целое число рейсов, не меньше одного');
        }
        if (!Number.isFinite(bonusAmount) || bonusAmount < 0) {
            throw new BadRequestException('Бонус не может быть отрицательным');
        }
        if ((dto.metric || 'COMPLETED_ORDERS_MONTH') !== 'COMPLETED_ORDERS_MONTH') {
            throw new BadRequestException('Неизвестный показатель для бонуса');
        }
        return this.prisma.payrollKpiRule.create({
            data: {
                companyId,
                userId: dto.userId || null,
                metric: 'COMPLETED_ORDERS_MONTH',
                threshold,
                bonusAmount,
                isActive: dto.isActive !== undefined ? !!dto.isActive : true,
            },
        });
    }

    @Delete('kpi-rules/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async deleteKpiRule(@Param('id') id: string, @Request() req: any) {
        const rule = await this.prisma.payrollKpiRule.findFirst({
            where: { id, companyId: req.user.companyId },
        });
        if (!rule) {
            throw new NotFoundException('Правило KPI не найдено');
        }
        return this.prisma.payrollKpiRule.delete({
            where: { id },
        });
    }

    @Get('report')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async getReport(
        @Query('from') from: string,
        @Query('to') to: string,
        @Request() req: any,
    ) {
        const companyId = req.user.companyId;
        const currentMonth = kzCurrentMonth();
        const fromMonth = from || currentMonth;
        const toMonth = to || currentMonth;

        const months = getMonthsRange(fromMonth, toMonth);
        if (months.length === 0) {
            throw new BadRequestException('Некорректный формат периода');
        }

        // Удалённый сотрудник остаётся в отчёте только за те месяцы, когда
        // ему что-то начислено: его история не пропадает, но и оклад ему
        // больше не приписывается.
        const accruedUserIds = (await this.prisma.payrollAccrual.findMany({
            where: { companyId, periodMonth: { in: months } },
            select: { userId: true },
            distinct: ['userId'],
        })).map(a => a.userId);

        const users = await this.prisma.user.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { companyId },
                            { userCompanyRelations: { some: { companyId } } }
                        ],
                    },
                    { OR: [{ isActive: true }, { id: { in: accruedUserIds } }] },
                ],
                role: { notIn: NOT_ON_PAYROLL },
            },
            select: {
                id: true, firstName: true, lastName: true, role: true, companyId: true,
                // Роль человека именно в этой организации: в соседней он может
                // быть бухгалтером, а здесь — менеджером.
                userCompanyRelations: { where: { companyId }, select: { role: true } },
            },
        });

        const { start } = kzMonthBounds(months[0]);
        const { end } = kzMonthBounds(months[months.length - 1]);

        const rows = [];
        let totalSalary = ZERO;
        let totalPercent = ZERO;
        let totalKpi = ZERO;
        let grandTotal = ZERO;

        for (const user of users) {
            const role = user.userCompanyRelations[0]?.role ?? user.role;
            if (NOT_ON_PAYROLL.includes(role)) continue;

            // Lazy calculation of SALARY and KPI
            await this.payrollService.ensureMonthlyAccruals(companyId, user.id, months);

            // Только начисления этой организации: у человека в двух компаниях
            // зарплата одной не должна попадать в ведомость другой.
            const accruals = await this.prisma.payrollAccrual.findMany({
                where: {
                    companyId,
                    userId: user.id,
                    periodMonth: { in: months },
                },
            });

            const salary = sumOf(accruals.filter(a => a.kind === 'SALARY'), (a) => a.amount);
            const percentTotal = sumOf(accruals.filter(a => a.kind === 'PERCENT'), (a) => a.amount);
            const kpiTotal = sumOf(accruals.filter(a => a.kind === 'KPI'), (a) => a.amount);
            const total = salary.plus(percentTotal).plus(kpiTotal);

            // Завершённые рейсы, которые человек вёл в этой компании
            const ordersCount = await this.prisma.order.count({
                where: {
                    AND: [
                        responsibleOrdersWhere(companyId, user.id),
                        { status: 'COMPLETED', completedAt: { gte: start, lt: end } },
                    ],
                },
            });

            rows.push({
                userId: user.id,
                name: `${user.lastName || ''} ${user.firstName || ''}`.trim() || 'Сотрудник',
                role,
                salary: toNum(salary),
                percentTotal: toNum(percentTotal),
                kpiTotal: toNum(kpiTotal),
                total: toNum(total),
                ordersCount,
            });

            totalSalary = totalSalary.plus(salary);
            totalPercent = totalPercent.plus(percentTotal);
            totalKpi = totalKpi.plus(kpiTotal);
            grandTotal = grandTotal.plus(total);
        }

        return {
            report: rows,
            totals: {
                salary: toNum(totalSalary),
                percentTotal: toNum(totalPercent),
                kpiTotal: toNum(totalKpi),
                total: toNum(grandTotal),
            },
        };
    }

    // ==================== MANAGER ENDPOINTS ====================

    @Get('my/summary')
    async getMySummary(@Request() req: any) {
        const userId = req.user.id || req.user.sub;
        const companyId = req.user.companyId;
        const currentMonth = kzCurrentMonth();

        if (!companyId) {
            return { total: 0, salary: 0, percentTotal: 0, kpiTotal: 0, ordersCount: 0, hasScheme: false };
        }

        await this.payrollService.ensureMonthlyAccruals(companyId, userId, [currentMonth]);

        const accruals = await this.prisma.payrollAccrual.findMany({
            where: {
                companyId,
                userId,
                periodMonth: currentMonth,
            },
        });

        const salary = sumOf(accruals.filter(a => a.kind === 'SALARY'), (a) => a.amount);
        const percentTotal = sumOf(accruals.filter(a => a.kind === 'PERCENT'), (a) => a.amount);
        const kpiTotal = sumOf(accruals.filter(a => a.kind === 'KPI'), (a) => a.amount);

        const { start, end } = kzMonthBounds(currentMonth);
        const ordersCount = await this.prisma.order.count({
            where: {
                AND: [
                    responsibleOrdersWhere(companyId, userId),
                    { status: 'COMPLETED', completedAt: { gte: start, lt: end } },
                ],
            },
        });

        const total = salary.plus(percentTotal).plus(kpiTotal);

        // Показывать ли человеку «Мою зарплату». Раньше — только при схеме
        // оклада или процента, и тот, кому компания платит одни бонусы, своих
        // денег в кабинете не видел вовсе, хотя они ему начислены.
        const scheme = await this.payrollService.getSchemeFor(companyId, userId);
        const hasScheme = !!scheme
            || accruals.length > 0
            || (await this.prisma.payrollKpiRule.count({
                where: { companyId, isActive: true, OR: [{ userId: null }, { userId }] },
            })) > 0;

        return {
            total,
            salary,
            percentTotal,
            kpiTotal,
            ordersCount,
            hasScheme,
        };
    }

    @Get('my')
    async getMyReport(
        @Query('from') from: string,
        @Query('to') to: string,
        @Request() req: any,
    ) {
        const userId = req.user.id || req.user.sub;
        const companyId = req.user.companyId;
        const currentMonth = kzCurrentMonth();
        const fromMonth = from || currentMonth;
        const toMonth = to || currentMonth;

        const months = getMonthsRange(fromMonth, toMonth);
        if (months.length === 0) {
            throw new BadRequestException('Некорректный формат периода');
        }

        if (!companyId) {
            return { accruals: [], totals: { salary: 0, percentTotal: 0, kpiTotal: 0, total: 0 } };
        }

        await this.payrollService.ensureMonthlyAccruals(companyId, userId, months);

        const accruals = await this.prisma.payrollAccrual.findMany({
            where: {
                companyId,
                userId,
                periodMonth: { in: months },
            },
            orderBy: { createdAt: 'desc' },
        });

        const orderIds = accruals.map(a => a.orderId).filter((id): id is string => !!id);
        const orders = await this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true, createdAt: true, completedAt: true },
        });
        const orderMap = new Map(orders.map(o => [o.id, o]));

        const salary = sumOf(accruals.filter(a => a.kind === 'SALARY'), (a) => a.amount);
        const percentTotal = sumOf(accruals.filter(a => a.kind === 'PERCENT'), (a) => a.amount);
        const kpiTotal = sumOf(accruals.filter(a => a.kind === 'KPI'), (a) => a.amount);
        const total = salary.plus(percentTotal).plus(kpiTotal);

        const mappedAccruals = accruals
            // Снятый бонус и убранный оклад — нулевые записи-следы; в списке
            // «Оклад по месяцам» и «Бонусы» они выглядели бы как «0 ₸ за август».
            // Обнулённый процент оставляем: человеку важно видеть, куда делись
            // деньги за рейс, и причина пишется рядом.
            .filter(a => a.kind === 'PERCENT' || !D(a.amount).isZero())
            .map(a => {
                const ord = a.orderId ? orderMap.get(a.orderId) : null;
                const snapshot = a.schemeSnapshot as any;
                return {
                    id: a.id,
                    kind: a.kind,
                    amount: a.amount,
                    periodMonth: a.periodMonth,
                    baseAmount: a.baseAmount,
                    percentValue: snapshot?.percentValue ?? null,
                    percentBase: snapshot?.percentBase ?? null,
                    threshold: snapshot?.threshold ?? null,
                    reversedReason: reversedReason(snapshot),
                    createdAt: a.createdAt,
                    order: ord ? {
                        id: ord.id,
                        orderNumber: ord.orderNumber,
                        date: ord.completedAt || ord.createdAt,
                    } : null,
                };
            });

        return {
            accruals: mappedAccruals,
            totals: {
                salary,
                percentTotal,
                kpiTotal,
                total,
            },
        };
    }
}
