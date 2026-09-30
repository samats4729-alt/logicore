import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollService, PendingTrip, bonusRuleView, responsibleOrdersWhere, schemeView } from './payroll.service';
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

/** «Фамилия Имя» — как человек подписан в ведомости. */
function personName(u: { lastName?: string | null; firstName?: string | null }): string {
    return [u.lastName, u.firstName].filter(Boolean).join(' ').trim();
}

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

    /**
     * Бонусы за план — включить или выключить разом.
     *
     * Галочка на странице «Зарплата». Выключение правила не удаляет: они
     * ставятся на паузу и возвращаются той же галочкой, чтобы руководителю
     * не заводить их заново. Бонус за текущий месяц на паузе снимается,
     * прошлые месяцы остаются как были.
     */
    @Put('kpi-rules/active')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async setKpiRulesActive(@Request() req: any, @Body() dto: { isActive?: unknown }) {
        if (typeof dto?.isActive !== 'boolean') {
            throw new BadRequestException('Не понял: включить бонусы или выключить');
        }
        const { count } = await this.prisma.payrollKpiRule.updateMany({
            where: { companyId: req.user.companyId },
            data: { isActive: dto.isActive },
        });
        return { isActive: dto.isActive, rules: count };
    }

    /**
     * Свой бонус за план у сотрудника — одним действием из окна «Условия
     * оплаты». Свой бонус заменяет общий. Правило у человека одно: если их
     * было несколько (заводили по одному в старом окне), остаётся первое.
     */
    @Put('kpi-rules/user/:userId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async setPersonalKpiRule(@Param('userId') userId: string, @Request() req: any, @Body() dto: any) {
        const companyId = req.user.companyId;
        await this.findMember(companyId, userId);
        const threshold = Number(dto?.threshold);
        const bonusAmount = Number(dto?.bonusAmount);
        if (!Number.isInteger(threshold) || threshold < 1) {
            throw new BadRequestException('Норма — целое число рейсов, не меньше одного');
        }
        if (!Number.isFinite(bonusAmount) || bonusAmount < 0) {
            throw new BadRequestException('Бонус не может быть отрицательным');
        }
        const existing = await this.prisma.payrollKpiRule.findMany({
            where: { companyId, userId },
            orderBy: { createdAt: 'asc' },
        });
        if (existing.length) {
            const [first, ...rest] = existing;
            if (rest.length) {
                await this.prisma.payrollKpiRule.deleteMany({ where: { id: { in: rest.map(r => r.id) } } });
            }
            return bonusRuleView(await this.prisma.payrollKpiRule.update({
                where: { id: first.id },
                data: { threshold, bonusAmount, isActive: true },
            }));
        }
        return bonusRuleView(await this.prisma.payrollKpiRule.create({
            data: { companyId, userId, metric: 'COMPLETED_ORDERS_MONTH', threshold, bonusAmount, isActive: true },
        }));
    }

    /** Убрать свой бонус — сотрудник снова на общем. */
    @Delete('kpi-rules/user/:userId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async deletePersonalKpiRule(@Param('userId') userId: string, @Request() req: any) {
        const companyId = req.user.companyId;
        await this.findMember(companyId, userId);
        const { count } = await this.prisma.payrollKpiRule.deleteMany({ where: { companyId, userId } });
        return { deleted: count };
    }

    /**
     * Все сотрудники и как каждому платят — вкладка «Условия оплаты».
     *
     * Раньше на странице был список только тех, у кого свои условия, и
     * остальных не было видно вовсе: чтобы понять, сколько получает человек,
     * приходилось складывать в уме общую схему, свою и бонусы.
     */
    @Get('employees')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async getEmployees(@Request() req: any) {
        const companyId = req.user.companyId;
        // Общие условия, если ещё остались, раскладываем каждому как свои.
        await this.payrollService.individualizeTerms(companyId);
        const [users, terms] = await Promise.all([
            this.payrollUsers(companyId),
            this.loadTerms(companyId),
        ]);
        return {
            general: terms.general,
            generalBonusRules: terms.generalBonusRules,
            bonusesEnabled: terms.bonusesEnabled,
            employees: users.map(u => ({
                id: u.id,
                firstName: u.firstName,
                lastName: u.lastName,
                middleName: u.middleName,
                name: personName(u),
                role: u.role,
                ...terms.of(u.id),
            })),
        };
    }

    /**
     * Карточка сотрудника за месяц: за что начислено, что ещё придёт,
     * сколько рейсов до бонуса и как ему платят.
     */
    @Get('employee/:userId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async getEmployeeMonth(@Param('userId') userId: string, @Query('month') month: string, @Request() req: any) {
        const companyId = req.user.companyId;
        const member = await this.findMember(companyId, userId);
        const months = getMonthsRange(month || kzCurrentMonth(), month || kzCurrentMonth());
        if (months.length !== 1) {
            throw new BadRequestException('Некорректный формат месяца');
        }
        return {
            employee: { id: member.id, name: personName(member), role: member.role },
            ...(await this.monthDetail(companyId, userId, months)),
        };
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

        // Общие условия, если ещё остались, раскладываем каждому как свои.
        await this.payrollService.individualizeTerms(companyId);

        // Удалённый сотрудник остаётся в отчёте только за те месяцы, когда
        // ему что-то начислено: его история не пропадает, но и оклад ему
        // больше не приписывается.
        const accruedUserIds = (await this.prisma.payrollAccrual.findMany({
            where: { companyId, periodMonth: { in: months } },
            select: { userId: true },
            distinct: ['userId'],
        })).map(a => a.userId);

        const [users, terms] = await Promise.all([
            this.payrollUsers(companyId, accruedUserIds),
            this.loadTerms(companyId),
        ]);

        const { start } = kzMonthBounds(months[0]);
        const { end } = kzMonthBounds(months[months.length - 1]);

        // Что ещё придёт — только если в период попал текущий месяц: у
        // прошлых месяцев «ждёт оплаты» уже не про них.
        const pending = months.includes(currentMonth)
            ? await this.payrollService.pendingPercent(companyId, users.map(u => u.id))
            : new Map();

        const rows = [];
        let totalSalary = ZERO;
        let totalPercent = ZERO;
        let totalKpi = ZERO;
        let grandTotal = ZERO;
        let totalPending = ZERO;

        for (const user of users) {
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
            const pendingPercent = sumOf(pending.get(user.id) ?? [], (p: PendingTrip) => p.amount);

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
                name: personName(user) || 'Сотрудник',
                role: user.role,
                isActive: user.isActive,
                salary: toNum(salary),
                percentTotal: toNum(percentTotal),
                kpiTotal: toNum(kpiTotal),
                total: toNum(total),
                pendingPercent: toNum(pendingPercent),
                ordersCount,
                ...terms.of(user.id),
            });

            totalSalary = totalSalary.plus(salary);
            totalPercent = totalPercent.plus(percentTotal);
            totalKpi = totalKpi.plus(kpiTotal);
            grandTotal = grandTotal.plus(total);
            totalPending = totalPending.plus(pendingPercent);
        }

        return {
            report: rows,
            totals: {
                salary: toNum(totalSalary),
                percentTotal: toNum(totalPercent),
                kpiTotal: toNum(totalKpi),
                total: toNum(grandTotal),
                pendingPercent: toNum(totalPending),
            },
            // Бонусы за план в компании включены — колонка «Бонусы» нужна.
            // Не включены и ничего не начислено — колонку не показываем.
            bonusesEnabled: terms.bonusesEnabled,
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
            return {
                accruals: [], totals: { salary: 0, percentTotal: 0, kpiTotal: 0, total: 0 }, bonusesEnabled: false,
                terms: null, bonusProgress: [], planTrips: [], pending: [], pendingTotal: 0,
            };
        }

        return this.monthDetail(companyId, userId, months);
    }

    // ==================== внутреннее ====================

    /** Человек из этой компании — или отказ. */
    private async findMember(companyId: string, userId: string) {
        const user = await this.prisma.user.findFirst({
            where: {
                id: userId,
                OR: [
                    { companyId },
                    { userCompanyRelations: { some: { companyId } } },
                ],
            },
            select: {
                id: true, firstName: true, lastName: true, middleName: true, role: true, companyId: true,
                userCompanyRelations: { where: { companyId }, select: { role: true } },
            },
        });
        if (!user) {
            throw new NotFoundException('Сотрудник не найден в вашей компании');
        }
        return { ...user, role: user.userCompanyRelations[0]?.role ?? user.role };
    }

    /**
     * Кто в ведомости: работающие сотрудники компании без водителей и
     * получателей груза. `alsoIds` — удалённые, у которых за период что-то
     * начислено: их история не пропадает.
     */
    private async payrollUsers(companyId: string, alsoIds: string[] = []) {
        const users = await this.prisma.user.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { companyId },
                            { userCompanyRelations: { some: { companyId } } },
                        ],
                    },
                    { OR: [{ isActive: true }, { id: { in: alsoIds } }] },
                ],
                role: { notIn: NOT_ON_PAYROLL },
            },
            select: {
                id: true, firstName: true, lastName: true, middleName: true, role: true, isActive: true,
                // Роль человека именно в этой организации: в соседней он может
                // быть бухгалтером, а здесь — менеджером.
                userCompanyRelations: { where: { companyId }, select: { role: true } },
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });
        return users
            .map(u => ({ ...u, role: u.userCompanyRelations[0]?.role ?? u.role }))
            .filter(u => !NOT_ON_PAYROLL.includes(u.role));
    }

    /**
     * Условия оплаты всех сотрудников одним заходом в базу.
     *
     * Правило то же, что у начислений: своя схема заменяет общую, свой бонус
     * заменяет общий.
     */
    private async loadTerms(companyId: string) {
        const [schemes, rules] = await Promise.all([
            this.prisma.payrollScheme.findMany({ where: { companyId, isActive: true } }),
            this.prisma.payrollKpiRule.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } }),
        ]);
        const general = schemes.find(s => s.userId === null) ?? null;
        const active = rules.filter(r => r.isActive);
        const generalBonusRules = active.filter(r => r.userId === null);
        return {
            general: general ? schemeView(general) : null,
            generalBonusRules: generalBonusRules.map(bonusRuleView),
            bonusesEnabled: active.length > 0,
            of: (userId: string) => {
                const own = schemes.find(s => s.userId === userId) ?? null;
                const ownRules = active.filter(r => r.userId === userId);
                const scheme = own ?? general;
                return {
                    scheme: scheme ? schemeView(scheme) : null,
                    schemeSource: own ? 'personal' : general ? 'general' : null,
                    bonusRules: (ownRules.length ? ownRules : generalBonusRules).map(bonusRuleView),
                    bonusSource: ownRules.length ? 'personal' : 'general',
                };
            },
        };
    }

    /**
     * Месяц одного человека: начисления с расшифровкой, что ещё придёт,
     * сколько рейсов до бонуса и как ему платят. Одно и то же для карточки
     * сотрудника у руководителя и для «Моей зарплаты».
     */
    private async monthDetail(companyId: string, userId: string, months: string[]) {
        const currentMonth = kzCurrentMonth();
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

        const terms = await this.payrollService.termsFor(companyId, userId);
        // Прогресс к бонусу — по текущему месяцу, если он в периоде, иначе по
        // последнему месяцу периода.
        const progressMonth = months.includes(currentMonth) ? currentMonth : months[months.length - 1];
        const bonusProgress = await this.payrollService.bonusProgress(companyId, userId, progressMonth, terms.bonusRules);
        const pending = months.includes(currentMonth)
            ? (await this.payrollService.pendingPercent(companyId, [userId])).get(userId) ?? []
            : [];
        // За какие рейсы бонус — тем, у кого бонус назначен или уже начислен.
        const planTrips = terms.bonusRules.length > 0 || !kpiTotal.isZero()
            ? await this.payrollService.planTrips(companyId, userId, progressMonth)
            : [];

        return {
            accruals: mappedAccruals,
            totals: {
                salary,
                percentTotal,
                kpiTotal,
                total,
            },
            // Есть ли у человека бонус за план: без него раздел «Бонусы» на его
            // странице — пустой блок про то, чего в компании нет.
            bonusesEnabled: terms.bonusRules.length > 0,
            terms,
            bonusProgress,
            planTrips,
            pending,
            pendingTotal: toNum(sumOf(pending, (p) => p.amount)),
        };
    }
}
