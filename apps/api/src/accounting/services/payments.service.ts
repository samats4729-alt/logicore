import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PeriodClosingService } from './period-closing.service';
import { PaymentAllocationService } from '../../accounting-documents/payment-allocation.service';
import { FinancialSettingsService } from './financial-settings.service';
import { PaymentDirection, PaymentMethod, AccountKind, Payment, Prisma } from '@prisma/client';
import { D, Money, ZERO, roundMoney, sumOf, toNum } from '../../common/utils/money';
import { PayrollService } from '../../payroll/payroll.service';
import { CurrencyService } from '../../currency/currency.service';
import { paymentInBase } from './exchange-difference';

/** Учётная валюта: в ней ведутся отчёты и итоги по компании. */
const BASE_CURRENCY = 'KZT';

/**
 * Сумма заявки в тенге: готовый пересчёт, если он есть, сама сумма для
 * тенге и «неизвестно» в остальных случаях. Неизвестное не сравнивается —
 * лучше не поставить галочку «оплачено», чем поставить её ошибочно.
 */
function orderAmountBase(
    base: Prisma.Decimal | null,
    currency: string | null,
    raw: Prisma.Decimal | null,
): Money | null {
    if (base !== null && base !== undefined) return D(base);
    return (currency || BASE_CURRENCY) === BASE_CURRENCY ? D(raw) : null;
}

/**
 * Пересчёт суммы, у которой своей учётной колонки нет, по курсу соседней
 * суммы в той же валюте того же документа.
 */
function sameCurrencyBase(
    raw: Prisma.Decimal | null,
    currency: string | null,
    peerRaw: Prisma.Decimal | null,
    peerBase: Prisma.Decimal | null,
): Money | null {
    if ((currency || BASE_CURRENCY) === BASE_CURRENCY) return D(raw);
    if (peerBase === null || peerBase === undefined || D(peerRaw).lte(ZERO)) return null;
    return roundMoney(D(raw).times(D(peerBase)).div(D(peerRaw)));
}

/**
 * Период операций для журнала «Операции».
 *
 * Конец периода растягивается до конца суток: у доходов и расходов дата
 * хранится с временем, и «по 31 июля» иначе теряло всё, что заведено в этот
 * день. Пусто — ограничения нет, как было раньше.
 */
function operationPeriod(period?: { from?: string; to?: string }): Prisma.DateTimeFilter | undefined {
    if (!period?.from && !period?.to) return undefined;
    const to = period.to ? new Date(period.to) : null;
    if (to) to.setUTCHours(23, 59, 59, 999);
    return {
        gte: period.from ? new Date(period.from) : undefined,
        lte: to ?? undefined,
    };
}

@Injectable()
export class PaymentsService {
    private static readonly AUTO_NOTE_CUSTOMER = 'Проведение оплаты заказчика (на остаток)';
    private static readonly AUTO_NOTE_DRIVER = 'Оплата водителю (на остаток)';
    private static readonly AUTO_NOTE_SUBFORWARDER = 'Оплата суб-экспедитору (на остаток)';

    // Запись платежа, пересчёт флагов заявки и журнал изменений выполняются в
    // одной транзакции. Запас по времени взят с расчётом на заявку с большим
    // числом платежей: лучше подождать, чем оставить платёж записанным, а флаг
    // «оплачено» — нет.
    private static readonly FINANCE_TX_TIMEOUT_MS = 15000;

    constructor(
        private prisma: PrismaService,
        private periodClosingService: PeriodClosingService,
        private financialSettingsService: FinancialSettingsService,
        @Inject(forwardRef(() => PayrollService))
        private payrollService: PayrollService,
        private allocations: PaymentAllocationService,
        private currency: CurrencyService,
    ) { }

    // ==================== EXPENSES (manual) ====================

    async getExpenses(companyId: string, period?: { from?: string; to?: string }) {
        return this.prisma.expense.findMany({
            where: { companyId, isDeleted: false, date: operationPeriod(period) },
            include: { order: { select: { orderNumber: true } }, account: true },
            orderBy: { date: 'desc' },
        });
    }

    async createExpense(companyId: string, userId: string, data: {
        date: string;
        category: string;
        description: string;
        amount: number;
        note?: string;
        orderId?: string;
        accountId?: string;
    }) {
        await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        return this.prisma.expense.create({
            data: {
                companyId,
                createdById: userId,
                date: new Date(data.date),
                category: data.category,
                description: data.description,
                amount: data.amount,
                note: data.note || null,
                orderId: data.orderId || null,
                accountId: data.accountId || null,
            },
        });
    }

