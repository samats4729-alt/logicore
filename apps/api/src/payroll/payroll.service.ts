import { Injectable, Logger } from '@nestjs/common';
import { PayrollKpiRule, PayrollScheme, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    FinanceCalculatorService,
    PAYMENT_SHARE_SELECT,
    sharesAsPayments,
} from '../accounting/services/finance-calculator.service';
import { D, Money, ZERO, roundMoney } from '../common/utils/money';
import { kzCurrentMonth, kzMonthBounds } from '../common/utils/business-date';

/** Кому начисляется процент по рейсу: человек и компания, которая ему платит. */
interface Payee {
    companyId: string;
    userId: string;
}

/**
 * Процент, который ещё придёт.
 *
 * `reason`: `unpaid` — рейс завершён, ждёт оплаты заказчика;
 * `in_progress_paid` — рейс в работе, процент придёт после оплаты;
 * `in_progress` — рейс в работе, процент придёт после завершения.
 */
export interface PendingTrip {
    orderId: string;
    orderNumber: string;
    status: string;
    reason: 'unpaid' | 'in_progress_paid' | 'in_progress';
    baseAmount: number;
    percentValue: number;
    percentBase: string;
    amount: number;
}

/** Схема оплаты для экрана — числами, без служебных полей. */
export function schemeView(s: PayrollScheme) {
    return {
        id: s.id,
        userId: s.userId,
        type: s.type,
        fixedAmount: D(s.fixedAmount).toNumber(),
        percentValue: D(s.percentValue).toNumber(),
        percentBase: s.percentBase,
        accrualStatus: s.accrualStatus,
        isActive: s.isActive,
    };
}

/** Бонус за план для экрана. */
export function bonusRuleView(r: PayrollKpiRule) {
    return {
        id: r.id,
        userId: r.userId,
        threshold: r.threshold,
        bonusAmount: D(r.bonusAmount).toNumber(),
        personal: r.userId !== null,
        isActive: r.isActive,
    };
}

/**
 * Рейсы, которые человек ведёт в этой компании.
 *
 * Ответственный за рейс — тот, кто стоит в карточке рейса («Ответственный ·
 * компания»). Раньше зарплата смотрела на другое поле — кто завёл заявку, — и
 * процент, бонус и число рейсов доставались создателю: помощник вбивал заявку
 * на менеджера, руководитель передавал рейс другому, а начисление уходило не
 * тому, кто вёл рейс.
 *
 * Заявки, заведённые до появления ответственных по компаниям, ответственного
 * в карточке не имеют — для них остаётся старое поле.
 */
export function responsibleOrdersWhere(companyId: string, userId: string): Prisma.OrderWhereInput {
    return {
        OR: [
            { responsibles: { some: { companyId, userId } } },
            { responsibles: { none: {} }, responsibleManagerId: userId, responsibleManager: { companyId } },
        ],
    };
}

/**
 * Рейсы, которые идут в зачёт плана за месяц: человек их вёл, и они
 * завершены в этом месяце. Одно условие на три места — начисление бонуса,
 * прогресс «осталось N рейсов» и список рейсов в карточке, — чтобы список
 * всегда сходился с числом, за которое заплатили.
 */
