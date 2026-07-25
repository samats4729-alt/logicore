import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PeriodClosingService } from './period-closing.service';
import { FinancialSettingsService } from './financial-settings.service';
import { PaymentDirection, PaymentMethod, AccountKind, Payment, InvoiceStatus, Prisma } from '@prisma/client';
import { money, moneyGte } from '../../common/utils/money';
import { PayrollService } from '../../payroll/payroll.service';

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
    ) { }

    // ==================== EXPENSES (manual) ====================

    async getExpenses(companyId: string) {
        return this.prisma.expense.findMany({
            where: { companyId, isDeleted: false },
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

    async getIncomes(companyId: string) {
        return this.prisma.income.findMany({
            where: { companyId, isDeleted: false },
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
    }) {
        await this.financialSettingsService.ensureCompanyFinanceSettings(companyId);
        const amt = money(data.amount);
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

        if (!accountId) {
            const kind = data.method === PaymentMethod.CASH ? AccountKind.CASH : AccountKind.BANK;
            const defaultAcc = await this.prisma.financeAccount.findFirst({
                where: { companyId, kind, isDefault: true, isActive: true },
            });
            accountId = defaultAcc?.id;
        }

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
        });
        if (!payment) throw new NotFoundException('Платеж не найден');

        await this.periodClosingService.checkPeriodNotClosed(companyId, payment.date);
        if (data.date && new Date(data.date).getTime() !== new Date(payment.date).getTime()) {
            await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        }

        // Меняем сумму платежа по заявке, чей счёт уже подтверждён оплаченным (PAID) —
        // это рассинхронит флаг «оплачено» с реальной суммой платежей (см. M-6).
        if (data.amount !== undefined && payment.orderId) {
            const relatedOrder = await this.prisma.order.findUnique({
                where: { id: payment.orderId },
                select: {
                    outgoingInvoice: { select: { status: true } },
                    incomingInvoice: { select: { status: true } },
                },
            });
            const relevantInvoiceStatus = payment.direction === PaymentDirection.IN
                ? relatedOrder?.outgoingInvoice?.status
                : relatedOrder?.incomingInvoice?.status;
            if (relevantInvoiceStatus === InvoiceStatus.PAID) {
                throw new BadRequestException('Нельзя изменить сумму платежа: счёт по этой заявке уже отмечен оплаченным. Сначала измените статус счёта.');
            }
        }

        const amt = data.amount !== undefined ? money(data.amount) : payment.amount;
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
        });
        if (!payment) throw new NotFoundException('Платеж не найден');

        await this.periodClosingService.checkPeriodNotClosed(companyId, payment.date);

        // Счёт по заявке уже подтверждён оплаченным (PAID) — удаление платежа
        // напрямую (в обход смены статуса счёта) рассинхронит флаг «оплачено»
        // с реальной суммой платежей (см. M-6). Сначала нужно снять PAID со счёта.
        if (payment.orderId) {
            const relatedOrder = await this.prisma.order.findUnique({
                where: { id: payment.orderId },
                select: {
                    outgoingInvoice: { select: { status: true } },
                    incomingInvoice: { select: { status: true } },
                },
            });
            const relevantInvoiceStatus = payment.direction === PaymentDirection.IN
                ? relatedOrder?.outgoingInvoice?.status
                : relatedOrder?.incomingInvoice?.status;
            if (relevantInvoiceStatus === InvoiceStatus.PAID) {
                throw new BadRequestException('Нельзя удалить платёж: счёт по этой заявке уже отмечен оплаченным. Сначала измените статус счёта.');
            }
        }

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
                outgoingInvoice: true,
                incomingInvoice: true,
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
        const hasPaidOutgoingInvoice = order.outgoingInvoice?.status === InvoiceStatus.PAID;
        const customerPayments = await tx.payment.findMany({
            where: {
                orderId,
                direction: PaymentDirection.IN,
                isDeleted: false,
                ...(forwarderCompanyId && { companyId: forwarderCompanyId }),
            },
        });
        const paidIn = customerPayments.reduce((sum, p) => sum + p.amount, 0);
        const revenue = order.customerPrice || 0;
        const isCustomerPaid = hasPaidOutgoingInvoice || (revenue > 0 && moneyGte(paidIn, revenue));
        const customerPaidBecameTrue = !order.isCustomerPaid && isCustomerPaid;

        // Sync Driver / Sub-forwarder Paid Flag
        const hasPaidIncomingInvoice = order.incomingInvoice?.status === InvoiceStatus.PAID;
        const executorPayments = await tx.payment.findMany({
            where: {
                orderId,
                direction: PaymentDirection.OUT,
                isDeleted: false,
                ...(forwarderCompanyId && { companyId: forwarderCompanyId }),
            },
        });
        const paidOut = executorPayments.reduce((sum, p) => sum + p.amount, 0);

        let isDriverPaid = false;
        let driverPaidAt = null;
        let isSubForwarderPaid = false;
        let subForwarderPaidAt = null;

        if (order.subForwarderId) {
            const subForwarderPrice = order.subForwarderPrice || 0;
            isSubForwarderPaid = hasPaidIncomingInvoice || (subForwarderPrice > 0 && moneyGte(paidOut, subForwarderPrice));
            // Дата оплаты — снимок реального события платежа. Если платежи всё ещё
            // есть, но их стало недостаточно из-за повышения ставки задним числом,
            // дату не затираем (см. H-4) — обнуляем только когда платежей нет вовсе.
            subForwarderPaidAt = isSubForwarderPaid
                ? (order.subForwarderPaidAt || new Date())
                : (paidOut > 0 ? order.subForwarderPaidAt : null);
        } else {
            const driverCost = order.driverCost || 0;
            isDriverPaid = hasPaidIncomingInvoice || (driverCost > 0 && moneyGte(paidOut, driverCost));
            driverPaidAt = isDriverPaid
                ? (order.driverPaidAt || new Date())
                : (paidOut > 0 ? order.driverPaidAt : null);
        }

        await tx.order.update({
            where: { id: orderId },
            data: {
                isCustomerPaid,
                customerPaidAt: isCustomerPaid
                    ? (order.customerPaidAt || new Date())
                    : (paidIn > 0 ? order.customerPaidAt : null),
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
            const paidIn = payments.reduce((sum, p) => sum + p.amount, 0);
            const balance = money((order.customerPrice || 0) - paidIn);
            if (balance > 0) {
                await this.createPayment(companyId, userId, {
                    orderId,
                    counterpartyId: order.customerCompanyId || undefined,
                    direction: PaymentDirection.IN,
                    amount: balance,
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
            const paidOut = payments.reduce((sum, p) => sum + p.amount, 0);
            const balance = money((order.driverCost || 0) - paidOut);
            if (balance > 0) {
                await this.createPayment(companyId, userId, {
                    orderId,
                    direction: PaymentDirection.OUT,
                    amount: balance,
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
            const paidOut = payments.reduce((sum, p) => sum + p.amount, 0);
            const balance = money((order.subForwarderPrice || 0) - paidOut);
            if (balance > 0) {
                await this.createPayment(companyId, userId, {
                    orderId,
                    counterpartyId: order.subForwarderId || undefined,
                    direction: PaymentDirection.OUT,
                    amount: balance,
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