    async updateExpense(companyId: string, expenseId: string, data: {
        date?: string;
        category?: string;
        description?: string;
        amount?: number;
        note?: string;
        accountId?: string;
    }) {
        const expense = await this.prisma.expense.findFirst({
            where: { id: expenseId, companyId },
        });

        if (!expense) throw new NotFoundException('Расход не найден');

        await this.periodClosingService.checkPeriodNotClosed(companyId, expense.date);
        if (data.date && new Date(data.date).getTime() !== new Date(expense.date).getTime()) {
            await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        }

        return this.prisma.expense.update({
            where: { id: expenseId },
            data: {
                ...(data.date && { date: new Date(data.date) }),
                ...(data.category && { category: data.category }),
                ...(data.description && { description: data.description }),
                ...(data.amount !== undefined && { amount: data.amount }),
                ...(data.note !== undefined && { note: data.note || null }),
                ...(data.accountId !== undefined && { accountId: data.accountId || null }),
            },
        });
    }

    async deleteExpense(companyId: string, expenseId: string) {
        const expense = await this.prisma.expense.findFirst({
            where: { id: expenseId, companyId },
        });

        if (!expense) throw new NotFoundException('Расход не найден');

        await this.periodClosingService.checkPeriodNotClosed(companyId, expense.date);

        return this.prisma.expense.update({
            where: { id: expenseId },
            data: { isDeleted: true },
        });
    }

    // ==================== INCOMES (manual) ====================

    async getIncomes(companyId: string, period?: { from?: string; to?: string }) {
        return this.prisma.income.findMany({
            where: { companyId, isDeleted: false, date: operationPeriod(period) },
            orderBy: { date: 'desc' },
            include: {
                order: {
                    select: {
                        id: true,
                        orderNumber: true,
                        cargoDescription: true,
                        status: true,
                    },
                },
                account: true,
            },
        });
    }

    async createIncome(companyId: string, userId: string, data: {
        date: string;
        category: string;
        description: string;
        amount: number;
        note?: string;
        orderId?: string;
        accountId?: string;
    }) {
        await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        return this.prisma.income.create({
            data: {
                companyId,
                createdById: userId,
                date: new Date(data.date),
                category: data.category,
                description: data.description,
                amount: data.amount,
                note: data.note || null,
                orderId: data.orderId || null,
                accountId: data.accountId || null,
            },
        });
    }

    async updateIncome(companyId: string, incomeId: string, data: {
        date?: string;
        category?: string;
        description?: string;
        amount?: number;
        note?: string;
        accountId?: string;
    }) {
        const income = await this.prisma.income.findFirst({
            where: { id: incomeId, companyId },
        });

        if (!income) throw new NotFoundException('Поступление не найдено');

        await this.periodClosingService.checkPeriodNotClosed(companyId, income.date);
        if (data.date && new Date(data.date).getTime() !== new Date(income.date).getTime()) {
            await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        }

        return this.prisma.income.update({
            where: { id: incomeId },
            data: {
                ...(data.date && { date: new Date(data.date) }),
                ...(data.category && { category: data.category }),
                ...(data.description && { description: data.description }),
                ...(data.amount !== undefined && { amount: data.amount }),
                ...(data.note !== undefined && { note: data.note || null }),
                ...(data.accountId !== undefined && { accountId: data.accountId || null }),
            },
        });
    }

    async deleteIncome(companyId: string, incomeId: string) {
        const income = await this.prisma.income.findFirst({
            where: { id: incomeId, companyId },
        });

        if (!income) throw new NotFoundException('Поступление не найдено');

        await this.periodClosingService.checkPeriodNotClosed(companyId, income.date);

        return this.prisma.income.update({
            where: { id: incomeId },
            data: { isDeleted: true },
        });
    }

    // ==================== PAYMENTS CRUD ====================