export function planTripsWhere(companyId: string, userId: string, periodMonth: string): Prisma.OrderWhereInput {
    const { start, end } = kzMonthBounds(periodMonth);
    return {
        AND: [
            responsibleOrdersWhere(companyId, userId),
            { status: 'COMPLETED', completedAt: { gte: start, lt: end } },
        ],
    };
}

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
            // процент по этой заявке сторнируем — каждому, кому он начислялся.
            // Саму запись не удаляем (это финансовый след) — обнуляем сумму и
            // помечаем причину в снимке.
            if (normalizedTrigger === 'CANCELLED') {
                const accrued = await this.prisma.payrollAccrual.findMany({
                    where: { orderId, kind: 'PERCENT' },
                });
                for (const accrual of accrued) {
                    await this.reversePercent(accrual, 'order_cancelled');
                }
                return;
            }

            const order = await this.loadOrder(orderId);
            if (!order) return;

            // Процент получает ответственный от каждой компании-участника:
            // у экспедитора свой менеджер и своя схема, у заказчика — свои.
            for (const payee of this.payeesOf(order)) {
                const scheme = await this.getSchemeFor(payee.companyId, payee.userId);
                if (!scheme || !scheme.isActive || scheme.accrualStatus !== normalizedTrigger) continue;
                // Если тип FIXED, проценты не начисляем
                if (scheme.type === 'FIXED') continue;
                await this.accruePercent(order, payee, scheme);
            }
        } catch (error: any) {
            this.logger.warn(`Failed to process payroll trigger for order ${orderId}: ${error.message}`);
        }
    }

    /**
     * Рейс передали другому менеджеру.
     *
     * Если процент по нему этой компании уже начислен (рейс завершён или
     * оплачен), он переходит новому ответственному: у прежнего сторнируется,
     * новому начисляется по его схеме. Если процент ещё не начислялся —
     * делать нечего, он начислится, когда рейс дойдёт до статуса из схемы.
     */
    async onResponsibleChanged(orderId: string, companyId: string) {
        try {
            const order = await this.loadOrder(orderId);
            if (!order || order.status === 'CANCELLED') return;

            const accrued = await this.prisma.payrollAccrual.findMany({
                where: { orderId, companyId, kind: 'PERCENT', NOT: { amount: 0 } },
            });
            if (!accrued.length) return;

            const responsible = order.responsibles.find((r) => r.companyId === companyId);
            if (!responsible) return;

            const scheme = await this.getSchemeFor(companyId, responsible.userId);
            if (scheme && scheme.isActive && scheme.type !== 'FIXED' && this.triggerReached(order, scheme.accrualStatus)) {
                // Начислит новому и сторнирует остальным в этой компании.
                await this.accruePercent(order, { companyId, userId: responsible.userId }, scheme);
                return;
            }
            for (const accrual of accrued) {
                if (accrual.userId !== responsible.userId) await this.reversePercent(accrual, 'responsible_changed');
            }
        } catch (error: any) {
            this.logger.warn(`Failed to move payroll accrual for order ${orderId}: ${error.message}`);
        }
    }

    /**
     * Заявка перестала быть оплаченной: оплату удалили, вернули или подняли
     * цену рейса.
     *
     * Процент, начисленный именно за оплату (схема «когда заказчик оплатил»),
     * снимается — и вернётся, когда заказчик доплатит. Раньше он оставался у
     * менеджера навсегда: начисление срабатывало на оплату, а на её отмену —
     * нет. Процент за завершение рейса это не трогает.
     */
    async revokeUnpaidPercent(orderId: string) {
        try {
            const accrued = await this.prisma.payrollAccrual.findMany({
                where: { orderId, kind: 'PERCENT', NOT: { amount: 0 } },
            });
            const forPayment = accrued.filter((a) => (a.schemeSnapshot as any)?.accrualStatus === 'CUSTOMER_PAID');
            if (!forPayment.length) return;

            const order = await this.prisma.order.findUnique({
                where: { id: orderId },
                select: { isCustomerPaid: true },
            });
            if (!order || order.isCustomerPaid) return;

            for (const accrual of forPayment) {
                await this.reversePercent(accrual, 'payment_cancelled');
            }
        } catch (error: any) {
            this.logger.warn(`Failed to revoke unpaid payroll accrual for order ${orderId}: ${error.message}`);
        }
    }

    async ensureMonthlyAccruals(companyId: string, userId: string, months: string[]) {
        const nowStr = kzCurrentMonth();
        const futureCut = months.filter(m => m <= nowStr);
        if (!futureCut.length) return;

        // Оклад и бонусы — только за месяцы, когда человек работал в компании.
        // Раньше отчёт «с января» начислял оклад и тем, кого приняли в августе,
        // и тем, кого давно удалили.
        const member = await this.membershipOf(companyId, userId);
        if (!member || !member.isActive) return;
        const filteredMonths = futureCut.filter(m => m >= member.since);

        // Схему и правила читаем один раз и только когда они понадобятся:
        // закрытые месяцы их не спрашивают.
        let loaded = false;
        let scheme: PayrollScheme | null = null;
        let kpiRules: PayrollKpiRule[] = [];

        for (const periodMonth of filteredMonths) {
            // Закрытый период не трогаем
            if (await this.isClosed(companyId, periodMonth)) continue;

            if (!loaded) {
                scheme = await this.getSchemeFor(companyId, userId);
                kpiRules = await this.bonusRulesFor(companyId, userId);
                loaded = true;
            }

            // 1. Оклад (SALARY)
            if (scheme && scheme.isActive) {
                await this.ensureSalary(companyId, userId, periodMonth, scheme, periodMonth === nowStr);
            }

            // 2. Бонусы (KPI). Не зависят от схемы: компания может платить
            // оклад мимо системы и заводить здесь только бонусы за рейсы.
            for (const rule of kpiRules) {
                await this.ensureKpi(companyId, userId, periodMonth, rule);
            }

            // Бонус за план выключили или правило удалили — в текущем месяце
            // этого бонуса больше нет. Прошлые месяцы остаются как были.
            if (periodMonth === nowStr) {
                await this.dropInactiveKpi(companyId, userId, periodMonth, kpiRules.map(r => r.id));
            }
        }
    }

    /**
     * Бонусы за план, которые действуют для человека.
     *
     * Свой бонус заменяет общий, а не складывается с ним — так же, как свои
     * условия оплаты заменяют общую схему. Раньше они суммировались: Марии
     * поставили свой план «2 рейса — 30 000», а общий «3 рейса — 50 000»
     * продолжал считаться поверх, и в ведомости выходило два бонуса.
     */
    async bonusRulesFor(companyId: string, userId: string): Promise<PayrollKpiRule[]> {
        const rules = await this.prisma.payrollKpiRule.findMany({
            where: {
                companyId,
                isActive: true,
                OR: [{ userId: null }, { userId }],
            },
            orderBy: { createdAt: 'asc' },
        });
        const personal = rules.filter(r => r.userId === userId);
        return personal.length ? personal : rules.filter(r => !r.userId);
    }

    /**
     * Общие условия → свои у каждого. Один раз на компанию.
     *
     * Владелец (30.09.2026) убрал деление на «общие» и «свои»: у каждого
     * сотрудника просто его оклад, процент и бонус, а одинаковое многим
     * назначают, отметив их галочками. Чтобы никто не потерял деньги, общая
     * схема и общий бонус раскладываются каждому работающему сотруднику как
     * его собственные — с теми же цифрами, — после чего общая схема
     * выключается, а общий бонус удаляется. Новому сотруднику после этого
     * ничего не начисляется, пока ему не назначат.
     *
     * Вызывается при открытии экранов зарплаты руководителем. Повторный
     * вызов ничего не делает: общих условий уже нет.
     */
    async individualizeTerms(companyId: string) {
        const [general, generalRules] = await Promise.all([
            this.prisma.payrollScheme.findFirst({ where: { companyId, userId: null, isActive: true } }),
            this.prisma.payrollKpiRule.findMany({ where: { companyId, userId: null }, orderBy: { createdAt: 'asc' } }),
        ]);
        if (!general && !generalRules.length) return;

        const members = await this.payrollMemberIds(companyId);

        await this.prisma.$transaction(async (tx) => {
            if (general) {
                const own = await tx.payrollScheme.findMany({
                    where: { companyId, userId: { in: members } },
                    select: { id: true, userId: true, isActive: true },
                });
                const copy = {
                    type: general.type,
                    fixedAmount: general.fixedAmount,
                    percentValue: general.percentValue,
                    percentBase: general.percentBase,
                    accrualStatus: general.accrualStatus,
                    isActive: true,
                };
                const withOwn = new Set(own.map(s => s.userId));
                const missing = members.filter(id => !withOwn.has(id));
                if (missing.length) {
                    await tx.payrollScheme.createMany({ data: missing.map(userId => ({ companyId, userId, ...copy })) });
                }
                // Своя схема была, но выключена — человек жил на общей: даём ему её цифры.
                for (const s of own.filter(x => !x.isActive)) {
                    await tx.payrollScheme.update({ where: { id: s.id }, data: copy });
                }
                await tx.payrollScheme.update({ where: { id: general.id }, data: { isActive: false } });
            }

            if (generalRules.length) {
                const ownRules = await tx.payrollKpiRule.findMany({
                    where: { companyId, userId: { in: members } },
                    select: { userId: true },
                });
                const withOwnRule = new Set(ownRules.map(r => r.userId));
                const data = members
                    .filter(id => !withOwnRule.has(id))
                    .flatMap(userId => generalRules.map(r => ({
                        companyId,
                        userId,
                        metric: r.metric,
                        threshold: r.threshold,
                        bonusAmount: r.bonusAmount,
                        // Бонусы на паузе остаются на паузе.
                        isActive: r.isActive,
                    })));
                if (data.length) await tx.payrollKpiRule.createMany({ data });
                // Не выключаем, а удаляем: галочка «Платить бонусы» включает все
                // правила разом и вернула бы общий бонус обратно.
                await tx.payrollKpiRule.deleteMany({ where: { id: { in: generalRules.map(r => r.id) } } });
            }
        });
    }

    /** Кто получает зарплату в компании: работающие, без водителей и получателей груза. */
    private async payrollMemberIds(companyId: string): Promise<string[]> {
        const users = await this.prisma.user.findMany({
            where: {
                isActive: true,
                OR: [{ companyId }, { userCompanyRelations: { some: { companyId } } }],
            },
            select: { id: true, role: true, userCompanyRelations: { where: { companyId }, select: { role: true } } },
        });
        return users
            .filter(u => !['DRIVER', 'RECIPIENT'].includes(u.userCompanyRelations[0]?.role ?? u.role))
            .map(u => u.id);
    }

    /**
     * Как человеку платят сейчас: действующая схема (своя или общая) и
     * бонусы за план. Одним ответом — чтобы экран не складывал это сам.
     */
    async termsFor(companyId: string, userId: string) {
        const [scheme, bonusRules, anyActiveRule] = await Promise.all([
            this.getSchemeFor(companyId, userId),
            this.bonusRulesFor(companyId, userId),
            this.prisma.payrollKpiRule.count({ where: { companyId, isActive: true } }),
        ]);
        return {
            scheme: scheme ? schemeView(scheme) : null,
            schemeSource: scheme ? (scheme.userId ? 'personal' : 'general') as 'personal' | 'general' : null,
            bonusRules: bonusRules.map(bonusRuleView),
            bonusesEnabled: anyActiveRule > 0,
        };
    }

    /**
     * Сколько рейсов человек закрыл за месяц против нормы каждого бонуса.
     * Для строки «до бонуса осталось 1 рейс».
     */
    /**
     * За какие рейсы бонус за план: список завершённых за месяц рейсов
     * человека. Раньше руководитель видел только «10 из 10» и сумму, а какие
     * именно рейсы засчитаны — нигде (владелец, 30.09.2026).
     */
    async planTrips(companyId: string, userId: string, periodMonth: string) {
        const orders = await this.prisma.order.findMany({
            where: planTripsWhere(companyId, userId, periodMonth),
            select: {
                id: true,
                orderNumber: true,
                completedAt: true,
                customerCompany: { select: { name: true } },
            },
            orderBy: { completedAt: 'asc' },
        });
        return orders.map(o => ({
            id: o.id,
            orderNumber: o.orderNumber,
            completedAt: o.completedAt,
            customer: o.customerCompany?.name ?? null,
        }));
    }

    async bonusProgress(companyId: string, userId: string, periodMonth: string, rules: { id: string; threshold: number; bonusAmount: any }[]) {
        if (!rules.length) return [];
        const done = await this.prisma.order.count({ where: planTripsWhere(companyId, userId, periodMonth) });
        return rules.map(r => ({
            ruleId: r.id,
            threshold: r.threshold,
            bonusAmount: D(r.bonusAmount).toNumber(),
            done,
        }));
    }

    /**
     * Проценты, которые ещё придут: рейс не завершён или заказчик не
     * оплатил, а схема начисляет процент именно за это событие.
     *
     * Сумма — оценка по сегодняшней цене и марже; окончательная считается в
     * момент начисления. Раньше этих денег не было видно нигде, и менеджер не
     * понимал, почему у него за рейс ноль.
     */
    async pendingPercent(companyId: string, userIds: string[]): Promise<Map<string, PendingTrip[]>> {
        const result = new Map<string, PendingTrip[]>();
        if (!userIds.length) return result;

        const orders = await this.prisma.order.findMany({
            where: {
                status: { notIn: ['CANCELLED', 'DRAFT'] },
                OR: [
                    { responsibles: { some: { companyId, userId: { in: userIds } } } },
                    { responsibles: { none: {} }, responsibleManagerId: { in: userIds }, responsibleManager: { companyId } },
                ],
            },
            include: { responsibles: { select: { companyId: true, userId: true } } },
            orderBy: { createdAt: 'asc' },
        });
        if (!orders.length) return result;

        const orderIds = orders.map(o => o.id);
        const accrued = await this.prisma.payrollAccrual.findMany({
            where: { orderId: { in: orderIds }, kind: 'PERCENT', NOT: { amount: 0 } },
            select: { orderId: true, userId: true },
        });
        const accruedKey = new Set(accrued.map(a => `${a.orderId}:${a.userId}`));

        const schemes = new Map<string, PayrollScheme | null>();
        for (const userId of userIds) schemes.set(userId, await this.getSchemeFor(companyId, userId));

        // Маржу считаем разом по всем рейсам: четыре запроса вместо четырёх
        // на каждый рейс.
        const [payments, shares, incomes, expenses] = await Promise.all([
            this.prisma.payment.findMany({ where: { orderId: { in: orderIds }, isDeleted: false } }),
            this.prisma.paymentOrderShare.findMany({
                where: { orderId: { in: orderIds }, payment: { isDeleted: false } },
                select: { ...PAYMENT_SHARE_SELECT, orderId: true },
            }),
            this.prisma.income.findMany({ where: { orderId: { in: orderIds }, companyId, isDeleted: false } }),
            this.prisma.expense.findMany({ where: { orderId: { in: orderIds }, companyId, isDeleted: false } }),
        ]);
        const byOrder = <T extends { orderId: string | null }>(rows: T[], id: string) => rows.filter(r => r.orderId === id);

        for (const order of orders) {
            const userId = order.responsibles.find(r => r.companyId === companyId)?.userId
                ?? (order.responsibles.length ? null : order.responsibleManagerId);
            if (!userId || !userIds.includes(userId)) continue;
            if (accruedKey.has(`${order.id}:${userId}`)) continue;

            const scheme = schemes.get(userId);
            if (!scheme || scheme.type === 'FIXED' || D(scheme.percentValue).lte(0)) continue;

            const forPayment = scheme.accrualStatus === 'CUSTOMER_PAID';
            if (forPayment && order.isCustomerPaid) continue;
            if (!forPayment && order.status === scheme.accrualStatus) continue;

            let base: Money = ZERO;
            if (scheme.percentBase === 'ORDER_AMOUNT') {
                base = D(order.customerPrice);
            } else {
                base = this.calculator.computeOrderFinance({
                    order,
                    payments: [...byOrder(payments, order.id), ...sharesAsPayments(byOrder(shares, order.id))],
                    incomes: byOrder(incomes, order.id),
                    expenses: byOrder(expenses, order.id),
                    companyId,
                }).margin;
            }
            const amount = roundMoney(base.times(D(scheme.percentValue)).div(100));
            if (amount.lte(0)) continue;

            const list = result.get(userId) ?? [];
            list.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                reason: forPayment ? (order.status === 'COMPLETED' ? 'unpaid' : 'in_progress_paid') : 'in_progress',
                baseAmount: base.toNumber(),
                percentValue: D(scheme.percentValue).toNumber(),
                percentBase: scheme.percentBase,
                amount: amount.toNumber(),
            });
            result.set(userId, list);
        }
        return result;
    }

    // ==================== внутреннее ====================

    private loadOrder(orderId: string) {
        return this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                responsibleManager: true,
                responsibles: { select: { companyId: true, userId: true } },
            },
        });
    }

    private payeesOf(order: {
        responsibles?: Payee[] | null;
        responsibleManagerId?: string | null;
        responsibleManager?: { companyId: string | null } | null;
    }): Payee[] {
        if (order.responsibles?.length) {
            return order.responsibles.map((r) => ({ companyId: r.companyId, userId: r.userId }));
        }
        // Заявки до появления ответственных по компаниям — по старому полю.
        const companyId = order.responsibleManager?.companyId;
        if (order.responsibleManagerId && companyId) {
            return [{ companyId, userId: order.responsibleManagerId }];
        }
        return [];
    }

    /** Дошёл ли рейс до события, от которого схема начисляет процент. */
    private triggerReached(order: { status: string; isCustomerPaid?: boolean | null }, accrualStatus: string) {
        if (accrualStatus === 'CUSTOMER_PAID') return !!order.isCustomerPaid;
        return order.status === accrualStatus;
    }

    private async accruePercent(order: any, payee: Payee, scheme: PayrollScheme) {
        const orderId = order.id;
        const { companyId, userId } = payee;

        // Вычисляем базу
        let base: Money = ZERO;
        if (scheme.percentBase === 'ORDER_AMOUNT') {
            base = D(order.customerPrice);
        } else if (scheme.percentBase === 'MARGIN') {
            // Собрать входные данные так же, как getFinancialRegistry
            const [payments, shares, incomes, expenses] = await Promise.all([
                this.prisma.payment.findMany({
                    where: { orderId, isDeleted: false },
                }),
                // Доли общих платежей считаются оплатой так же, как
                // отдельный платёж по заявке.
                this.prisma.paymentOrderShare.findMany({
                    where: { orderId, payment: { isDeleted: false } },
                    select: PAYMENT_SHARE_SELECT,
                }),
                this.prisma.income.findMany({
                    where: { orderId, companyId, isDeleted: false },
                }),
                this.prisma.expense.findMany({
                    where: { orderId, companyId, isDeleted: false },
                }),
            ]);

            const fin = this.calculator.computeOrderFinance({
                order,
                payments: [...payments, ...sharesAsPayments(shares)],
                incomes,
                expenses,
                companyId,
            });
            base = fin.margin;
        }

        const amount = roundMoney(base.times(D(scheme.percentValue)).div(100));

        // Защита от двойного начисления по уникальному индексу @@unique([orderId, userId, kind]).
        // Если начисление уже есть — заявку пересчитали (изменилась цена/маржа) или
        // триггер сработал повторно: обновляем сумму вместо того, чтобы молча оставить
        // устаревшую (см. H-6), а не создаём новую запись поверх уникального индекса.
        const existing = await this.prisma.payrollAccrual.findUnique({
            where: { orderId_userId_kind: { orderId, userId, kind: 'PERCENT' } },
        });
        if (existing) {
            // Обнулённый процент возвращается в текущий месяц: заработан он
            // сейчас — заявку снова оплатили или рейс вернули менеджеру.
            // Закрытый месяц от этого не меняется: сумма в нём и так ноль.
            const reinstated = D(existing.amount).isZero() && !amount.isZero();
            if (!reinstated && await this.isClosed(existing.companyId, existing.periodMonth)) return;
            if (reinstated || !D(existing.amount).equals(amount) || !D(existing.baseAmount).equals(base)) {
                await this.prisma.payrollAccrual.update({
                    where: { id: existing.id },
                    data: {
                        amount,
                        baseAmount: base,
                        schemeSnapshot: scheme as any,
                        ...(reinstated && { companyId, periodMonth: kzCurrentMonth() }),
                    },
                });
            }
        } else {
            await this.prisma.payrollAccrual.create({
                data: {
                    companyId,
                    userId,
                    orderId,
                    kind: 'PERCENT',
                    amount,
                    periodMonth: kzCurrentMonth(), // 'YYYY-MM'
                    baseAmount: base,
                    schemeSnapshot: scheme as any,
                },
            });
        }

        // В этой компании рейс ведёт один человек: если процент раньше
        // начислили другому (рейс передали), у него он сторнируется.
        const others = await this.prisma.payrollAccrual.findMany({
            where: { orderId, companyId, kind: 'PERCENT', userId: { not: userId } },
        });
        for (const other of others) {
            await this.reversePercent(other, 'responsible_changed');
        }
    }

    /** Обнулить процент с пометкой причины. Закрытый период не трогаем. */
    private async reversePercent(
        accrual: { id: string; companyId: string; periodMonth: string; amount: any; schemeSnapshot: any },
        reason: 'order_cancelled' | 'responsible_changed' | 'payment_cancelled',
    ) {
        if (D(accrual.amount).isZero()) return;
        if (await this.isClosed(accrual.companyId, accrual.periodMonth)) return;
        await this.prisma.payrollAccrual.update({
            where: { id: accrual.id },
            data: {
                amount: 0,
                schemeSnapshot: {
                    ...((accrual.schemeSnapshot as any) || {}),
                    _reversedReason: reason,
                    _reversedAt: new Date().toISOString(),
                },
            },
        });
    }

    private async ensureSalary(companyId: string, userId: string, periodMonth: string, scheme: PayrollScheme, isCurrentMonth: boolean) {
        const shouldPay = (scheme.type === 'FIXED' || scheme.type === 'HYBRID') && D(scheme.fixedAmount).gt(0);
        const existing = await this.prisma.payrollAccrual.findFirst({
            where: { companyId, userId, periodMonth, kind: 'SALARY' },
        });

        if (!shouldPay) {
            // Оклад убрали из схемы — в текущем месяце его больше нет.
            // Прошлые месяцы остаются как были начислены.
            if (existing && isCurrentMonth && !D(existing.amount).isZero()) {
                await this.prisma.payrollAccrual.update({
                    where: { id: existing.id },
                    data: { amount: 0, schemeSnapshot: scheme as any },
                });
            }
            return;
        }

        if (existing) {
            if (!D(existing.amount).equals(D(scheme.fixedAmount))) {
                await this.prisma.payrollAccrual.update({
                    where: { id: existing.id },
                    data: { amount: scheme.fixedAmount, schemeSnapshot: scheme as any },
                });
            }
            return;
        }
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

    private async ensureKpi(companyId: string, userId: string, periodMonth: string, rule: PayrollKpiRule) {
        if (rule.metric !== 'COMPLETED_ORDERS_MONTH') return;

        // Количество завершённых рейсов, которые человек вёл в этой компании за месяц
        const count = await this.prisma.order.count({ where: planTripsWhere(companyId, userId, periodMonth) });

        const existing = await this.prisma.payrollAccrual.findFirst({
            where: { companyId, userId, periodMonth, kind: 'KPI', kpiRuleId: rule.id },
        });

        if (count < rule.threshold) {
            // Норма перестала выполняться (рейс отменили или вернули в работу) —
            // бонус снимается. Запись остаётся финансовым следом.
            if (existing && !D(existing.amount).isZero()) {
                await this.prisma.payrollAccrual.update({
                    where: { id: existing.id },
                    data: {
                        amount: 0,
                        schemeSnapshot: {
                            ...(rule as any),
                            _reversedReason: 'threshold_not_met',
                            _reversedAt: new Date().toISOString(),
                        },
                    },
                });
            }
            return;
        }

        if (existing) {
            if (!D(existing.amount).equals(D(rule.bonusAmount))) {
                await this.prisma.payrollAccrual.update({
                    where: { id: existing.id },
                    data: { amount: rule.bonusAmount, schemeSnapshot: rule as any },
                });
            }
            return;
        }
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

    private async dropInactiveKpi(companyId: string, userId: string, periodMonth: string, activeRuleIds: string[]) {
        const stale = await this.prisma.payrollAccrual.findMany({
            where: {
                companyId,
                userId,
                periodMonth,
                kind: 'KPI',
                NOT: { amount: 0 },
                ...(activeRuleIds.length ? { kpiRuleId: { notIn: activeRuleIds } } : {}),
            },
        });
        for (const accrual of stale) {
            await this.prisma.payrollAccrual.update({
                where: { id: accrual.id },
                data: {
                    amount: 0,
                    schemeSnapshot: {
                        ...((accrual.schemeSnapshot as any) || {}),
                        _reversedReason: 'rule_disabled',
                        _reversedAt: new Date().toISOString(),
                    },
                },
            });
        }
    }

    /**
     * С какого месяца человек работает в компании и работает ли сейчас.
     *
     * Для домашней компании — дата заведения человека, для остальных — дата,
     * когда его добавили в организацию. `null` — в компании не состоит.
     */
    private async membershipOf(companyId: string, userId: string): Promise<{ since: string; isActive: boolean } | null> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { isActive: true, companyId: true, createdAt: true },
        });
        if (!user) return null;
        if (user.companyId === companyId) {
            return { since: kzCurrentMonth(user.createdAt), isActive: user.isActive };
        }
        const relation = await this.prisma.userCompanyRelation.findUnique({
            where: { userId_companyId: { userId, companyId } },
            select: { createdAt: true },
        });
        if (!relation) return null;
        return { since: kzCurrentMonth(relation.createdAt), isActive: user.isActive };
    }

    private async isClosed(companyId: string, periodMonth: string): Promise<boolean> {
        const [yearStr, monthStr] = (periodMonth || '').split('-');
        if (!yearStr || !monthStr) return false;
        const closed = await this.prisma.closedPeriod.findUnique({
            where: { companyId_year_month: { companyId, year: parseInt(yearStr, 10), month: parseInt(monthStr, 10) } },
            select: { id: true },
        });
        return !!closed;
    }
}