    async getPayments(companyId: string, query: { startDate?: string; endDate?: string; direction?: PaymentDirection }) {
        return this.prisma.payment.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(query.direction && { direction: query.direction }),
                ...(query.startDate && query.endDate && {
                    date: {
                        gte: new Date(query.startDate),
                        lte: new Date(query.endDate),
                    }
                }),
            },
            include: {
                order: { select: { orderNumber: true } },
                counterparty: { select: { name: true } },
                account: true,
                category: true,
                // Возвраты нужны журналу операций: по ним видно, сколько от
                // платежа уже вернули и можно ли вернуть ещё.
                refunds: { where: { isDeleted: false }, select: { id: true, amount: true, date: true } },
            },
            orderBy: { date: 'desc' },
        });
    }

    async getPaymentsByOrder(companyId: string, orderId: string) {
        return this.prisma.payment.findMany({
            where: {
                companyId,
                orderId,
                isDeleted: false,
            },
            include: {
                counterparty: { select: { name: true } },
                account: true,
                category: true,
            },
            orderBy: { date: 'desc' },
        });
    }

    /**
     * Валюта платежа, курс на его дату и сумма в тенге.
     *
     * Три правила, каждое из которых иначе рано или поздно ломает сверку:
     *   — валюта платежа совпадает с валютой счёта: доллары на тенговом
     *     счёте делают его остаток выдумкой;
     *   — валютный платёж без счёта не принимается: деньги должны куда-то
     *     лечь, иначе они попадут на тенговый счёт по умолчанию;
     *   — валютный платёж без курса не принимается: без курса он молча
     *     выпадет из всех отчётов в тенге.
     */
    private async resolvePaymentMoney(
        companyId: string,
        input: { amount: Prisma.Decimal; currency: string | null; date: string; accountId: string | null },
    ) {
        const account = input.accountId
            ? await this.prisma.financeAccount.findFirst({
                where: { id: input.accountId, companyId },
                select: { name: true, currency: true },
            })
            : null;

        // Валюта счёта по умолчанию — тенге: в базе колонка NOT NULL с этим
        // значением, и старые счета, заведённые до валют, именно тенговые.
        const accountCurrency = account ? (account.currency || BASE_CURRENCY) : null;
        const currency = input.currency || accountCurrency || BASE_CURRENCY;

        if (account && accountCurrency !== currency) {
            throw new BadRequestException(
                `Счёт «${account.name}» ведётся в ${accountCurrency} — платёж в ${currency} на него не принять. Заведите счёт в ${currency} в разделе «Счета и кассы»`,
            );
        }

        if (currency === BASE_CURRENCY) {
            return { currency, rate: D(1), rateDate: null as Date | null, amountBase: input.amount };
        }

        if (!account) {
            throw new BadRequestException(
                `Для платежа в ${currency} нужен счёт в этой валюте — заведите его в разделе «Счета и кассы»`,
            );
        }

        const converted = await this.currency.toBase(input.amount, currency, new Date(input.date), { companyId });
        if (!converted) {
            throw new BadRequestException(
                `Нет курса ${currency} на ${new Date(input.date).toLocaleDateString('ru-RU')} — загрузите его в разделе «Финансы → Курсы валют»`,
            );
        }

        return {
            currency,
            rate: converted.rate,
            rateDate: converted.rateDate,
            amountBase: converted.amount,
        };
    }

    async createPayment(companyId: string, userId: string, data: {
        orderId?: string;
        counterpartyId?: string;
        direction: PaymentDirection;
        amount: number;
        date: string;
        method?: PaymentMethod;
        note?: string;
        accountId?: string;
        categoryId?: string;
        currency?: string;
    }) {
        await this.financialSettingsService.ensureCompanyFinanceSettings(companyId);
        const amt = roundMoney(data.amount);
        await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);

        let accountId = data.accountId;
        let categoryId = data.categoryId;

        // Контрагент не указан, но платёж по заявке — определяем его из заявки,
        // чтобы оплата попадала в акт сверки с этим контрагентом
        let counterpartyId = data.counterpartyId || null;
        if (!counterpartyId && data.orderId) {
            const order = await this.prisma.order.findUnique({
                where: { id: data.orderId },
                select: { customerCompanyId: true, forwarderId: true, partnerId: true, subForwarderId: true },
            });
            if (order) {
                const forwarderSide = order.forwarderId || order.partnerId || null;
                if (data.direction === PaymentDirection.IN) {
                    // нам платят: суб-экспедитору платит экспедитор, экспедитору — заказчик
                    counterpartyId = companyId === order.subForwarderId
                        ? forwarderSide
                        : (order.customerCompanyId !== companyId ? order.customerCompanyId : null);
                } else {
                    // мы платим: заказчик платит экспедитору, экспедитор — суб-экспедитору
                    // (водителю-физлицу компании-контрагента нет — оставляем пустым)
                    counterpartyId = companyId === order.customerCompanyId
                        ? forwarderSide
                        : (order.subForwarderId && order.subForwarderId !== companyId ? order.subForwarderId : null);
                }
                if (counterpartyId === companyId) counterpartyId = null;
            }
        }

        const currency = (data.currency || '').toUpperCase() || null;

        if (!accountId) {
            const kind = data.method === PaymentMethod.CASH ? AccountKind.CASH : AccountKind.BANK;
            const defaultAcc = await this.prisma.financeAccount.findFirst({
                // Валютному платежу нужен счёт в его валюте: тенговый счёт по
                // умолчанию для долларов не подходит.
                where: {
                    companyId, kind, isActive: true,
                    ...(currency && currency !== BASE_CURRENCY ? { currency } : { isDefault: true }),
                },
                orderBy: { isDefault: 'desc' },
            });
            accountId = defaultAcc?.id;
        }

        const money = await this.resolvePaymentMoney(companyId, {
            amount: amt, currency, date: data.date, accountId: accountId || null,
        });

        if (!categoryId) {
            const defaultCatName = data.direction === PaymentDirection.IN ? 'Оплата за рейс' : 'Оплата исполнителю';
            const defaultCat = await this.prisma.financeCategory.findFirst({
                where: { companyId, name: defaultCatName, direction: data.direction, isSystem: true, isActive: true },
            });
            categoryId = defaultCat?.id;
        }

        // Платёж, пересчёт флагов заявки и запись в журнал — одна транзакция.
        // Раньше это были три независимые операции: падение между ними
        // оставляло деньги записанными, а «оплачено» на заявке — старым.
        const { payment, customerPaidBecameTrue } = await this.prisma.$transaction(async (tx) => {
            const created = await tx.payment.create({
                data: {
                    companyId,
                    orderId: data.orderId || null,
                    counterpartyId,
                    direction: data.direction,
                    amount: amt,
                    currency: money.currency,
                    exchangeRate: money.rate,
                    exchangeRateDate: money.rateDate,
                    amountBase: money.amountBase,
                    date: new Date(data.date),
                    method: data.method || PaymentMethod.BANK,
                    note: data.note || null,
                    createdById: userId,
                    accountId: accountId || null,
                    categoryId: categoryId || null,
                },
                include: {
                    order: { select: { orderNumber: true } },
                }
            });

            let becameTrue = false;
            if (created.orderId) {
                becameTrue = await this.syncOrderPaymentFlagsWithin(tx, created.orderId);
                await tx.orderChangeLog.create({
                    data: {
                        orderId: created.orderId,
                        userId,
                        action: 'payment_added',
                        details: `Добавлен платеж: ${created.direction === 'IN' ? 'Поступление' : 'Расход'} на сумму ${created.amount} ₸ (${created.note || 'без примечания'}).`
                    }
                });
            }

            return { payment: created, customerPaidBecameTrue: becameTrue };
        }, { timeout: PaymentsService.FINANCE_TX_TIMEOUT_MS });

        if (payment.orderId) {
            await this.runCustomerPaidTrigger(payment.orderId, customerPaidBecameTrue);
        }

        return payment;
    }

    /**
     * Возврат платежа (сторно) — T-20.
     *
     * Раньше вернуть деньги можно было только удалив платёж: история
     * стиралась, а акт сверки и ДДС показывали так, будто денег и не было.
     * Возврат — отдельный платёж обратного направления со ссылкой на
     * исходный: обе операции остаются в истории и видны в сверке.
     *
     * Разнесения исходного платежа уменьшаются на сумму возврата, иначе
     * счёт остался бы «оплаченным» деньгами, которые уже вернули.
     */
    async refundPayment(companyId: string, paymentId: string, userId: string, data: {
        amount?: number;
        date?: string;
        note?: string;
        accountId?: string;
    }) {
        const source = await this.prisma.payment.findFirst({
            where: { id: paymentId, companyId, isDeleted: false },
            include: { refunds: { where: { isDeleted: false }, select: { amount: true } } },
        });
        if (!source) throw new NotFoundException('Платеж не найден');
        if (source.refundOfId) {
            throw new BadRequestException('Это уже возврат — вернуть возврат нельзя');
        }

        const already = sumOf(source.refunds, (refund) => refund.amount);
        const refundable = roundMoney(D(source.amount).minus(already));
        if (refundable.lte(0)) {
            throw new BadRequestException('Платёж уже возвращён полностью');
        }

        const amount = data.amount === undefined ? refundable : roundMoney(D(data.amount));
        if (amount.lte(0)) {
            throw new BadRequestException('Сумма возврата должна быть больше нуля');
        }
        if (amount.gt(refundable)) {
            throw new BadRequestException(
                `Возврат больше остатка платежа: вернуть можно не более ${refundable.toFixed(2)} ${source.currency === BASE_CURRENCY ? '₸' : source.currency}`,
            );
        }

        // Период проверяется по дате возврата: он проводится сегодняшним днём,
        // а не задним числом исходного платежа.
        const date = data.date ? new Date(data.date) : new Date();
        await this.periodClosingService.checkPeriodNotClosed(companyId, date);

        // Возврат уходит той же валютой, но по курсу дня возврата: деньги
        // физически уходят сегодня, и в тенге это сегодняшняя сумма.
        const money = await this.resolvePaymentMoney(companyId, {
            amount,
            currency: source.currency,
            date: date.toISOString(),
            accountId: data.accountId ?? source.accountId,
        });

        const direction = source.direction === PaymentDirection.IN
            ? PaymentDirection.OUT
            : PaymentDirection.IN;

        const { refund, customerPaidBecameTrue } = await this.prisma.$transaction(async (tx) => {
            const created = await tx.payment.create({
                data: {
                    companyId,
                    orderId: source.orderId,
                    counterpartyId: source.counterpartyId,
                    direction,
                    amount,
                    currency: money.currency,
                    exchangeRate: money.rate,
                    exchangeRateDate: money.rateDate,
                    amountBase: money.amountBase,
                    date,
                    method: source.method,
                    // Статью не наследуем: у неё жёсткое направление, и статья
                    // прихода не годится расходной операции.
                    categoryId: null,
                    accountId: data.accountId ?? source.accountId,
                    note: data.note?.trim() || `Возврат платежа от ${source.date.toISOString().slice(0, 10)}`,
                    createdById: userId,
                    refundOfId: source.id,
                },
                include: { order: { select: { orderNumber: true } } },
            });

            let becameTrue = false;
            if (created.orderId) {
                becameTrue = await this.syncOrderPaymentFlagsWithin(tx, created.orderId);
                await tx.orderChangeLog.create({
                    data: {
                        orderId: created.orderId,
                        userId,
                        action: 'payment_refunded',
                        details: `Возврат платежа на сумму ${created.amount} ₸ (${created.note}).`,
                    },
                });
            }

            return { refund: created, customerPaidBecameTrue: becameTrue };
        }, { timeout: PaymentsService.FINANCE_TX_TIMEOUT_MS });

        // Возврат всей суммы снимает разнесения целиком. Иначе на валютном
        // платеже осталась бы копейка разнесения: возврат уходит по своему
        // курсу, и в тенге он не совпадает с приходом до копейки.
        if (amount.gte(refundable) && already.isZero()) {
            await this.allocations.release(source.id);
        } else {
            await this.allocations.reduce(source.id, amount);
        }

        if (refund.orderId) {
            await this.runCustomerPaidTrigger(refund.orderId, customerPaidBecameTrue);
        }

        return refund;
    }

    async updatePayment(companyId: string, paymentId: string, userId: string, data: {
        amount?: number;
        date?: string;
        method?: PaymentMethod;
        note?: string;
        counterpartyId?: string;
        accountId?: string;
        categoryId?: string;
        orderId?: string;
    }) {
        const payment = await this.prisma.payment.findFirst({
            where: { id: paymentId, companyId, isDeleted: false },
            include: { refunds: { where: { isDeleted: false }, select: { id: true } } },
        });
        if (!payment) throw new NotFoundException('Платеж не найден');

        // Сумма платежа с возвратом не меняется: возврат считается от неё, и
        // правка задним числом сделала бы возврат больше самого платежа.
        if (data.amount !== undefined && payment.refunds.length) {
            throw new BadRequestException('Нельзя изменить сумму платежа: по нему оформлен возврат. Сначала удалите возврат.');
        }

        await this.periodClosingService.checkPeriodNotClosed(companyId, payment.date);
        if (data.date && new Date(data.date).getTime() !== new Date(payment.date).getTime()) {
            await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        }

        const amt = data.amount !== undefined ? roundMoney(data.amount) : payment.amount;
        const oldOrderId = payment.orderId;

        // Смена привязки к заявке затрагивает две заявки сразу: прежнюю и новую.
        // Обе пересчитываются в одной транзакции с самим платежом, иначе при
        // сбое посередине одна из заявок останется с неверными флагами.
        const { updated, paidTriggers } = await this.prisma.$transaction(async (tx) => {
            const row = await tx.payment.update({
                where: { id: paymentId },
                data: {
                    ...(data.amount !== undefined && { amount: amt }),
                    ...(data.date && { date: new Date(data.date) }),
                    ...(data.method && { method: data.method }),
                    ...(data.note !== undefined && { note: data.note || null }),
                    ...(data.counterpartyId !== undefined && { counterpartyId: data.counterpartyId || null }),
                    ...(data.accountId !== undefined && { accountId: data.accountId || null }),
                    ...(data.categoryId !== undefined && { categoryId: data.categoryId || null }),
                    ...(data.orderId !== undefined && { orderId: data.orderId || null }),
                },
                include: {
                    order: { select: { orderNumber: true } },
                }
            });

            // Пересчитываем флаги оплаты: и у прежней заявки (если отвязали/сменили), и у новой
            const affected = new Set<string>();
            if (oldOrderId) affected.add(oldOrderId);
            if (row.orderId) affected.add(row.orderId);

            const triggers: string[] = [];
            for (const oid of affected) {
                if (await this.syncOrderPaymentFlagsWithin(tx, oid)) {
                    triggers.push(oid);
                }
                await tx.orderChangeLog.create({
                    data: {
                        orderId: oid,
                        userId,
                        action: 'payment_updated',
                        details: `Обновлен платеж: ${row.direction === 'IN' ? 'Поступление' : 'Расход'} на сумму ${row.amount} ₸ (${row.note || 'без примечания'}).`
                    }
                });
            }

            return { updated: row, paidTriggers: triggers };
        }, { timeout: PaymentsService.FINANCE_TX_TIMEOUT_MS });

        for (const oid of paidTriggers) {
            await this.runCustomerPaidTrigger(oid, true);
        }

        return updated;
    }

    async deletePayment(companyId: string, paymentId: string, userId: string) {
        const payment = await this.prisma.payment.findFirst({
            where: { id: paymentId, companyId, isDeleted: false },
            include: { refunds: { where: { isDeleted: false }, select: { id: true } } },
        });
        if (!payment) throw new NotFoundException('Платеж не найден');

        // Удаление платежа с возвратом оставило бы возврат без основания, а в
        // сверке — движение денег из ниоткуда. Сначала удаляют возврат.
        if (payment.refunds.length) {
            throw new BadRequestException('Нельзя удалить платёж: по нему оформлен возврат. Сначала удалите возврат.');
        }

        await this.periodClosingService.checkPeriodNotClosed(companyId, payment.date);


        const { updated, customerPaidBecameTrue } = await this.prisma.$transaction(async (tx) => {
            const row = await tx.payment.update({
                where: { id: paymentId },
                data: { isDeleted: true }
            });

            let becameTrue = false;
            if (row.orderId) {
                becameTrue = await this.syncOrderPaymentFlagsWithin(tx, row.orderId);
                await tx.orderChangeLog.create({
                    data: {
                        orderId: row.orderId,
                        userId,
                        action: 'payment_deleted',
                        details: `Удален платеж: ${row.direction === 'IN' ? 'Поступление' : 'Расход'} на сумму ${row.amount} ₸ (${row.note || 'без примечания'}).`
                    }
                });
            }

            return { updated: row, customerPaidBecameTrue: becameTrue };
        }, { timeout: PaymentsService.FINANCE_TX_TIMEOUT_MS });

        // Разнесение по счетам снимаем: иначе счёт остался бы «оплаченным»
        // деньгами удалённого платежа.
        await this.allocations.release(paymentId);

        if (updated.orderId) {
            await this.runCustomerPaidTrigger(updated.orderId, customerPaidBecameTrue);
        }

        return updated;
    }

    // ==================== PAYMENT FLAGS SYNC ====================

    // Архитектурная заметка (см. аудит M-9, и комментарий в начале
    // finance-calculator.service.ts): это КАНОНИЧЕСКИЙ расчёт «оплачено ли»,
    // с полной видимостью платежей обеих сторон заявки (companyId для выборки
    // платежей определяется из самой заявки, а не передаётся вызывающим). Его
    // результат — персистентный, единый для всех факт, на который опирается
    // FinanceCalculatorService.computeOrderFinance() как на фолбэк, когда его
    // собственная (ограниченная видимостью конкретной компании) выборка
    // платежей неполная. Это не дублирование, а два намеренно разных уровня
    // одного и того же расчёта — сливать их в одну функцию нельзя.
    async syncOrderPaymentFlags(orderId: string) {
        const customerPaidBecameTrue = await this.prisma.$transaction(
            (tx) => this.syncOrderPaymentFlagsWithin(tx, orderId),
            { timeout: PaymentsService.FINANCE_TX_TIMEOUT_MS },
        );
        await this.runCustomerPaidTrigger(orderId, customerPaidBecameTrue);
    }

    /**
     * Тот же расчёт, но внутри уже открытой транзакции. Возвращает признак
     * «заявка только что стала оплаченной заказчиком»: сам payroll-триггер
     * здесь НЕ запускается — он делает собственные записи и внешние вызовы,
     * поэтому должен выполняться после коммита, иначе откат основной операции
     * не откатит его последствия. За запуск отвечает вызывающий через
     * runCustomerPaidTrigger().
     */
    private async syncOrderPaymentFlagsWithin(
        tx: Prisma.TransactionClient,
        orderId: string,
    ): Promise<boolean> {
        const order = await tx.order.findUnique({
            where: { id: orderId },
            include: {
                responsibleManager: {
                    select: {
                        companyId: true,
                    },
                },
            },
        });
        if (!order) return false;

        const forwarderCompanyId = order.forwarderId || order.partnerId || order.responsibleManager?.companyId || order.customerCompanyId || null;

        // Sync Customer Paid Flag
        const customerPayments = await tx.payment.findMany({
            where: {
                orderId,
                direction: PaymentDirection.IN,
                isDeleted: false,
                ...(forwarderCompanyId && { companyId: forwarderCompanyId }),
            },
        });
        // Суммы складываются в Decimal: обходной moneyGte здесь больше не нужен,
        // сравнение точное и «недоплаты в 0.00000000001» не возникает.
        //
        // Сравнение идёт в тенге. Долларовый платёж и тенговая ставка — разные
        // деньги, и сложить их значило бы объявить заявку оплаченной, когда
        // пришла треть суммы. Всё, что в тенге не пересчитано (нет курса), в
        // сравнении не участвует: лучше «не оплачено» до появления курса, чем
        // ложная галочка «оплачено».
        const paidIn = sumOf(customerPayments, (p) => paymentInBase(p));
        const revenue = orderAmountBase(order.customerPriceBase, order.currency, order.customerPrice);
        const isCustomerPaid = !!revenue && revenue.gt(0) && paidIn.gte(revenue);
        const customerPaidBecameTrue = !order.isCustomerPaid && isCustomerPaid;

        // Sync Driver / Sub-forwarder Paid Flag
        const executorPayments = await tx.payment.findMany({
            where: {
                orderId,
                direction: PaymentDirection.OUT,
                isDeleted: false,
                ...(forwarderCompanyId && { companyId: forwarderCompanyId }),
            },
        });
        const paidOut = sumOf(executorPayments, (p) => paymentInBase(p));

        let isDriverPaid = false;
        let driverPaidAt = null;
        let isSubForwarderPaid = false;
        let subForwarderPaidAt = null;

        if (order.subForwarderId) {
            // У ставки суб-экспедитора своей пересчитанной суммы нет — она в
            // валюте заявки, и курс берём тот же, по которому пересчитана
            // ставка заказчика: обе суммы из одной заявки и одного дня.
            const subForwarderPrice = sameCurrencyBase(
                order.subForwarderPrice, order.currency, order.customerPrice, order.customerPriceBase,
            );
            isSubForwarderPaid = !!subForwarderPrice && subForwarderPrice.gt(0) && paidOut.gte(subForwarderPrice);
            // Дата оплаты — снимок реального события платежа. Если платежи всё ещё
            // есть, но их стало недостаточно из-за повышения ставки задним числом,
            // дату не затираем (см. H-4) — обнуляем только когда платежей нет вовсе.
            subForwarderPaidAt = isSubForwarderPaid
                ? (order.subForwarderPaidAt || new Date())
                : (paidOut.gt(0) ? order.subForwarderPaidAt : null);
        } else {
            const driverCost = orderAmountBase(order.driverCostBase, order.driverCostCurrency, order.driverCost);
            isDriverPaid = !!driverCost && driverCost.gt(0) && paidOut.gte(driverCost);
            driverPaidAt = isDriverPaid
                ? (order.driverPaidAt || new Date())
                : (paidOut.gt(0) ? order.driverPaidAt : null);
        }

        await tx.order.update({
            where: { id: orderId },
            data: {
                isCustomerPaid,
                customerPaidAt: isCustomerPaid
                    ? (order.customerPaidAt || new Date())
                    : (paidIn.gt(0) ? order.customerPaidAt : null),
                isDriverPaid,
                driverPaidAt,
                isSubForwarderPaid,
                subForwarderPaidAt,
            },
        });

        return customerPaidBecameTrue;
    }

    /**
     * Начисление зарплаты по факту оплаты заказчиком. Запускается только после
     * успешного коммита. Ошибка начисления намеренно не роняет сам платёж:
     * деньги уже записаны, а начисление пересчитывается отдельно.
     */
    private async runCustomerPaidTrigger(orderId: string, customerPaidBecameTrue: boolean) {
        if (!customerPaidBecameTrue) return;

        try {
            await this.payrollService.processOrderTrigger(orderId, 'CUSTOMER_PAID');
        } catch (err) {
            console.warn(`Payroll trigger failed for CUSTOMER_PAID: ${err}`);
        }
    }


    /**
     * Остаток к оплате по заявке — в валюте самой заявки.
     *
     * Кнопка «Оплачено» дозакрывает остаток одним платежом. Пока всё было в
     * тенге, остаток считался вычитанием: ставка минус оплаченное. С валютами
     * так нельзя — оплаты могут быть и в тенге, и в валюте, и просто вычесть
     * одно из другого значит сложить доллары с тенге.
     *
     * Поэтому вычитание идёт в тенге (там сходится всё), а результат
     * возвращается в валюту заявки по её же зафиксированному курсу — тому,
     * по которому долг и был записан. Сегодняшний курс тут не годится: он
     * менял бы сумму остатка каждый день.
     */
    private remainingForOrder(
        amount: Prisma.Decimal | null,
        amountBase: Prisma.Decimal | null,
        currency: string | null,
        payments: Array<{ amount: Prisma.Decimal; currency: string; amountBase: Prisma.Decimal | null }>,
    ): { amount: Money; currency: string } | null {
        const code = (currency || BASE_CURRENCY).toUpperCase();
        const paidBase = sumOf(payments, (p) => paymentInBase(p));

        if (code === BASE_CURRENCY) {
            return { amount: roundMoney(D(amount).minus(paidBase)), currency: BASE_CURRENCY };
        }

        // Валютная ставка без пересчёта — остаток посчитать не из чего.
        // Молча взять сумму как есть нельзя: это выдало бы доллары за тенге.
        if (amountBase === null || amountBase === undefined || D(amount).lte(ZERO)) return null;

        const restBase = roundMoney(D(amountBase).minus(paidBase));
        const rate = D(amountBase).div(D(amount));
        if (rate.lte(ZERO)) return null;
        return { amount: roundMoney(restBase.div(rate)), currency: code };
    }

    async markCustomerPaid(companyId: string, orderId: string, paid: boolean, userId: string, date?: string) {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        if (paid) {
            const payments = await this.prisma.payment.findMany({
                where: { orderId, direction: PaymentDirection.IN, isDeleted: false, companyId }
            });
            const rest = this.remainingForOrder(
                order.customerPrice, order.customerPriceBase, order.currency, payments,
            );
            if (!rest) {
                throw new BadRequestException(
                    `Ставка в ${order.currency}, а курса на дату рейса нет — остаток посчитать не из чего. Загрузите курс в разделе «Финансы → Курсы валют»`,
                );
            }
            if (rest.amount.gt(0)) {
                await this.createPayment(companyId, userId, {
                    orderId,
                    counterpartyId: order.customerCompanyId || undefined,
                    direction: PaymentDirection.IN,
                    amount: toNum(rest.amount),
                    currency: rest.currency,
                    date: date || new Date().toISOString(),
                    note: PaymentsService.AUTO_NOTE_CUSTOMER,
                });
            }
        } else {
            const payments = await this.prisma.payment.findMany({
                where: {
                    orderId,
                    direction: PaymentDirection.IN,
                    isDeleted: false,
                    companyId,
                    note: PaymentsService.AUTO_NOTE_CUSTOMER,
                }
            });
            for (const p of payments) {
                await this.deletePayment(companyId, p.id, userId);
            }
            await this.syncOrderPaymentFlags(orderId);

            // Удалили только автоматически созданные платежи. Если флаг всё равно
            // остался true — по заявке есть платежи, введённые вручную, снять
            // отметку молча нельзя: сообщаем об этом явно вместо тихого no-op.
            const refreshed = await this.prisma.order.findUnique({ where: { id: orderId }, select: { isCustomerPaid: true } });
            if (refreshed?.isCustomerPaid) {
                throw new BadRequestException('Не удалось снять отметку об оплате: по заявке есть платежи, введённые вручную. Удалите или скорректируйте их в журнале платежей.');
            }
        }

        return this.prisma.order.findUnique({ where: { id: orderId } });
    }

    async markDriverPaid(companyId: string, orderId: string, paid: boolean, userId: string, date?: string) {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        if (order.subForwarderId) {
            throw new BadRequestException('На заявке назначен суб-экспедитор, используйте оплату суб-экспедитору');
        }

        if (paid) {
            const payments = await this.prisma.payment.findMany({
                where: { orderId, direction: PaymentDirection.OUT, isDeleted: false, companyId }
            });
            const rest = this.remainingForOrder(
                order.driverCost, order.driverCostBase, order.driverCostCurrency, payments,
            );
            if (!rest) {
                throw new BadRequestException(
                    `Ставка водителя в ${order.driverCostCurrency}, а курса на дату рейса нет — остаток посчитать не из чего. Загрузите курс в разделе «Финансы → Курсы валют»`,
                );
            }
            if (rest.amount.gt(0)) {
                await this.createPayment(companyId, userId, {
                    orderId,
                    direction: PaymentDirection.OUT,
                    amount: toNum(rest.amount),
                    currency: rest.currency,
                    date: date || new Date().toISOString(),
                    note: PaymentsService.AUTO_NOTE_DRIVER,
                });
            }
        } else {
            const payments = await this.prisma.payment.findMany({
                where: {
                    orderId,
                    direction: PaymentDirection.OUT,
                    isDeleted: false,
                    companyId,
                    note: PaymentsService.AUTO_NOTE_DRIVER,
                }
            });
            for (const p of payments) {
                await this.deletePayment(companyId, p.id, userId);
            }
            await this.syncOrderPaymentFlags(orderId);

            const refreshed = await this.prisma.order.findUnique({ where: { id: orderId }, select: { isDriverPaid: true } });
            if (refreshed?.isDriverPaid) {
                throw new BadRequestException('Не удалось снять отметку об оплате: по заявке есть платежи, введённые вручную. Удалите или скорректируйте их в журнале платежей.');
            }
        }

        return this.prisma.order.findUnique({ where: { id: orderId } });
    }

    async markSubForwarderPaid(companyId: string, orderId: string, paid: boolean, userId: string, date?: string) {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        if (!order.subForwarderId) {
            throw new BadRequestException('На заявке нет суб-экспедитора, используйте оплату водителю');
        }

        if (paid) {
            const payments = await this.prisma.payment.findMany({
                where: { orderId, direction: PaymentDirection.OUT, isDeleted: false, companyId }
            });
            const rest = this.remainingForOrder(
                order.subForwarderPrice,
                sameCurrencyBase(order.subForwarderPrice, order.currency, order.customerPrice, order.customerPriceBase),
                order.currency,
                payments,
            );
            if (!rest) {
                throw new BadRequestException(
                    `Ставка суб-экспедитора в ${order.currency}, а курса на дату рейса нет — остаток посчитать не из чего. Загрузите курс в разделе «Финансы → Курсы валют»`,
                );
            }
            if (rest.amount.gt(0)) {
                await this.createPayment(companyId, userId, {
                    orderId,
                    counterpartyId: order.subForwarderId || undefined,
                    direction: PaymentDirection.OUT,
                    amount: toNum(rest.amount),
                    currency: rest.currency,
                    date: date || new Date().toISOString(),
                    note: PaymentsService.AUTO_NOTE_SUBFORWARDER,
                });
            }
        } else {
            const payments = await this.prisma.payment.findMany({
                where: {
                    orderId,
                    direction: PaymentDirection.OUT,
                    isDeleted: false,
                    companyId,
                    note: PaymentsService.AUTO_NOTE_SUBFORWARDER,
                }
            });
            for (const p of payments) {
                await this.deletePayment(companyId, p.id, userId);
            }
            await this.syncOrderPaymentFlags(orderId);

            const refreshed = await this.prisma.order.findUnique({ where: { id: orderId }, select: { isSubForwarderPaid: true } });
            if (refreshed?.isSubForwarderPaid) {
                throw new BadRequestException('Не удалось снять отметку об оплате: по заявке есть платежи, введённые вручную. Удалите или скорректируйте их в журнале платежей.');
            }
        }

        return this.prisma.order.findUnique({ where: { id: orderId } });
    }
}
