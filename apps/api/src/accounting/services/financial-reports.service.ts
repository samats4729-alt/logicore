import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { FinanceCalculatorService, ORDER_FINANCE_RELATIONS_SELECT, ORDER_FINANCE_SELECT } from './finance-calculator.service';
import { PeriodClosingService } from './period-closing.service';
import { v4 as uuidv4 } from 'uuid';
import { PaymentDirection, PaymentMethod, Prisma, AccountKind, StockMoveType, AccountingDocumentStatus, AccountingDocumentType, AccountingDocumentDirection } from '@prisma/client';
import { D, Money, ZERO, money, positiveRest, roundMoney, sumOf, toNum, toNumOrNull } from '../../common/utils/money';
import { PaymentsService } from './payments.service';
import { FinancialSettingsService } from './financial-settings.service';
import { EXCLUDED_INCOME_CATEGORIES, EXCLUDED_EXPENSE_CATEGORIES } from '../constants';
import { JournalQueryDto } from '../dto/accounting.dto';
import { getPaginationParams } from '../../common/dto/pagination.dto';
import * as XLSX from 'xlsx';
import { SharedReportLinkService } from './shared-report-link.service';
import { CurrencyRevaluationService } from './currency-revaluation.service';
import { kzToday } from '../../common/utils/business-date';
import { exchangeOutcome, paymentInBase } from './exchange-difference';

/** Учётная валюта: в ней ведутся все итоги отчётов. */
const BASE_CURRENCY = 'KZT';

@Injectable()
export class FinancialReportsService {
    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
        private configService: ConfigService,
        private calculator: FinanceCalculatorService,
        private periodClosing: PeriodClosingService,
        private paymentsService: PaymentsService,
        private settingsService: FinancialSettingsService,
        private shareLinks: SharedReportLinkService,
        private revaluations: CurrencyRevaluationService,
    ) { }


    /**
     * Разбор параметров журнала: период и страница.
     *
     * Период фильтрует по дате создания заявки — это её дата в журнале, по
     * ней же идёт сортировка. `to` расширяется до конца суток, иначе
     * «по 31 июля» терял всё, что заведено в этот день после полуночи.
     *
     * Страница считается только если её попросили: без `page`/`limit` метод
     * обязан вернуть массив, как раньше.
     */
    private journalScope(query?: JournalQueryDto) {
        const from = query?.from ? new Date(query.from) : null;
        const to = query?.to ? new Date(query.to) : null;
        if (to) to.setUTCHours(23, 59, 59, 999);
        if (from && to && from > to) {
            throw new BadRequestException('Начало периода позже его окончания');
        }

        const createdAt = from || to
            ? { gte: from ?? undefined, lte: to ?? undefined }
            : undefined;

        const paginated = Boolean(query?.page || query?.limit);
        const { page, limit, skip, take } = getPaginationParams(query ?? {});
        return {
            createdAt,
            paginated,
            page,
            limit,
            skip: paginated ? skip : undefined,
            take: paginated ? take : undefined,
        };
    }

    /** Ответ журнала: массив по умолчанию, страница — по запросу. */
    private journalResult<T>(rows: T[], total: number, scope: ReturnType<FinancialReportsService['journalScope']>) {
        if (!scope.paginated) return rows;
        return {
            data: rows,
            total,
            page: scope.page,
            limit: scope.limit,
            totalPages: Math.max(1, Math.ceil(total / scope.limit)),
        };
    }

    // ==================== ORDER FINANCIALS ====================

    async getOrderFinancials(companyId: string, orderId: string) {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { customerCompanyId: companyId },
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            },
            include: {
                customerCompany: { select: { id: true, name: true } },
                customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
                forwarder: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                responsibleManager: { select: { id: true, firstName: true, lastName: true } },
                responsibles: {
                    include: {
                        user: { select: { id: true, firstName: true, lastName: true } },
                        company: { select: { id: true, name: true } },
                    },
                },
                statusHistory: { orderBy: { changedAt: 'desc' } },
                driver: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        middleName: true,
                        phone: true,
                        iin: true,
                        vehicleType: true,
                        vehiclePlate: true,
                        vehicleModel: true,
                        trailerNumber: true,
                        docType: true,
                        docNumber: true,
                        docIssuedAt: true,
                        docExpiresAt: true,
                        docIssuedBy: true,
                    }
                },
                partner: { select: { id: true, name: true } },
                assignees: {
                    include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
                    orderBy: { assignedAt: 'desc' },
                },
                changeLog: {
                    include: { user: { select: { id: true, firstName: true, lastName: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                },
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        const isCustomer = order.customerCompanyId === companyId;

        // Платежи всего заказа нужны калькулятору (оплата заказчика/суб-экспедитора
        // определяется по платежам экспедитора); на экран отдаём только свои.
        const [allPayments, incomes, expenses] = await Promise.all([
            this.prisma.payment.findMany({
                where: { orderId, isDeleted: false },
                orderBy: { date: 'desc' },
                include: { counterparty: { select: { name: true } } },
            }),
            this.prisma.income.findMany({
                where: { orderId, companyId },
                orderBy: { date: 'desc' },
            }),
            isCustomer
                ? []
                : this.prisma.expense.findMany({
                    where: { orderId, companyId },
                    orderBy: { date: 'desc' },
                }),
        ]);

        const payments = allPayments.filter(p => p.companyId === companyId);

        const fin = this.calculator.computeOrderFinance({
            order,
            payments: allPayments,
            incomes,
            expenses,
            companyId,
        });

        if (isCustomer) {
            return {
                order: {
                    ...order,
                    driverCost: null,
                    subForwarderPrice: null,
                    subForwarderId: null,
                    isDriverPaid: false,
                    driverPaidAt: null,
                    isSubForwarderPaid: false,
                    subForwarderPaidAt: null,
                    partner: null,
                    subForwarder: null,
                },
                payments,
                incomes,
                expenses: [],
                summary: {
                    /**
                     * Валюты сумм и их пересчёт — чтобы экран не выдавал
                     * рубли за тенге. Если курса не нашлось, суммы в расчёт
                     * не вошли, и об этом сказано прямо: молчаливая цифра
                     * тут хуже отсутствующей.
                     */
                    currency: (order as any).currency || 'KZT',
                    driverCostCurrency: (order as any).driverCostCurrency || 'KZT',
                    customerPriceBase: toNum((order as any).customerPriceBase),
                    driverCostBase: toNum((order as any).driverCostBase),
                    unconvertedCurrencies: fin.unconvertedCurrencies,
                    customerPrice: order.customerPrice || 0,
                    driverCost: 0,
                    subForwarderPrice: 0,
                    executorCost: 0,
                    margin: 0,
                    totalIncomes: fin.paidIn,
                    totalExpenses: 0,
                    balance: fin.paidIn,
                    isCustomerPaid: fin.isCustomerPaid,
                    isDriverPaid: false,
                    isSubForwarderPaid: false,
                    customerDebt: toNum(fin.customerDebt),
                    driverDebt: 0,
                    subForwarderDebt: 0,
                    executorDebt: 0,
                    revenueNet: 0,
                    revenueVat: 0,
                    executorCostNet: fin.executorCostNet,
                    executorCostVat: fin.executorCostVat,
                },
            };
        }

        return {
            order,
            payments,
            incomes,
            expenses,
            summary: {
                /**
                 * Валюты сумм и их пересчёт — чтобы экран не выдавал
                 * рубли за тенге. Если курса не нашлось, суммы в расчёт
                 * не вошли, и об этом сказано прямо: молчаливая цифра
                 * тут хуже отсутствующей.
                 */
                currency: (order as any).currency || 'KZT',
                driverCostCurrency: (order as any).driverCostCurrency || 'KZT',
                customerPriceBase: toNum((order as any).customerPriceBase),
                driverCostBase: toNum((order as any).driverCostBase),
                unconvertedCurrencies: fin.unconvertedCurrencies,
                customerPrice: toNum(order.customerPrice),
                driverCost: toNum(order.driverCost),
                subForwarderPrice: toNum(order.subForwarderPrice),
                executorCost: toNum(fin.executorCost),
                margin: toNum(fin.margin),
                totalIncomes: toNum(fin.paidIn.plus(fin.extraIncomes)),
                totalExpenses: toNum(fin.paidOut.plus(fin.otherExpenses)),
                balance: toNum(fin.paidIn.plus(fin.extraIncomes).minus(fin.paidOut).minus(fin.otherExpenses)),
                isCustomerPaid: fin.isCustomerPaid,
                isDriverPaid: order.subForwarderId ? false : fin.isExecutorPaid,
                isSubForwarderPaid: order.subForwarderId ? fin.isExecutorPaid : false,
                customerDebt: toNum(fin.customerDebt),
                driverDebt: order.subForwarderId ? 0 : toNum(fin.executorDebt),
                subForwarderDebt: order.subForwarderId ? toNum(fin.executorDebt) : 0,
                executorDebt: toNum(fin.executorDebt),
                revenueNet: toNum(fin.revenueNet),
                revenueVat: toNum(fin.revenueVat),
                executorCostNet: toNum(fin.executorCostNet),
                executorCostVat: toNum(fin.executorCostVat),
            },
        };
    }

    async updateOrderFinance(companyId: string, orderId: string, data: {
        customerPrice?: number;
        driverCost?: number;
        subForwarderPrice?: number;
        customerPaymentCondition?: string;
        customerPaymentForm?: string;
        driverPaymentCondition?: string;
        driverPaymentForm?: string;
        vatRate?: number;
        hasVat?: boolean;
        executorVatRate?: number;
        executorHasVat?: boolean;
    }, userId: string) {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { customerCompanyId: companyId },
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        const orderDate = order.completedAt || order.createdAt;
        await this.periodClosing.checkPeriodNotClosed(companyId, orderDate);

        const detailsParts: string[] = [];
        if (data.customerPrice !== undefined && !D(order.customerPrice).equals(data.customerPrice)) {
            detailsParts.push(`Ставка заказчика: ${toNum(order.customerPrice)} -> ${data.customerPrice}`);
        }
        if (data.driverCost !== undefined && !D(order.driverCost).equals(data.driverCost)) {
            detailsParts.push(`Ставка перевозчика: ${toNum(order.driverCost)} -> ${data.driverCost}`);
        }
        if (data.subForwarderPrice !== undefined && !D(order.subForwarderPrice).equals(data.subForwarderPrice)) {
            detailsParts.push(`Ставка суб-экспедитора: ${toNum(order.subForwarderPrice)} -> ${data.subForwarderPrice}`);
        }
        if (data.vatRate !== undefined && !D(order.vatRate).equals(data.vatRate)) {
            detailsParts.push(`Ставка НДС: ${toNum(order.vatRate)}% -> ${data.vatRate}%`);
        }
        if (data.hasVat !== undefined && data.hasVat !== order.hasVat) {
            detailsParts.push(`НДС заказчика: ${order.hasVat ? 'Да' : 'Нет'} -> ${data.hasVat ? 'Да' : 'Нет'}`);
        }
        if (data.executorVatRate !== undefined && !D(order.executorVatRate).equals(data.executorVatRate)) {
            detailsParts.push(`Ставка НДС исполнителя: ${toNum(order.executorVatRate)}% -> ${data.executorVatRate}%`);
        }
        if (data.executorHasVat !== undefined && data.executorHasVat !== order.executorHasVat) {
            detailsParts.push(`НДС исполнителя: ${order.executorHasVat ? 'Да' : 'Нет'} -> ${data.executorHasVat ? 'Да' : 'Нет'}`);
        }

        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                ...(data.customerPrice !== undefined && { customerPrice: data.customerPrice }),
                ...(data.driverCost !== undefined && { driverCost: data.driverCost }),
                ...(data.subForwarderPrice !== undefined && { subForwarderPrice: data.subForwarderPrice }),
                ...(data.customerPaymentCondition !== undefined && { customerPaymentCondition: data.customerPaymentCondition }),
                ...(data.customerPaymentForm !== undefined && { customerPaymentForm: data.customerPaymentForm }),
                ...(data.driverPaymentCondition !== undefined && { driverPaymentCondition: data.driverPaymentCondition }),
                ...(data.driverPaymentForm !== undefined && { driverPaymentForm: data.driverPaymentForm }),
                ...(data.vatRate !== undefined && { vatRate: data.vatRate }),
                ...(data.hasVat !== undefined && { hasVat: data.hasVat }),
                ...(data.executorVatRate !== undefined && { executorVatRate: data.executorVatRate }),
                ...(data.executorHasVat !== undefined && { executorHasVat: data.executorHasVat }),
            },
        });

        if (detailsParts.length > 0) {
            await this.prisma.orderChangeLog.create({
                data: {
                    orderId,
                    userId,
                    action: 'finance_updated',
                    details: `Обновлены финансовые параметры: ${detailsParts.join(', ')}`
                }
            });
        }

        await this.paymentsService.syncOrderPaymentFlags(orderId);

        return updated;
    }

    // ==================== FINANCIAL REGISTRY ====================

    async getFinancialRegistry(companyId: string, query?: JournalQueryDto) {
        const scope = this.journalScope(query);
        const registryWhere: Prisma.OrderWhereInput = {
            AND: [
                {
                    OR: [
                        { customerCompanyId: companyId },
                        { forwarderId: companyId },
                        { partnerId: companyId },
                        { subForwarderId: companyId },
                        { responsibleManager: { companyId: companyId } },
                    ]
                },
                {
                    OR: [
                        { isConfirmed: true },
                        { status: { not: 'PENDING' } }
                    ]
                }
            ],
            status: { notIn: ['DRAFT', 'CANCELLED'] },
            createdAt: scope.createdAt,
        };
        const registryTotal = scope.paginated
            ? await this.prisma.order.count({ where: registryWhere })
            : 0;
        const orders = await this.prisma.order.findMany({
            where: registryWhere,
            include: {
                customerCompany: { select: { id: true, name: true } },
                forwarder: { select: { id: true, name: true } },
                driver: { select: { id: true, firstName: true, lastName: true } },
                partner: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                routePoints: { select: { pointType: true, sequence: true, location: { select: { address: true, city: true } } }, orderBy: { sequence: 'asc' } },
                ...ORDER_FINANCE_RELATIONS_SELECT,
                // Выставлен ли по рейсу счёт — в обе стороны. Отменённые не в
                // счёт: по ним расчётов нет, и рейс снова «без счёта».
                accountingDocuments: {
                    where: {
                        document: {
                            type: AccountingDocumentType.PAYMENT_INVOICE,
                            status: { not: AccountingDocumentStatus.CANCELLED },
                        },
                    },
                    select: { document: { select: { direction: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip: scope.skip,
            take: scope.take,
        });

        const rows = orders.map(order => {
            const isCustomer = order.customerCompanyId === companyId;
            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            const mapped = {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                status: order.status,
                cargoDescription: order.cargoDescription,
                completedAt: order.completedAt,
                customerPrice: order.customerPrice,
                customerPriceType: order.customerPriceType,
                // Ставки — в валюте заявки, а долги, оплаты и маржа ниже —
                // всегда в тенге по курсу на дату рейса. Разные колонки в
                // разных валютах: без этих полей веб показал бы доллары под
                // знаком ₸.
                currency: order.currency,
                driverCostCurrency: order.driverCostCurrency,
                // Валюта ставки суб-экспедитора своя: заявка может быть в
                // рублях, а с перевозчиком договорились в тенге.
                subForwarderPriceCurrency: order.subForwarderPriceCurrency || order.currency,
                customerPriceBase: toNumOrNull(order.customerPriceBase),
                driverCostBase: toNumOrNull(order.driverCostBase),
                subForwarderPriceBase: toNumOrNull(order.subForwarderPriceBase),
                isCustomerPaid: fin.isCustomerPaid,
                customerPaidAt: order.customerPaidAt,
                driverCost: isCustomer ? null : order.driverCost,
                subForwarderPrice: isCustomer ? null : order.subForwarderPrice,
                subForwarderId: isCustomer ? null : order.subForwarderId,
                isDriverPaid: isCustomer ? false : (order.subForwarderId ? false : fin.isExecutorPaid),
                driverPaidAt: order.driverPaidAt,
                isSubForwarderPaid: isCustomer ? false : (order.subForwarderId ? fin.isExecutorPaid : false),
                subForwarderPaidAt: order.subForwarderPaidAt,
                customerCompanyId: order.customerCompanyId,
                customerCompany: order.customerCompany,
                forwarder: order.forwarder,
                assignedDriverName: order.assignedDriverName,
                driver: order.driver,
                partner: order.partner,
                subForwarder: order.subForwarder,
                routePoints: order.routePoints,
                margin: isCustomer ? null : fin.margin,
                customerDebt: toNum(fin.customerDebt),
                executorDebt: toNum(fin.executorDebt),
                paidIn: toNum(fin.paidIn),
                paidOut: toNum(fin.paidOut),
                executorCost: isCustomer ? null : fin.executorCost,
                // Валюта, для которой не нашлось курса: суммы по этой заявке
                // неполные, и строку нужно пометить, а не показать как обычную.
                unconvertedCurrencies: fin.unconvertedCurrencies,
                // Рейс без счёта — это деньги, которых мы ещё не попросили.
                // Их не видно ни в дебиторке (долга нет, пока нет счёта), ни
                // в списке неоплаченных счетов — только здесь.
                hasCustomerInvoice: (order as any).accountingDocuments?.some(
                    (link: any) => link.document.direction === AccountingDocumentDirection.OUTGOING,
                ) ?? false,
                hasCarrierInvoice: isCustomer ? false : ((order as any).accountingDocuments?.some(
                    (link: any) => link.document.direction === AccountingDocumentDirection.INCOMING,
                ) ?? false),
            };

            if (isCustomer) {
                mapped.driverCost = null;
                mapped.subForwarderPrice = null;
                mapped.subForwarderId = null;
                mapped.isDriverPaid = false;
                mapped.driverPaidAt = null;
                mapped.isSubForwarderPaid = false;
                mapped.subForwarderPaidAt = null;
                mapped.partner = null;
                mapped.subForwarder = null;
                mapped.executorCost = null;
            }

            return mapped;
        });

        return this.journalResult(rows, registryTotal, scope);
    }

    /**
     * Планируемые платежи: чего ждём и что должны заплатить сами.
     *
     * Отсчёт идёт ОТ ВЫСТАВЛЕННОГО СЧЁТА, а не от даты, вписанной в карточку
     * рейса руками. Так это и работает в бухгалтерии: пока счёт не выставлен
     * («не закрыжен»), платить контрагенту не с чего и требовать оплату не
     * на основании чего, а дата в заявке — это лишь договорённость менеджера.
     *
     * Раньше список строился из заявок и брал срок из
     * `customerPaymentDate`/`driverPaymentDate`. Долг попадал в план, даже
     * если счёта не существовало, а срок жил своей жизнью: счёт мог быть
     * выставлен позже с совсем другим сроком оплаты.
     *
     * Сделки с долгом, но без счёта, не исчезают: они возвращаются
     * отдельным блоком `withoutInvoice`, чтобы бухгалтер видел, что именно
     * не оформлено, а не короткий список без объяснений.
     */
    async getPlannedPayments(companyId: string, query?: JournalQueryDto) {
        const scope = this.journalScope(query);

        const documents = await this.prisma.accountingDocument.findMany({
            where: {
                companyId,
                type: AccountingDocumentType.PAYMENT_INVOICE,
                // Черновик никому не отправлен: обязательства он не создаёт.
                status: AccountingDocumentStatus.POSTED,
                balanceDue: { gt: 0 },
                ...(scope.createdAt ? { documentDate: scope.createdAt } : {}),
            },
            orderBy: [{ dueDate: 'asc' }, { documentDate: 'asc' }],
            select: {
                id: true,
                number: true,
                direction: true,
                documentDate: true,
                dueDate: true,
                total: true,
                amountPaid: true,
                balanceDue: true,
                counterparty: { select: { id: true, name: true } },
                orders: { select: { order: { select: { id: true, orderNumber: true } } } },
            },
        });

        const today = kzToday();

        const rows = documents.map((doc) => {
            const orders = doc.orders.map((link) => link.order);
            return {
                documentId: doc.id,
                invoiceNumber: doc.number,
                // Ссылка на рейс остаётся: по счёту их может быть несколько,
                // в строку кладём первый, полный список — рядом.
                orderId: orders[0]?.id ?? null,
                orderNumber: orders.map((o) => o.orderNumber).join(', ') || '—',
                orders,
                direction: doc.direction === AccountingDocumentDirection.OUTGOING ? 'IN' : 'OUT',
                party: doc.counterparty.name,
                counterpartyId: doc.counterparty.id,
                amount: toNum(doc.balanceDue),
                invoiceTotal: toNum(doc.total),
                paidAmount: toNum(doc.amountPaid),
                issuedAt: doc.documentDate,
                dueDate: doc.dueDate,
                isOverdue: !!doc.dueDate && doc.dueDate < today,
            };
        });

        // Сортировка: сперва с датой (по возрастанию), потом без даты
        rows.sort((a, b) => {
            if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return 0;
        });

        const totalIn = rows.filter(r => r.direction === 'IN').reduce((s, r) => s + r.amount, 0);
        const totalOut = rows.filter(r => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0);
        const overdueIn = rows.filter(r => r.direction === 'IN' && r.isOverdue).reduce((s, r) => s + r.amount, 0);
        const overdueOut = rows.filter(r => r.direction === 'OUT' && r.isOverdue).reduce((s, r) => s + r.amount, 0);

        return {
            rows,
            totals: { totalIn, totalOut, overdueIn, overdueOut },
            withoutInvoice: await this.debtWithoutInvoice(companyId, scope),
        };
    }

    /**
     * Долги, по которым счёт ещё не выставлен.
     *
     * Это не платежи, а работа для бухгалтера: пока счёта нет, срок оплаты
     * не начался. Показываем сумму и несколько примеров, чтобы из плана
     * платежей было видно, чего в нём не хватает.
     */
    private async debtWithoutInvoice(companyId: string, scope: ReturnType<FinancialReportsService['journalScope']>) {
        const orders = await this.prisma.order.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { customerCompanyId: companyId },
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { subForwarderId: companyId },
                            { responsibleManager: { companyId } },
                        ],
                    },
                    {
                        OR: [
                            { isConfirmed: true },
                            { status: { not: 'PENDING' } },
                        ],
                    },
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                createdAt: scope.createdAt,
                // Ни одного действующего счёта по рейсу — ни нашего, ни чужого.
                accountingDocuments: {
                    none: {
                        document: {
                            type: AccountingDocumentType.PAYMENT_INVOICE,
                            status: AccountingDocumentStatus.POSTED,
                        },
                    },
                },
            },
            include: {
                customerCompany: { select: { id: true, name: true } },
                forwarder: { select: { id: true, name: true } },
                partner: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                ...ORDER_FINANCE_RELATIONS_SELECT,
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });

        let amountIn = ZERO;
        let amountOut = ZERO;
        let withDebt = 0;
        const items: any[] = [];

        for (const order of orders) {
            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });
            // Канонический флаг оплаты важнее арифметики: платёж мог
            // провести встречная сторона, тогда мы его не видим, но рейс
            // закрыт и оформлять по нему уже нечего.
            const customerDebt = fin.isCustomerPaid ? ZERO : fin.customerDebt;
            const executorDebt = fin.isExecutorPaid ? ZERO : fin.executorDebt;
            if (customerDebt.lte(0) && executorDebt.lte(0)) continue;

            withDebt += 1;
            amountIn = amountIn.plus(customerDebt);
            amountOut = amountOut.plus(executorDebt);
            if (items.length < 10) {
                items.push({
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    party: order.customerCompany?.name ?? order.subForwarder?.name ?? null,
                    amountIn: toNum(customerDebt),
                    amountOut: toNum(executorDebt),
                });
            }
        }

        return {
            count: withDebt,
            totalIn: toNum(amountIn),
            totalOut: toNum(amountOut),
            items,
        };
    }

    // ==================== PAYMENT JOURNAL ====================

    async getIncomesJournal(companyId: string, query?: JournalQueryDto) {
        const scope = this.journalScope(query);
        const where: Prisma.OrderWhereInput = {
            AND: [
                {
                    OR: [
                        { forwarderId: companyId },
                        { partnerId: companyId },
                        { subForwarderId: companyId },
                        { responsibleManager: { companyId: companyId } },
                    ]
                },
                { customerCompanyId: { not: companyId } },
                {
                    OR: [
                        { isConfirmed: true },
                        { status: { not: 'PENDING' } }
                    ]
                }
            ],
            customerPrice: { not: null },
            status: { notIn: ['DRAFT', 'CANCELLED'] },
            createdAt: scope.createdAt,
        };
        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where,
                include: {
                    customerCompany: { select: { id: true, name: true } },
                    customer: { select: { id: true, firstName: true, lastName: true } },
                    ...ORDER_FINANCE_RELATIONS_SELECT,
                },
                orderBy: { createdAt: 'desc' },
                skip: scope.skip,
                take: scope.take,
            }),
            scope.paginated ? this.prisma.order.count({ where }) : Promise.resolve(0),
        ]);

        const rows = orders.map(order => {
            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            return {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                status: order.status,
                cargoDescription: order.cargoDescription,
                customerPrice: order.customerPrice,
                customerPriceType: order.customerPriceType,
                isCustomerPaid: fin.isCustomerPaid,
                customerPaidAt: order.customerPaidAt,
                customerPaymentCondition: order.customerPaymentCondition,
                customerPaymentForm: order.customerPaymentForm,
                completedAt: order.completedAt,
                customerCompany: order.customerCompany,
                customer: order.customer,
            };
        });

        return this.journalResult(rows, total, scope);
    }

    async getExpensesJournal(companyId: string, query?: JournalQueryDto) {
        const scope = this.journalScope(query);
        const where: Prisma.OrderWhereInput = {
            AND: [
                {
                    OR: [
                        { forwarderId: companyId },
                        { partnerId: companyId },
                        { subForwarderId: companyId },
                        { responsibleManager: { companyId: companyId } },
                    ]
                },
                { customerCompanyId: { not: companyId } },
                {
                    OR: [
                        { driverCost: { not: null } },
                        { subForwarderPrice: { not: null } }
                    ]
                },
                {
                    OR: [
                        { isConfirmed: true },
                        { status: { not: 'PENDING' } }
                    ]
                }
            ],
            status: { notIn: ['DRAFT', 'CANCELLED'] },
            createdAt: scope.createdAt,
        };
        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where,
                include: {
                    driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
                    partner: { select: { id: true, name: true } },
                    subForwarder: { select: { id: true, name: true } },
                    ...ORDER_FINANCE_RELATIONS_SELECT,
                },
                orderBy: { createdAt: 'desc' },
                skip: scope.skip,
                take: scope.take,
            }),
            scope.paginated ? this.prisma.order.count({ where }) : Promise.resolve(0),
        ]);

        const rows = orders.map(order => {
            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            return {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                status: order.status,
                cargoDescription: order.cargoDescription,
                driverCost: order.driverCost,
                subForwarderPrice: order.subForwarderPrice,
                subForwarderId: order.subForwarderId,
                isDriverPaid: order.subForwarderId ? false : fin.isExecutorPaid,
                driverPaidAt: order.driverPaidAt,
                isSubForwarderPaid: order.subForwarderId ? fin.isExecutorPaid : false,
                subForwarderPaidAt: order.subForwarderPaidAt,
                driverPaymentCondition: order.driverPaymentCondition,
                driverPaymentForm: order.driverPaymentForm,
                completedAt: order.completedAt,
                assignedDriverName: order.assignedDriverName,
                assignedDriverPhone: order.assignedDriverPhone,
                driver: order.driver,
                partner: order.partner,
                subForwarder: order.subForwarder,
            };
        });

        return this.journalResult(rows, total, scope);
    }

    async getCustomerExpensesJournal(companyId: string, query?: JournalQueryDto) {
        const scope = this.journalScope(query);
        const where: Prisma.OrderWhereInput = {
            customerCompanyId: companyId,
            customerPrice: { not: null },
            status: { notIn: ['DRAFT', 'CANCELLED'] },
            createdAt: scope.createdAt,
        };
        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where,
                include: {
                    forwarder: { select: { id: true, name: true } },
                    ...ORDER_FINANCE_RELATIONS_SELECT,
                },
                orderBy: { createdAt: 'desc' },
                skip: scope.skip,
                take: scope.take,
            }),
            scope.paginated ? this.prisma.order.count({ where }) : Promise.resolve(0),
        ]);

        const rows = orders.map(order => {
            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            return {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                status: order.status,
                cargoDescription: order.cargoDescription || '',
                customerPrice: order.customerPrice,
                isCustomerPaid: fin.isCustomerPaid,
                customerPaidAt: order.customerPaidAt,
                forwarder: order.forwarder,
            };
        });

        return this.journalResult(rows, total, scope);
    }

    // ==================== COUNTERPARTY REPORT ====================

    /**
     * Взаиморасчёты по контрагентам.
     *
     * includeOrders=false опускает список заявок по каждому контрагенту. Он
     * составляет почти весь объём ответа (на 5000 заявок это 2.4 МБ против
     * нескольких килобайт), а дашборду нужны только итоги и топ должников.
     */
    /**
     * Состояние оплаты строки рейса.
     *
     * Раньше отдавался только флаг «оплачено да/нет», и частичная оплата
     * выглядела как полная неоплата: по строке нельзя было понять, пришла
     * половина денег или ничего. Здесь и сумма, и остаток, и состояние.
     */
    private orderPaymentView(amount: Money, paid: Money, isPaidFlag: boolean) {
        const rest = positiveRest(amount, paid);
        // Флаг остаётся ведущим: он считается с видимостью платежей обеих
        // сторон, а `paid` — только теми, что видит эта компания.
        const paymentState = isPaidFlag || rest.lte(0)
            ? 'PAID'
            : paid.gt(0)
                ? 'PARTIAL'
                : 'UNPAID';
        return {
            amount: toNum(amount),
            paidAmount: toNum(paid),
            remaining: toNum(rest),
            paymentState,
            isPaid: isPaidFlag,
        };
    }

    async getCounterpartyReport(companyId: string, options?: { includeOrders?: boolean }) {
        const includeOrders = options?.includeOrders !== false;
        const orders = await this.prisma.order.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { customerCompanyId: companyId },
                            { forwarderId: companyId },
                            { subForwarderId: companyId },
                            { partnerId: companyId },
                        ],
                    },
                    {
                        OR: [
                            { isConfirmed: true },
                            { status: { not: 'PENDING' } },
                        ],
                    },
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            include: {
                customerCompany: { select: { id: true, name: true } },
                forwarder: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                partner: { select: { id: true, name: true } },
                driver: { select: { firstName: true, lastName: true, vehiclePlate: true, vehicleModel: true } },
                routePoints: {
                    select: {
                        pointType: true,
                        sequence: true,
                        location: { select: { city: true, address: true } },
                    },
                    orderBy: { sequence: 'asc' },
                },
                ...ORDER_FINANCE_RELATIONS_SELECT,
                // Счета и акты новой модели: по ним видно, выставлен ли
                // документ на этот рейс и сколько по нему уже пришло.
                accountingDocuments: {
                    select: {
                        document: {
                            select: {
                                id: true,
                                number: true,
                                type: true,
                                direction: true,
                                status: true,
                                currency: true,
                                total: true,
                                amountPaid: true,
                                balanceDue: true,
                                totalBase: true,
                                dueDate: true,
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Начальные долги контрагентов (ввод остатков)
        const openings = await this.prisma.counterpartyOpeningBalance.findMany({ where: { companyId } });
        const openingMap = new Map(openings.map(o => [o.counterpartyId, o]));

        const now = new Date();
        const isOverdue = (date: Date | null | undefined, paid: boolean) => !!date && !paid && new Date(date) < now;

        // Валюты, для которых не нашлось курса: такие суммы в долги не входят.
        const unconvertedCurrencies: string[] = [];

        const counterpartyMap = new Map<string, {
            counterparty: { id: string; name: string };
            ourRole: string;
            orders: any[];
            theyOweUs: Money;
            theyOweUsPaid: Money;
            weOweThem: Money;
            weOweThemPaid: Money;
            overdueTheyOweUs: Money;
            overdueWeOweThem: Money;
        }>();

        const getOrCreateEntry = (counterpartyId: string, counterpartyName: string, ourRole: string) => {
            const key = `${counterpartyId}__${ourRole}`;
            if (!counterpartyMap.has(key)) {
                counterpartyMap.set(key, {
                    counterparty: { id: counterpartyId, name: counterpartyName },
                    ourRole,
                    orders: [],
                    theyOweUs: ZERO,
                    theyOweUsPaid: ZERO,
                    weOweThem: ZERO,
                    weOweThemPaid: ZERO,
                    overdueTheyOweUs: ZERO,
                    overdueWeOweThem: ZERO,
                });
            }
            return counterpartyMap.get(key)!;
        };

        for (const order of orders) {
            const isCustomer = order.customerCompanyId === companyId;
            const isForwarder = order.forwarderId === companyId || order.partnerId === companyId;
            const isSubForwarder = order.subForwarderId === companyId;

            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });
            unconvertedCurrencies.push(...fin.unconvertedCurrencies);

            // Водитель и машина: приоритет — вручную назначенные поля, иначе из карточки водителя
            const driverName = order.assignedDriverName
                || (order.driver ? `${order.driver.lastName || ''} ${order.driver.firstName || ''}`.trim() : '')
                || null;
            const vehiclePlate = order.assignedDriverPlate || order.driver?.vehiclePlate || null;

            // Счёт на оплату по рейсу — в ту сторону, куда идут деньги.
            // Отменённый документ не считается выставленным.
            const liveDocuments = (order as any).accountingDocuments
                ?.map((link: any) => link.document)
                ?.filter((d: any) => d && d.status !== 'CANCELLED') ?? [];
            const invoiceFor = (direction: 'OUTGOING' | 'INCOMING') => {
                const doc = liveDocuments.find(
                    (d: any) => d.type === 'PAYMENT_INVOICE' && d.direction === direction,
                );
                return doc
                    ? {
                        id: doc.id,
                        number: doc.number,
                        status: doc.status,
                        // Валюта счёта: суммы по нему — в ней, а не в тенге.
                        // Без этого «1 000» долларового счёта уходило в веб
                        // и показывалось как тысяча тенге.
                        currency: doc.currency,
                        total: toNum(doc.total),
                        amountPaid: toNum(doc.amountPaid),
                        balanceDue: toNum(doc.balanceDue),
                        totalBase: toNumOrNull(doc.totalBase),
                        dueDate: doc.dueDate,
                    }
                    : null;
            };

            const orderData = {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                completedAt: order.completedAt,
                status: order.status,
                cargoDescription: order.cargoDescription,
                driverName,
                vehiclePlate,
                customerPrice: order.customerPrice,
                isCustomerPaid: fin.isCustomerPaid,
                customerPaidAt: order.customerPaidAt,
                routePoints: order.routePoints,
                // Заказчик не должен видеть себестоимость исполнителя (маржу
                // экспедитора/партнёра) — скрываем при просмотре со стороны заказчика.
                subForwarderId: isCustomer ? null : order.subForwarderId,
                subForwarderPrice: isCustomer ? null : order.subForwarderPrice,
                driverCost: isCustomer ? null : order.driverCost,
            };

            if (isCustomer && order.forwarder && order.forwarder.id !== companyId) {
                const entry = getOrCreateEntry(order.forwarder.id, order.forwarder.name, 'Заказчик');
                const amount = fin.executorCost;
                const paid = fin.paidOut;
                const overdue = isOverdue(order.driverPaymentDate, fin.isExecutorPaid);
                entry.weOweThem = entry.weOweThem.plus(amount);
                entry.weOweThemPaid = entry.weOweThemPaid.plus(paid);
                if (overdue) entry.overdueWeOweThem = entry.overdueWeOweThem.plus(positiveRest(amount, paid));
                entry.orders.push({
                    ...orderData,
                    ...this.orderPaymentView(amount, paid, fin.isExecutorPaid),
                    paidAt: order.customerPaidAt,
                    direction: 'weOwe',
                    dueDate: order.driverPaymentDate,
                    isOverdue: overdue,
                    invoice: invoiceFor('INCOMING'),
                });
            }

            if (isForwarder && order.customerCompany && order.customerCompany.id !== companyId) {
                const entry = getOrCreateEntry(order.customerCompany.id, order.customerCompany.name, 'Экспедитор');
                const amount = fin.revenue;
                const paid = fin.paidIn;
                const overdue = isOverdue(order.customerPaymentDate, fin.isCustomerPaid);
                entry.theyOweUs = entry.theyOweUs.plus(amount);
                entry.theyOweUsPaid = entry.theyOweUsPaid.plus(paid);
                if (overdue) entry.overdueTheyOweUs = entry.overdueTheyOweUs.plus(positiveRest(amount, paid));
                entry.orders.push({
                    ...orderData,
                    ...this.orderPaymentView(amount, paid, fin.isCustomerPaid),
                    paidAt: order.customerPaidAt,
                    direction: 'theyOwe',
                    dueDate: order.customerPaymentDate,
                    isOverdue: overdue,
                    invoice: invoiceFor('OUTGOING'),
                });
            }

            if (isForwarder && order.subForwarder && order.subForwarder.id !== companyId) {
                const entry = getOrCreateEntry(order.subForwarder.id, order.subForwarder.name, 'Экспедитор');
                const amount = fin.executorCost;
                const paid = fin.paidOut;
                const overdue = isOverdue(order.driverPaymentDate, fin.isExecutorPaid);
                entry.weOweThem = entry.weOweThem.plus(amount);
                entry.weOweThemPaid = entry.weOweThemPaid.plus(paid);
                if (overdue) entry.overdueWeOweThem = entry.overdueWeOweThem.plus(positiveRest(amount, paid));
                entry.orders.push({
                    ...orderData,
                    ...this.orderPaymentView(amount, paid, fin.isExecutorPaid),
                    paidAt: order.subForwarderPaidAt || order.driverPaidAt,
                    direction: 'weOwe',
                    dueDate: order.driverPaymentDate,
                    isOverdue: overdue,
                    invoice: invoiceFor('INCOMING'),
                });
            }

            if (isSubForwarder && order.forwarder && order.forwarder.id !== companyId) {
                const entry = getOrCreateEntry(order.forwarder.id, order.forwarder.name, 'Суб-экспедитор');
                const amount = fin.revenue;
                const paid = fin.paidIn;
                const overdue = isOverdue(order.customerPaymentDate, fin.isCustomerPaid);
                entry.theyOweUs = entry.theyOweUs.plus(amount);
                entry.theyOweUsPaid = entry.theyOweUsPaid.plus(paid);
                if (overdue) entry.overdueTheyOweUs = entry.overdueTheyOweUs.plus(positiveRest(amount, paid));
                entry.orders.push({
                    ...orderData,
                    ...this.orderPaymentView(amount, paid, fin.isCustomerPaid),
                    paidAt: order.subForwarderPaidAt,
                    direction: 'theyOwe',
                    dueDate: order.customerPaymentDate,
                    isOverdue: overdue,
                    invoice: invoiceFor('OUTGOING'),
                });
            }
        }

        // Контрагенты, у которых есть только начальный долг (заявок ещё не было),
        // тоже должны быть видны во взаиморасчётах
        const knownIds = new Set(Array.from(counterpartyMap.values()).map(e => e.counterparty.id));
        const openingOnly = openings.filter(
            o => (D(o.openingReceivable).gt(0) || D(o.openingPayable).gt(0)) && !knownIds.has(o.counterpartyId) && o.counterpartyId !== companyId,
        );
        if (openingOnly.length > 0) {
            const comps = await this.prisma.company.findMany({
                where: { id: { in: openingOnly.map(o => o.counterpartyId) } },
                select: { id: true, name: true },
            });
            const nameMap = new Map(comps.map(c => [c.id, c.name]));
            for (const o of openingOnly) {
                if (!nameMap.has(o.counterpartyId)) continue;
                getOrCreateEntry(o.counterpartyId, nameMap.get(o.counterpartyId)!, 'Контрагент');
            }
        }

        // Начальные долги применяем один раз на контрагента (запись хранит обе стороны)
        const appliedRecv = new Set<string>();
        const appliedPay = new Set<string>();

        const counterparties = Array.from(counterpartyMap.values()).map(entry => {
            const op = openingMap.get(entry.counterparty.id);
            let openingReceivable: Money = ZERO;
            let openingPayable: Money = ZERO;
            if (op) {
                if (D(op.openingReceivable).gt(0) && !appliedRecv.has(entry.counterparty.id)) {
                    openingReceivable = D(op.openingReceivable);
                    appliedRecv.add(entry.counterparty.id);
                }
                if (D(op.openingPayable).gt(0) && !appliedPay.has(entry.counterparty.id)) {
                    openingPayable = D(op.openingPayable);
                    appliedPay.add(entry.counterparty.id);
                }
            }
            return {
                ...entry,
                theyOweUs: toNum(entry.theyOweUs),
                theyOweUsPaid: toNum(entry.theyOweUsPaid),
                weOweThem: toNum(entry.weOweThem),
                weOweThemPaid: toNum(entry.weOweThemPaid),
                openingReceivable: toNum(openingReceivable),
                openingPayable: toNum(openingPayable),
                overdueTheyOweUs: toNum(entry.overdueTheyOweUs),
                overdueWeOweThem: toNum(entry.overdueWeOweThem),
                // Текущий долг = начальный + начислено − оплачено.
                //
                // Оплаты вычитаются: раньше их здесь не было, и «Баланс» на
                // странице взаиморасчётов показывал начисленный оборот, а не
                // долг — контрагент, заплативший 90 000 из 250 000, значился
                // должным 250 000, тогда как акт сверки по тем же данным давал
                // 160 000. Формула совпадает с конечным сальдо акта сверки:
                // начальное сальдо + дебет − кредит.
                //
                // Без обрезки по нулю, в отличие от unpaid* ниже: переплата
                // должна уводить баланс в минус (мы должны вернуть), а в
                // колонках «Нам должны»/«Мы должны» отрицательных сумм быть
                // не может.
                balance: toNum(
                    entry.theyOweUs.minus(entry.theyOweUsPaid).plus(openingReceivable)
                        .minus(entry.weOweThem.minus(entry.weOweThemPaid)).minus(openingPayable),
                ),
                unpaidTheyOweUs: toNum(positiveRest(entry.theyOweUs, entry.theyOweUsPaid).plus(openingReceivable)),
                unpaidWeOweThem: toNum(positiveRest(entry.weOweThem, entry.weOweThemPaid).plus(openingPayable)),
                totalOrders: entry.orders.length,
                // Список заявок по контрагенту — почти весь объём ответа.
                // Дашборду он не нужен, странице взаиморасчётов — нужен.
                ...(includeOrders ? {} : { orders: undefined }),
            };
        });

        counterparties.sort((a, b) => {
            const aUnpaid = a.unpaidTheyOweUs + a.unpaidWeOweThem;
            const bUnpaid = b.unpaidTheyOweUs + b.unpaidWeOweThem;
            return bUnpaid - aUnpaid;
        });

        const totals = {
            totalTheyOweUs: money(counterparties.reduce((s, c) => s + c.theyOweUs, 0)),
            totalWeOweThem: money(counterparties.reduce((s, c) => s + c.weOweThem, 0)),
            unpaidTheyOweUs: money(counterparties.reduce((s, c) => s + c.unpaidTheyOweUs, 0)),
            unpaidWeOweThem: money(counterparties.reduce((s, c) => s + c.unpaidWeOweThem, 0)),
            overdueTheyOweUs: money(counterparties.reduce((s, c) => s + c.overdueTheyOweUs, 0)),
            overdueWeOweThem: money(counterparties.reduce((s, c) => s + c.overdueWeOweThem, 0)),
            openingReceivable: money(counterparties.reduce((s, c) => s + c.openingReceivable, 0)),
            openingPayable: money(counterparties.reduce((s, c) => s + c.openingPayable, 0)),
            balance: money(counterparties.reduce((s, c) => s + c.balance, 0)),
            totalCounterparties: counterparties.length,
            totalOrders: counterparties.reduce((s, c) => s + c.totalOrders, 0),
            // Все долги приведены к тенге по курсу на дату операции.
            currency: BASE_CURRENCY,
            // Валюты, для которых курса не нашлось: их суммы в долги не вошли.
            // Отчёт должен сказать об этом, а не тихо занизить долг.
            unconvertedCurrencies: [...new Set(unconvertedCurrencies)].sort(),
        };

        return { counterparties, totals };
    }

    // ==================== АКТ СВЕРКИ ====================

    // Акт сверки взаимных расчётов с контрагентом.
    // Сальдо в перспективе «они нам должны»: положительное = долг контрагента перед нами.
    async getReconciliationAct(companyId: string, counterpartyId: string, query: { startDate?: string; endDate?: string }) {
        const [company, counterparty] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, bin: true } }),
            this.prisma.company.findUnique({ where: { id: counterpartyId }, select: { id: true, name: true, bin: true } }),
        ]);
        if (!company) throw new NotFoundException('Компания не найдена');
        if (!counterparty) throw new NotFoundException('Контрагент не найден');

        const start = query.startDate ? new Date(query.startDate) : null;
        const end = query.endDate ? new Date(query.endDate) : null;
        if (start && Number.isNaN(start.getTime())) throw new BadRequestException('Некорректная дата начала периода');
        if (end && Number.isNaN(end.getTime())) throw new BadRequestException('Некорректная дата окончания периода');
        if (start) start.setUTCHours(0, 0, 0, 0);
        if (end) end.setUTCHours(23, 59, 59, 999);
        if (start && end && start > end) {
            throw new BadRequestException('Начало периода позже его окончания');
        }

        // Заявки, где участвуют обе стороны
        const orders = await this.prisma.order.findMany({
            where: {
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                OR: [
                    { customerCompanyId: companyId, forwarderId: counterpartyId },
                    { forwarderId: companyId, customerCompanyId: counterpartyId },
                    { partnerId: companyId, customerCompanyId: counterpartyId },
                    { forwarderId: companyId, subForwarderId: counterpartyId },
                    { subForwarderId: companyId, forwarderId: counterpartyId },
                ],
            },
            include: {
                ...ORDER_FINANCE_RELATIONS_SELECT,
                // Для колонок акта сверки как в 1С: маршрут и водитель рядом
                // с операцией, чтобы бухгалтер узнавал рейс без открытия заявки.
                routePoints: {
                    orderBy: { sequence: 'asc' },
                    select: { location: { select: { city: true, address: true } } },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        /**
         * Строка сверки. Суммы — прежние дебет/кредит; в 1С эти же колонки
         * называются «Увеличение долга» и «Уменьшение долга». Остальные поля
         * справочные: они describe операцию, но на расчёт не влияют.
         */
        type Op = {
            date: Date;
            doc: string;
            description: string;
            debit: number;
            credit: number;
            orderNumber: string | null;
            route: string | null;
            driver: string | null;
            invoiceNumber: string | null;
            actNumber: string | null;
        };
        const ops: Op[] = [];

        // По каждой общей заявке запоминаем, в какую сторону идут деньги с этим
        // контрагентом: IN — он платит нам, OUT — мы платим ему
        const orderPayDirection = new Map<string, PaymentDirection>();

        // Номера счёта и акта по каждому рейсу — колонки «Счёт» и «Акт»
        // в акте сверки 1С. Отменённые документы не показываем: по ним
        // расчётов нет.
        const invoiceByOrder = new Map<string, string>();
        const actByOrder = new Map<string, string>();
        if (orders.length) {
            const linkedDocuments = await this.prisma.accountingDocument.findMany({
                where: {
                    companyId,
                    status: { not: AccountingDocumentStatus.CANCELLED },
                    type: {
                        in: [
                            AccountingDocumentType.PAYMENT_INVOICE,
                            AccountingDocumentType.SERVICE_ACT,
                        ],
                    },
                    orders: { some: { orderId: { in: orders.map((order) => order.id) } } },
                },
                select: {
                    number: true,
                    type: true,
                    orders: { select: { orderId: true } },
                },
                orderBy: { documentDate: 'asc' },
            });
            for (const document of linkedDocuments) {
                const target = document.type === AccountingDocumentType.PAYMENT_INVOICE
                    ? invoiceByOrder
                    : actByOrder;
                for (const link of document.orders) {
                    if (!target.has(link.orderId)) target.set(link.orderId, document.number);
                }
            }
        }

        const routeOf = (order: { routePoints?: { location: { city: string | null; address: string } | null }[] }) => {
            const points = order.routePoints || [];
            if (!points.length) return null;
            const place = (index: number) =>
                points[index]?.location?.city || points[index]?.location?.address || null;
            const from = place(0);
            const to = place(points.length - 1);
            if (!from && !to) return null;
            return points.length === 1 ? from : `${from || '—'} → ${to || '—'}`;
        };

        for (const order of orders) {
            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });
            const accrualDate = order.completedAt || order.createdAt;
            const weAreForwarder = (order.forwarderId === companyId || order.partnerId === companyId) && order.customerCompanyId === counterpartyId;
            const weAreCustomer = order.customerCompanyId === companyId && order.forwarderId === counterpartyId;
            const weAreForwarderOverSub = order.forwarderId === companyId && order.subForwarderId === counterpartyId;
            const weAreSub = order.subForwarderId === companyId && order.forwarderId === counterpartyId;

            const orderDetails = {
                orderNumber: order.orderNumber,
                route: routeOf(order),
                driver: order.assignedDriverName || null,
                invoiceNumber: invoiceByOrder.get(order.id) ?? null,
                actNumber: actByOrder.get(order.id) ?? null,
            };

            // Начисление (реализация услуг)
            if (weAreForwarder || weAreSub) {
                // Контрагент должен нам за перевозку — дебет
                if (fin.revenue.gt(0)) ops.push({ date: accrualDate, doc: `Заявка №${order.orderNumber}`, description: 'Услуги перевозки', debit: toNum(fin.revenue), credit: 0, ...orderDetails });
                orderPayDirection.set(order.id, PaymentDirection.IN);
            } else if (weAreCustomer || weAreForwarderOverSub) {
                // Мы должны контрагенту за перевозку — кредит
                if (fin.executorCost.gt(0)) ops.push({ date: accrualDate, doc: `Заявка №${order.orderNumber}`, description: 'Услуги перевозки', debit: 0, credit: toNum(fin.executorCost), ...orderDetails });
                orderPayDirection.set(order.id, PaymentDirection.OUT);
            }
        }

        // Реальные оплаты между сторонами: по контрагенту на платеже, а также
        // оплаты по общим заявкам, где контрагент на платеже не был проставлен
        const orderIds = Array.from(orderPayDirection.keys());
        const rawPayments = await this.prisma.payment.findMany({
            where: {
                companyId,
                isDeleted: false,
                OR: [
                    { counterpartyId },
                    ...(orderIds.length > 0 ? [{ orderId: { in: orderIds }, counterpartyId: null }] : []),
                ],
            },
            include: {
                order: {
                    select: {
                        id: true,
                        orderNumber: true,
                        assignedDriverName: true,
                        routePoints: {
                            orderBy: { sequence: 'asc' },
                            select: { location: { select: { city: true, address: true } } },
                        },
                    },
                },
            },
            orderBy: { date: 'asc' },
        });
        const payments = rawPayments.filter(p =>
            p.counterpartyId === counterpartyId
            || (p.orderId && orderPayDirection.get(p.orderId) === p.direction),
        );
        for (const p of payments) {
            const doc = p.order?.orderNumber ? `Оплата по заявке №${p.order.orderNumber}` : 'Оплата';
            const paymentDetails = {
                orderNumber: p.order?.orderNumber ?? null,
                route: p.order ? routeOf(p.order) : null,
                driver: p.order?.assignedDriverName || null,
                invoiceNumber: p.order ? invoiceByOrder.get(p.order.id) ?? null : null,
                actNumber: p.order ? actByOrder.get(p.order.id) ?? null : null,
            };
            // Суммы акта — в тенге, как и начисления по заявкам. Валютный
            // платёж берётся по своему зафиксированному курсу: иначе тысяча
            // долларов встала бы против начисления в полмиллиона тенге как
            // тысяча, и акт сверки — самый официальный документ из всех — не
            // сошёлся бы ни с одной стороной.
            const amount = toNum(paymentInBase(p));
            const currencyNote = (p.currency || BASE_CURRENCY) !== BASE_CURRENCY
                ? ` (${toNum(p.amount).toLocaleString('ru-RU')} ${p.currency}${p.exchangeRate ? ` по курсу ${toNum(p.exchangeRate)}` : ''})`
                : '';
            if (p.direction === PaymentDirection.IN) {
                // Контрагент оплатил нам — уменьшает его долг — кредит
                ops.push({ date: p.date, doc, description: `Поступление оплаты${currencyNote}`, debit: 0, credit: amount, ...paymentDetails });
            } else {
                // Мы оплатили контрагенту — уменьшает наш долг — дебет
                ops.push({ date: p.date, doc, description: `Оплата контрагенту${currencyNote}`, debit: amount, credit: 0, ...paymentDetails });
            }
        }

        ops.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Начальный долг (ввод остатков)
        const opening = await this.prisma.counterpartyOpeningBalance.findUnique({
            where: { companyId_counterpartyId: { companyId, counterpartyId } },
        });
        const openingNet = toNum(D(opening?.openingReceivable).minus(D(opening?.openingPayable)));

        // Сальдо на начало периода = начальный долг + движения до начала периода
        let openingBalance = openingNet;
        const periodOps: Op[] = [];
        for (const op of ops) {
            const d = new Date(op.date);
            if (start && d < start) {
                openingBalance = money(openingBalance + op.debit - op.credit);
            } else if (end && d > end) {
                // после периода — игнорируем
            } else {
                periodOps.push(op);
            }
        }

        let running = openingBalance;
        const rows = periodOps.map((op) => {
            running = money(running + op.debit - op.credit);
            return {
                date: op.date,
                doc: op.doc,
                description: op.description,
                // В 1С эти колонки называются «Увеличение долга» и
                // «Уменьшение долга»; debit/credit оставлены для совместимости
                // с фиксацией акта и прежними потребителями отчёта.
                debit: op.debit,
                credit: op.credit,
                balance: running,
                orderNumber: op.orderNumber,
                route: op.route,
                driver: op.driver,
                invoiceNumber: op.invoiceNumber,
                actNumber: op.actNumber,
            };
        });

        const totalDebit = money(periodOps.reduce((s, o) => s + o.debit, 0));
        const totalCredit = money(periodOps.reduce((s, o) => s + o.credit, 0));
        const closingBalance = money(openingBalance + totalDebit - totalCredit);

        return {
            company,
            counterparty,
            period: { start: start ? start.toISOString() : null, end: end ? end.toISOString() : null },
            openingBalance,
            rows,
            totals: { debit: totalDebit, credit: totalCredit },
            closingBalance,
            generatedAt: new Date().toISOString(),
        };
    }

    // ==================== ПРИБЫЛЬ ПО ПЕРЕВОЗЧИКУ ====================

    async getCarrierProfitReport(companyId: string, query: { startDate?: string; endDate?: string }) {
        const start = query.startDate ? new Date(query.startDate) : null;
        const end = query.endDate ? new Date(query.endDate) : null;
        const dateFilter = start && end ? { createdAt: { gte: start, lte: end } } : {};

        const orders = await this.prisma.order.findMany({
            where: {
                AND: [
                    { OR: [{ forwarderId: companyId }, { partnerId: companyId }] },
                    { OR: [{ isConfirmed: true }, { status: { not: 'PENDING' } }] },
                    dateFilter,
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            include: {
                subForwarder: { select: { name: true } },
                driver: { select: { firstName: true, lastName: true } },
                ...ORDER_FINANCE_RELATIONS_SELECT,
            },
        });

        const map = new Map<string, { carrier: string; orders: number; revenue: Money; cost: Money; margin: Money }>();
        for (const order of orders) {
            const fin = this.calculator.computeOrderFinance({
                order, payments: order.payments, incomes: order.incomes, expenses: order.expenses, companyId,
            });
            const carrier = order.subForwarder?.name
                || order.assignedDriverName
                || (order.driver ? `${order.driver.lastName || ''} ${order.driver.firstName || ''}`.trim() : '')
                || 'Свой транспорт / без перевозчика';
            const cur = map.get(carrier) || { carrier, orders: 0, revenue: ZERO, cost: ZERO, margin: ZERO };
            cur.orders += 1;
            cur.revenue = roundMoney(cur.revenue.plus(fin.revenue));
            cur.cost = roundMoney(cur.cost.plus(fin.executorCost));
            cur.margin = roundMoney(cur.margin.plus(fin.margin));
            map.set(carrier, cur);
        }

        const rows = Array.from(map.values())
            .map(r => ({
                ...r,
                revenue: toNum(r.revenue),
                cost: toNum(r.cost),
                margin: toNum(r.margin),
                marginPct: r.revenue.gt(0) ? Math.round(r.margin.div(r.revenue).times(100).toNumber()) : 0,
            }))
            .sort((a, b) => b.margin - a.margin);

        const totals = {
            orders: rows.reduce((s, r) => s + r.orders, 0),
            revenue: money(rows.reduce((s, r) => s + r.revenue, 0)),
            cost: money(rows.reduce((s, r) => s + r.cost, 0)),
            margin: money(rows.reduce((s, r) => s + r.margin, 0)),
        };
        return { rows, totals };
    }

    // Себестоимость списаний ТМЦ по статьям за период (оценка по средней цене поступлений).
    // Это расход в ПиУ, но НЕ движение денег (деньги ушли при покупке).
    private async getWriteoffCostsByCategory(companyId: string, start: Date | null, end: Date | null): Promise<{ byCategory: Map<string, Money>; total: Money }> {
        const receipts = await this.prisma.stockMove.findMany({
            where: { companyId, type: StockMoveType.RECEIPT },
            include: { lines: true },
        });
        const recvQty = new Map<string, Money>();
        const recvSum = new Map<string, Money>();
        for (const m of receipts) {
            for (const l of m.lines) {
                if (l.amount == null) continue;
                recvQty.set(l.nomenclatureId, (recvQty.get(l.nomenclatureId) || ZERO).plus(D(l.quantity)));
                recvSum.set(l.nomenclatureId, (recvSum.get(l.nomenclatureId) || ZERO).plus(D(l.amount)));
            }
        }
        const avg = (id: string): Money => {
            const q = recvQty.get(id) || ZERO;
            return q.gt(0) ? (recvSum.get(id) || ZERO).div(q) : ZERO;
        };

        const writeoffs = await this.prisma.stockMove.findMany({
            where: { companyId, type: StockMoveType.WRITEOFF, ...(start && end && { date: { gte: start, lte: end } }) },
            include: { lines: true },
        });
        const byCategory = new Map<string, Money>();
        let total: Money = ZERO;
        for (const m of writeoffs) {
            const cat = m.expenseCategory || 'Списание материалов';
            for (const l of m.lines) {
                const val = roundMoney(avg(l.nomenclatureId).times(D(l.quantity)));
                if (val.lte(0)) continue;
                byCategory.set(cat, roundMoney((byCategory.get(cat) || ZERO).plus(val)));
                total = roundMoney(total.plus(val));
            }
        }
        return { byCategory, total };
    }

    // ==================== РАСХОДЫ ПО СТАТЬЯМ ====================

    async getExpensesByCategoryReport(companyId: string, query: { startDate?: string; endDate?: string }) {
        const start = query.startDate ? new Date(query.startDate) : null;
        const end = query.endDate ? new Date(query.endDate) : null;
        const period = start && end ? { date: { gte: start, lte: end } } : {};

        const [payments, expenses] = await Promise.all([
            this.prisma.payment.findMany({
                where: { companyId, direction: 'OUT', isDeleted: false, ...period },
                include: { category: { select: { name: true } } },
            }),
            this.prisma.expense.findMany({
                where: { companyId, isDeleted: false, ...period },
            }),
        ]);

        const map = new Map<string, { category: string; amount: Money; count: number }>();
        const add = (name: string, amount: Money | number) => {
            const key = name || 'Без статьи';
            const cur = map.get(key) || { category: key, amount: ZERO, count: 0 };
            cur.amount = roundMoney(cur.amount.plus(D(amount)));
            cur.count += 1;
            map.set(key, cur);
        };
        for (const p of payments) add(p.category?.name || 'Без статьи', p.amount);
        for (const e of expenses) add(e.category || 'Без статьи', e.amount);

        // Списания ТМЦ по себестоимости (по статье списания)
        const writeoffCosts = await this.getWriteoffCostsByCategory(companyId, start, end);
        for (const [cat, amount] of writeoffCosts.byCategory) add(cat, amount);

        const totalExact = sumOf(Array.from(map.values()), (r) => r.amount);
        const rows = Array.from(map.values())
            .sort((a, b) => b.amount.comparedTo(a.amount))
            .map(r => ({ ...r, amount: toNum(r.amount) }));
        const total = toNum(totalExact);
        return { rows: rows.map(r => ({ ...r, pct: total > 0 ? Math.round((r.amount / total) * 100) : 0 })), total };
    }

    // ==================== ЖУРНАЛ АКТОВ ====================

    // Список заявок, по которым можно выставить акт выполненных работ (мы — исполнитель для заказчика)
    async getActsJournal(companyId: string) {
        const orders = await this.prisma.order.findMany({
            where: {
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                customerCompanyId: { not: null },
                OR: [
                    { forwarderId: companyId },
                    { partnerId: companyId },
                ],
                NOT: { customerCompanyId: companyId },
            },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                createdAt: true,
                completedAt: true,
                customerPrice: true,
                customerCompany: { select: { id: true, name: true } },
                routePoints: {
                    select: { pointType: true, sequence: true, location: { select: { city: true, address: true } } },
                    orderBy: { sequence: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return orders.map((o) => {
            const pts = o.routePoints || [];
            const pickup = pts.find((p) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
            const delivery = [...pts].reverse().find((p) => p.pointType === 'DELIVERY');
            const from = pickup?.location?.city || pickup?.location?.address || '';
            const to = delivery?.location?.city || delivery?.location?.address || '';
            return {
                id: o.id,
                orderNumber: o.orderNumber,
                status: o.status,
                date: o.completedAt || o.createdAt,
                customerName: o.customerCompany?.name || '—',
                route: from && to ? `${from} — ${to}` : (from || to || ''),
                amount: o.customerPrice || 0,
            };
        });
    }

    // ==================== АКТ ВЫПОЛНЕННЫХ РАБОТ ====================

    async getActOfWork(companyId: string, orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customerCompany: true,
                forwarder: true,
                partner: true,
                subForwarder: true,
                routePoints: { include: { location: { select: { city: true, address: true } } }, orderBy: { sequence: 'asc' } },
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        // Определяем исполнителя (мы) и заказчика (кому выставляем акт)
        let issuer: any = null;
        let recipient: any = null;
        let amountGross = 0;
        let vatRate = 0;
        let hasVat = false;

        if (order.forwarderId === companyId || order.partnerId === companyId) {
            issuer = order.forwarder && order.forwarderId === companyId ? order.forwarder : (order.partner && order.partnerId === companyId ? order.partner : null);
            issuer = issuer || await this.prisma.company.findUnique({ where: { id: companyId } });
            recipient = order.customerCompany;
            amountGross = toNum(order.customerPrice);
            vatRate = toNum(order.vatRate);
            hasVat = order.hasVat ?? false;
        } else if (order.subForwarderId === companyId) {
            issuer = order.subForwarder || await this.prisma.company.findUnique({ where: { id: companyId } });
            recipient = order.forwarder;
            amountGross = toNum(order.subForwarderPrice);
            vatRate = toNum(order.executorVatRate);
            hasVat = order.executorHasVat ?? false;
        } else {
            issuer = await this.prisma.company.findUnique({ where: { id: companyId } });
            recipient = order.customerCompany;
            amountGross = toNum(order.customerPrice);
            vatRate = toNum(order.vatRate);
            hasVat = order.hasVat ?? false;
        }

        if (!recipient) throw new BadRequestException('У заявки не указан заказчик — акт выставить некому');

        // Маршрут
        const pts = order.routePoints || [];
        const pickup = pts.find((p) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
        const delivery = [...pts].reverse().find((p) => p.pointType === 'DELIVERY');
        const from = pickup?.location?.city || pickup?.location?.address || '';
        const to = delivery?.location?.city || delivery?.location?.address || '';
        const route = from && to ? `${from} — ${to}` : (from || to || '');

        // НДС (сумма включает НДС)
        const net = hasVat && vatRate > 0 ? money(amountGross / (1 + vatRate / 100)) : money(amountGross);
        const vat = money(amountGross - net);

        // Наименование услуги по умолчанию
        const services = await this.prisma.serviceCatalogItem.findMany({
            where: { companyId, isActive: true },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        });
        const defaultService = services.find((s) => s.isDefault) || services[0] || null;

        const pick = (c: any) => c ? {
            id: c.id, name: c.name, bin: c.bin, address: c.address || c.actualAddress || null,
            directorName: c.directorName || null, bankAccount: c.bankAccount || null,
            bankName: c.bankName || null, bankBic: c.bankBic || null, kbe: c.kbe || null,
            phone: c.phone || null, email: c.email || null,
        } : null;

        return {
            order: {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                completedAt: order.completedAt,
                cargoDescription: order.cargoDescription || null,
                route,
            },
            issuer: pick(issuer),
            recipient: pick(recipient),
            service: {
                name: defaultService?.name || 'Транспортно-экспедиционные услуги',
                unit: defaultService?.unit || 'услуга',
            },
            services: services.map((s) => ({ id: s.id, name: s.name, unit: s.unit })),
            amount: { net, vat, gross: money(amountGross), hasVat, vatRate },
            actNumber: order.orderNumber,
            actDate: order.completedAt || order.createdAt,
            generatedAt: new Date().toISOString(),
        };
    }

    // ==================== SHARE REPORT ====================

    /**
     * Выдать публичную ссылку на отчёт.
     *
     * Хранение и срок жизни — в `SharedReportLinkService`: ссылка живёт в
     * базе, а не в кэше, поэтому её можно отозвать и увидеть в списке
     * выданных.
     */
    async generateShareToken(
        companyId: string,
        counterpartyId: string,
        ourRole: string,
        userId: string,
        sentToEmail?: string,
    ): Promise<{ token: string; shareUrl: string; expiresAt: Date }> {
        const link = await this.shareLinks.create(companyId, userId, {
            counterpartyId,
            ourRole,
            sentToEmail,
        });
        return { token: link.token, shareUrl: link.shareUrl, expiresAt: link.expiresAt };
    }

    async getSharedReport(token: string) {
        const link = await this.shareLinks.resolve(token);
        await this.shareLinks.trackView(link.id);
        const { companyId, companyName, counterpartyId, ourRole } = link;
        const expiresAt = link.expiresAt;
        const fullReport = await this.getCounterpartyReport(companyId);

        const key = `${counterpartyId}__${ourRole}`;
        const rawCounterparty = fullReport.counterparties.find(
            (c: any) => `${c.counterparty.id}__${c.ourRole}` === key
        );

        // getCounterpartyReport считает суммы с точки зрения отправителя ссылки, поэтому
        // driverCost/subForwarderPrice могут быть не скрыты (отправитель — легитимный
        // экспедитор, видящий свою себестоимость). Но публичная ссылка уходит контрагенту
        // (в т.ч. заказчику), которому эта себестоимость видна быть не должна — скрываем
        // её всегда, независимо от роли отправителя.
        // Чеки, которые этот контрагент уже присылал: отправитель должен
        // видеть их состояние, иначе шлёт одно и то же повторно.
        const proofs = await this.prisma.orderPaymentProof.findMany({
            where: { companyId, counterpartyId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                orderId: true,
                status: true,
                fileName: true,
                claimedAmount: true,
                claimedDate: true,
                rejectionReason: true,
                createdAt: true,
            },
        });
        const proofsByOrder = new Map<string, any[]>();
        for (const proof of proofs) {
            const list = proofsByOrder.get(proof.orderId) ?? [];
            list.push({ ...proof, claimedAmount: toNumOrNull(proof.claimedAmount) });
            proofsByOrder.set(proof.orderId, list);
        }

        const counterparty = rawCounterparty
            ? {
                ...rawCounterparty,
                orders: rawCounterparty.orders.map((o: any) => ({
                    ...o,
                    driverCost: null,
                    subForwarderPrice: null,
                    subForwarderId: null,
                    paymentProofs: proofsByOrder.get(o.id) ?? [],
                })),
            }
            : rawCounterparty;

        // Старые счета из публичного отчёта убраны: страница давно
        // показывает документы новой модели, у которых ссылку можно отозвать.

        // Счета в действующей модели документов.
        //
        // Наш неотправленный черновик контрагенту видеть незачем — это ещё
        // не выставленный счёт. А вот черновик, который прислал он сам,
        // показываем обязательно: иначе после отправки счёт у него нигде не
        // виден, и он отправляет его повторно.
        const documents = await this.prisma.accountingDocument.findMany({
            where: {
                type: AccountingDocumentType.PAYMENT_INVOICE,
                status: { not: AccountingDocumentStatus.CANCELLED },
                OR: [
                    {
                        companyId,
                        counterpartyId,
                        // Наши документы — только выставленные.
                        OR: [
                            { direction: AccountingDocumentDirection.OUTGOING, status: { not: AccountingDocumentStatus.DRAFT } },
                            { direction: AccountingDocumentDirection.INCOMING },
                        ],
                    },
                    { companyId: counterpartyId, counterpartyId: companyId },
                ],
            },
            orderBy: { documentDate: 'desc' },
            take: 200,
            select: {
                id: true,
                number: true,
                externalNumber: true,
                direction: true,
                status: true,
                documentDate: true,
                dueDate: true,
                total: true,
                amountPaid: true,
                balanceDue: true,
                shareToken: true,
                shareRevokedAt: true,
                orders: { select: { order: { select: { id: true, orderNumber: true } } } },
            },
        });

        const documentsView = documents.map((doc) => ({
            id: doc.id,
            number: doc.number,
            externalNumber: doc.externalNumber,
            // Направление разворачиваем: в базе оно записано с нашей точки
            // зрения, а читает страницу контрагент.
            issuedByUs: doc.direction === AccountingDocumentDirection.OUTGOING,
            status: doc.status,
            documentDate: doc.documentDate,
            dueDate: doc.dueDate,
            total: toNum(doc.total),
            amountPaid: toNum(doc.amountPaid),
            balanceDue: toNum(doc.balanceDue),
            // Отозванная ссылка на документ не должна оставаться кликабельной.
            shareToken: doc.shareRevokedAt ? null : doc.shareToken,
            orders: doc.orders.map((link) => link.order),
        }));

        if (!counterparty) {
            return {
                senderCompany: companyName,
                counterpartyName: link.counterpartyName,
                ourRole,
                expiresAt,
                counterparty: null,
                totals: null,
                documents: documentsView,
            };
        }

        return {
            senderCompany: companyName,
            counterpartyName: counterparty.counterparty.name,
            ourRole,
            // Контрагенту показываем настоящий срок жизни ссылки, а не
            // подпись «7 дней»: ссылку могли отозвать или выдать раньше.
            expiresAt,
            counterparty,
            totals: {
                theyOweUs: counterparty.theyOweUs,
                weOweThem: counterparty.weOweThem,
                unpaidTheyOweUs: counterparty.unpaidTheyOweUs,
                unpaidWeOweThem: counterparty.unpaidWeOweThem,
                balance: counterparty.balance,
                totalOrders: counterparty.totalOrders,
            },
            documents: documentsView,
        };
    }

    async getDashboardSummary(companyId: string, query: { startDate?: string; endDate?: string }) {
        const { startDate, endDate } = query;

        const dateFilter = startDate && endDate ? {
            createdAt: {
                gte: new Date(startDate),
                lte: new Date(endDate),
            }
        } : {};

        const orders = await this.prisma.order.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { customerCompanyId: companyId },
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { subForwarderId: companyId },
                            { responsibleManager: { companyId: companyId } },
                        ]
                    },
                    {
                        OR: [
                            { isConfirmed: true },
                            { status: { not: 'PENDING' } }
                        ]
                    },
                    dateFilter,
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            // Сводке нужны только величины для расчёта: строки заявок наружу не
            // отдаются, поэтому читаем ровно те поля, которые считает калькулятор.
            select: {
                ...ORDER_FINANCE_SELECT,
                ...ORDER_FINANCE_RELATIONS_SELECT,
            },
        });

        let totalRevenue : Money = ZERO;
        let totalMargin : Money = ZERO;
        let debtorSum : Money = ZERO;
        let creditorSum : Money = ZERO;
        let unpaidOrdersCount = 0;

        for (const order of orders) {
            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            totalRevenue = totalRevenue.plus(fin.revenue);
            totalMargin = totalMargin.plus(fin.margin);
            debtorSum = debtorSum.plus(fin.customerDebt);
            creditorSum = creditorSum.plus(fin.executorDebt);

            const hasUnpaid = (!fin.isCustomerPaid && fin.revenue.gt(0)) || (!fin.isExecutorPaid && fin.executorCost.gt(0));
            if (hasUnpaid) {
                unpaidOrdersCount++;
            }
        }

        const payments = await this.prisma.payment.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(startDate && endDate && {
                    date: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    }
                })
            },
            select: { direction: true, amount: true, currency: true, amountBase: true },
        });

        // Дашборд считает в тенге: валютный платёж берётся по своему
        // зафиксированному курсу, а не как есть.
        const cashIn = sumOf(payments.filter(p => p.direction === PaymentDirection.IN), paymentInBase);
        const cashOut = sumOf(payments.filter(p => p.direction === PaymentDirection.OUT), paymentInBase);

        const manualIncomes = await this.prisma.income.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(startDate && endDate && {
                    date: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    }
                })
            }
        });

        const manualExpenses = await this.prisma.expense.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(startDate && endDate && {
                    date: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    }
                })
            }
        });

        const totalManualIncomes = sumOf(manualIncomes.filter(i => !EXCLUDED_INCOME_CATEGORIES.includes(i.category)), (i) => i.amount);
        const totalManualExpenses = sumOf(manualExpenses.filter(e => !EXCLUDED_EXPENSE_CATEGORIES.includes(e.category)), (e) => e.amount);

        // Начальные остатки касс и начальные долги контрагентов — чтобы дашборд
        // сходился с «Остатками по кассам» и «Взаиморасчётами»
        const [finAccounts, cpOpenings] = await Promise.all([
            this.prisma.financeAccount.findMany({ where: { companyId, isActive: true }, select: { openingBalance: true } }),
            this.prisma.counterpartyOpeningBalance.findMany({ where: { companyId } }),
        ]);
        const accountsOpening = sumOf(finAccounts, (a) => a.openingBalance);
        debtorSum = debtorSum.plus(sumOf(cpOpenings, (o) => o.openingReceivable));
        creditorSum = creditorSum.plus(sumOf(cpOpenings, (o) => o.openingPayable));

        const totalCashIn = cashIn.plus(totalManualIncomes);
        const totalCashOut = cashOut.plus(totalManualExpenses);
        const cashBalance = roundMoney(accountsOpening.plus(totalCashIn).minus(totalCashOut));

        totalRevenue = roundMoney(totalRevenue);
        totalMargin = roundMoney(totalMargin);
        debtorSum = roundMoney(debtorSum);
        creditorSum = roundMoney(creditorSum);

        const marginPercentage = totalRevenue.gt(0)
            ? toNum(totalMargin.div(totalRevenue).times(100))
            : 0;

        // Граница наружу: Decimal сериализуется в JSON строкой, веб ждёт число
        return {
            revenue: toNum(totalRevenue),
            margin: toNum(totalMargin),
            marginPercentage,
            debtorSum: toNum(debtorSum),
            creditorSum: toNum(creditorSum),
            cashBalance: toNum(cashBalance),
            unpaidOrdersCount,
        };
    }

    // ==================== CASHFLOW REPORT ====================

    async getCashflowReport(companyId: string, query: { startDate?: string; endDate?: string }) {
        const { startDate, endDate } = query;

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;

        const defaultBank = await this.prisma.financeAccount.findFirst({
            where: { companyId, kind: AccountKind.BANK, isDefault: true }
        });
        const defaultCash = await this.prisma.financeAccount.findFirst({
            where: { companyId, kind: AccountKind.CASH, isDefault: true }
        });

        // Остаток на начало = начальные остатки касс + движения до начала периода.
        // Тот же расчёт, что и в «Остатках по кассам», — отчёты всегда сходятся.
        const startBalance = toNum(await this.settingsService.getCashPosition(companyId, start));

        const dateFilter = start && end ? {
            date: { gte: start, lte: end }
        } : {};

        const payments = await this.prisma.payment.findMany({
            where: { companyId, isDeleted: false, ...dateFilter },
            include: { account: true, category: true, counterparty: { select: { name: true } }, order: { select: { orderNumber: true } } },
            orderBy: { date: 'desc' },
        });

        // Движение денег ведётся в тенге: остаток на начало взят по тенговым
        // счетам, и прибавить к нему долларовый приход нельзя — отчёт
        // перестанет сходиться сам с собой. Валютные движения показываются
        // отдельным списком, каждая валюта сама по себе.
        const foreignMap = new Map<string, { currency: string; totalIn: number; totalOut: number; count: number }>();
        for (const payment of payments) {
            const currency = (payment.currency || BASE_CURRENCY).toUpperCase();
            if (currency === BASE_CURRENCY) continue;
            if (!foreignMap.has(currency)) {
                foreignMap.set(currency, { currency, totalIn: 0, totalOut: 0, count: 0 });
            }
            const row = foreignMap.get(currency)!;
            row.count += 1;
            if (payment.direction === PaymentDirection.IN) row.totalIn = money(row.totalIn + toNum(payment.amount));
            else row.totalOut = money(row.totalOut + toNum(payment.amount));
        }
        const foreignFlows = Array.from(foreignMap.values());

        const incomes = await this.prisma.income.findMany({
            where: { companyId, isDeleted: false, ...dateFilter },
            orderBy: { date: 'desc' },
        });

        const expenses = await this.prisma.expense.findMany({
            where: { companyId, isDeleted: false, ...dateFilter },
            orderBy: { date: 'desc' },
        });

        const flowItems: Array<{
            id: string;
            date: Date;
            direction: PaymentDirection;
            amount: number;
            method: PaymentMethod;
            accountName: string;
            categoryName: string;
            counterpartyName: string;
            note: string;
            source: 'payment' | 'income' | 'expense';
        }> = [];

        payments.filter(p => (p.currency || BASE_CURRENCY).toUpperCase() === BASE_CURRENCY).forEach(p => {
            flowItems.push({
                id: p.id,
                date: p.date,
                direction: p.direction,
                amount: toNum(p.amount),
                method: p.method,
                accountName: p.account?.name || (p.method === 'CASH' ? defaultCash?.name : defaultBank?.name) || 'Банк',
                categoryName: p.category?.name || (p.direction === PaymentDirection.IN ? 'Оплата за рейс' : 'Оплата исполнителю'),
                counterpartyName: p.counterparty?.name || '—',
                note: p.note || (p.order ? `По заявке ${p.order.orderNumber}` : ''),
                source: 'payment',
            });
        });

        incomes.filter(i => !EXCLUDED_INCOME_CATEGORIES.includes(i.category)).forEach(i => {
            flowItems.push({
                id: i.id,
                date: i.date,
                direction: PaymentDirection.IN,
                amount: toNum(i.amount),
                method: PaymentMethod.BANK,
                accountName: defaultBank?.name || 'Банк',
                categoryName: i.category === 'order_payment' ? 'Оплата за рейс' : i.category === 'prepayment' ? 'Предоплата' : i.category,
                counterpartyName: '—',
                note: i.description + (i.note ? ` (${i.note})` : ''),
                source: 'income',
            });
        });

        expenses.filter(e => !EXCLUDED_EXPENSE_CATEGORIES.includes(e.category)).forEach(e => {
            flowItems.push({
                id: e.id,
                date: e.date,
                direction: PaymentDirection.OUT,
                amount: toNum(e.amount),
                method: PaymentMethod.BANK,
                accountName: defaultBank?.name || 'Банк',
                categoryName: e.category,
                counterpartyName: '—',
                note: e.description + (e.note ? ` (${e.note})` : ''),
                source: 'expense',
            });
        });

        flowItems.sort((a, b) => b.date.getTime() - a.date.getTime());

        const accountsMap = new Map<string, { name: string; in: number; out: number; balance: number }>();
        const getAcc = (name: string) => {
            if (!accountsMap.has(name)) {
                accountsMap.set(name, { name, in: 0, out: 0, balance: 0 });
            }
            return accountsMap.get(name)!;
        };

        if (defaultBank) getAcc(defaultBank.name);
        if (defaultCash) getAcc(defaultCash.name);

        const methodsMap = new Map<string, { name: string; in: number; out: number; balance: number }>();
        const getMethodGroup = (method: string) => {
            const labels: Record<string, string> = {
                CASH: 'Наличные',
                BANK: 'Банк',
                CARD: 'Карта',
                OTHER: 'Прочее',
            };
            const label = labels[method] || method;
            if (!methodsMap.has(method)) {
                methodsMap.set(method, { name: label, in: 0, out: 0, balance: 0 });
            }
            return methodsMap.get(method)!;
        };

        const categoriesMap = new Map<string, { name: string; direction: PaymentDirection; amount: number }>();
        const getCatGroup = (name: string, dir: PaymentDirection) => {
            const key = `${name}__${dir}`;
            if (!categoriesMap.has(key)) {
                categoriesMap.set(key, { name, direction: dir, amount: 0 });
            }
            return categoriesMap.get(key)!;
        };

        let totalIn = 0;
        let totalOut = 0;

        flowItems.forEach(item => {
            const amt = item.amount;
            const isCopy = item.direction === PaymentDirection.IN;

            if (isCopy) {
                totalIn = money(totalIn + amt);
            } else {
                totalOut = money(totalOut + amt);
            }

            const acc = getAcc(item.accountName);
            if (isCopy) acc.in = money(acc.in + amt);
            else acc.out = money(acc.out + amt);

            const met = getMethodGroup(item.method);
            if (isCopy) met.in = money(met.in + amt);
            else met.out = money(met.out + amt);

            const cat = getCatGroup(item.categoryName, item.direction);
            cat.amount = money(cat.amount + amt);
        });

        totalIn = money(totalIn);
        totalOut = money(totalOut);
        const netChange = money(totalIn - totalOut);
        const endBalance = money(startBalance + netChange);

        const accounts = Array.from(accountsMap.values()).map(a => ({
            ...a,
            in: money(a.in),
            out: money(a.out),
            balance: money(a.in - a.out),
        }));

        const methods = Array.from(methodsMap.values()).map(m => ({
            ...m,
            in: money(m.in),
            out: money(m.out),
            balance: money(m.in - m.out),
        }));

        const categories = Array.from(categoriesMap.values()).map(c => ({
            ...c,
            amount: toNum(c.amount),
        }));

        return {
            startBalance,
            totalIn,
            totalOut,
            netChange,
            endBalance,
            accounts,
            methods,
            categories,
            // Валютные движения за тот же период — каждое в своей валюте.
            // В тенговые итоги они не входят намеренно.
            foreignFlows,
            flows: flowItems.map(item => ({
                ...item,
                date: item.date.toISOString(),
            })),
        };
    }

    /**
     * Курсовые разницы за период.
     *
     * Счёт выставили на 1 000 USD по курсу 470 — записали выручку 470 000 ₸.
     * Деньги пришли по 500 — на счёт легло 500 000 ₸. Разница в 30 000 ₸ не
     * выручка и не ошибка: это курсовая разница, и в отчёте она обязана
     * стоять отдельной строкой. Смешать её с выручкой значит показать
     * прибыль, которой не было; выбросить — не сойтись с банком.
     *
     * Знак зависит от того, чей счёт. По нашему счёту лишние тенге — доход:
     * получили больше, чем записали. По счёту поставщика те же лишние тенге —
     * расход: отдали больше, чем записали затратой.
     *
     * Период считается по дате платежа: разница возникает в тот день, когда
     * пришли деньги, а не когда выставили счёт.
     */
    async getExchangeDifferences(companyId: string, period: { start: Date | null; end: Date | null }) {
        const allocations = await this.prisma.accountingPaymentAllocation.findMany({
            where: {
                document: { companyId },
                exchangeDiff: { not: 0 },
                payment: {
                    isDeleted: false,
                    ...(period.start && period.end
                        ? { date: { gte: period.start, lte: period.end } }
                        : {}),
                },
            },
            select: {
                amount: true,
                amountBase: true,
                exchangeDiff: true,
                document: {
                    select: {
                        id: true, number: true, direction: true, currency: true,
                        exchangeRate: true, counterparty: { select: { name: true } },
                    },
                },
                payment: { select: { id: true, date: true, currency: true, exchangeRate: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });

        let gain = ZERO;
        let loss = ZERO;
        const rows = allocations.map((row) => {
            const { outcome, amount } = exchangeOutcome(
                row.exchangeDiff ?? 0,
                row.document.direction as 'OUTGOING' | 'INCOMING',
            );
            if (outcome === 'GAIN') gain = gain.plus(amount);
            if (outcome === 'LOSS') loss = loss.plus(amount.abs());

            return {
                documentId: row.document.id,
                documentNumber: row.document.number,
                direction: row.document.direction,
                counterpartyName: row.document.counterparty?.name ?? '—',
                currency: row.document.currency,
                paymentDate: row.payment.date,
                closed: toNum(row.amount),
                documentRate: toNumOrNull(row.document.exchangeRate),
                // Курс, по которому долг закрыли, а не курс самого платежа.
                // Разница видна, когда долларовый счёт гасят тенге: у платежа
                // курс 1 (тенге к тенге), и показывать его рядом с курсом
                // счёта 470 бессмысленно. Считаем от факта: сколько тенге
                // ушло на сколько валюты долга.
                paymentRate: row.amountBase !== null && D(row.amount).gt(ZERO)
                    ? toNum(D(row.amountBase).div(D(row.amount)).toDecimalPlaces(6))
                    : toNumOrNull(row.payment.exchangeRate),
                amountBase: toNumOrNull(row.amountBase),
                outcome,
                amount: toNum(amount),
            };
        });

        return {
            gain: toNum(roundMoney(gain)),
            loss: toNum(roundMoney(loss)),
            // Итог: «+» — заработали на курсе, «−» — потеряли.
            net: toNum(roundMoney(gain.minus(loss))),
            rows,
        };
    }

    // ==================== PNL REPORT ====================

    async getPnLReport(companyId: string, query: { startDate?: string; endDate?: string }) {
        const { startDate, endDate } = query;

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;

        const dateFilter = start && end ? {
            createdAt: { gte: start, lte: end }
        } : {};

        const orders = await this.prisma.order.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { customerCompanyId: companyId },
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { subForwarderId: companyId },
                            { responsibleManager: { companyId: companyId } },
                        ]
                    },
                    {
                        OR: [
                            { isConfirmed: true },
                            { status: { not: 'PENDING' } }
                        ]
                    },
                    dateFilter,
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            include: {
                ...ORDER_FINANCE_RELATIONS_SELECT,
            }
        });

        let totalRevenueNet = 0;
        let totalExecutorCostNet = 0;
        const unconvertedCurrencies: string[] = [];

        for (const order of orders) {
            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            totalRevenueNet = money(totalRevenueNet + toNum(fin.revenueNet));
            totalExecutorCostNet = money(totalExecutorCostNet + toNum(fin.executorCostNet));
            unconvertedCurrencies.push(...fin.unconvertedCurrencies);
        }

        totalRevenueNet = money(totalRevenueNet);
        totalExecutorCostNet = money(totalExecutorCostNet);

        const manualIncomes = await this.prisma.income.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(start && end && {
                    date: { gte: start, lte: end }
                })
            }
        });

        const manualExpenses = await this.prisma.expense.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(start && end && {
                    date: { gte: start, lte: end }
                })
            }
        });

        const otherIncomesMap = new Map<string, number>();
        const otherExpensesMap = new Map<string, number>();

        manualIncomes
            .filter(i => !EXCLUDED_INCOME_CATEGORIES.includes(i.category))
            .forEach(i => {
                otherIncomesMap.set(i.category, money((otherIncomesMap.get(i.category) || 0) + toNum(i.amount)));
            });

        manualExpenses
            .filter(e => !EXCLUDED_EXPENSE_CATEGORIES.includes(e.category))
            .forEach(e => {
                otherExpensesMap.set(e.category, money((otherExpensesMap.get(e.category) || 0) + toNum(e.amount)));
            });

        // Списания ТМЦ — расход в ПиУ по себестоимости (не касса)
        const writeoffCosts = await this.getWriteoffCostsByCategory(companyId, start, end);
        for (const [cat, amount] of writeoffCosts.byCategory) {
            otherExpensesMap.set(cat, money((otherExpensesMap.get(cat) || 0) + toNum(amount)));
        }

        const otherIncomes = Array.from(otherIncomesMap.entries()).map(([name, amount]) => ({
            name,
            amount: money(amount),
        }));

        const otherExpenses = Array.from(otherExpensesMap.entries()).map(([name, amount]) => ({
            name,
            amount: money(amount),
        }));

        const totalOtherIncomes = money(otherIncomes.reduce((s, i) => s + i.amount, 0));
        const totalOtherExpenses = money(otherExpenses.reduce((s, e) => s + e.amount, 0));

        // Курсовые разницы — отдельная строка, не выручка и не затрата.
        // Заработали на курсе или потеряли, видно прямо: если размазать это
        // по выручке, отчёт покажет прибыль, которой не было.
        //
        // Их две породы, и обе обязаны быть в отчёте. Первая возникает при
        // оплате: счёт выставили по одному курсу, деньги пришли по другому.
        // Вторая — при переоценке на конец месяца: счёт ещё не оплачен, а
        // курс уже ушёл, и долг стоит других тенге. Без второй месяц
        // закрывается с остатками по вчерашнему курсу.
        const [exchange, revaluation] = await Promise.all([
            this.getExchangeDifferences(companyId, { start, end }),
            this.revaluations.differencesForPeriod(companyId, { start, end }),
        ]);

        // Валюты, для которых не нашлось курса. Их суммы в расчёт не вошли
        // вовсе — лучше отчёт с честной пометкой, чем доллары, посчитанные
        // тенге. Отчёт обязан сказать об этом, а не молчать.
        const unconverted = [...new Set(unconvertedCurrencies)].sort();

        const grossProfit = money(totalRevenueNet - totalExecutorCostNet);
        const netProfit = money(
            grossProfit + totalOtherIncomes - totalOtherExpenses + exchange.net + revaluation.net,
        );
        const marginPercentage = totalRevenueNet > 0 ? money((netProfit / totalRevenueNet) * 100) : 0;

        return {
            revenueNet: totalRevenueNet,
            executorCostNet: totalExecutorCostNet,
            grossProfit,
            otherIncomes,
            otherExpenses,
            totalOtherIncomes,
            totalOtherExpenses,
            // Разницы от оплат и от переоценки складываются в одну строку
            // отчёта, но расшифровываются по отдельности: бухгалтеру важно
            // видеть, где движение денег, а где переоценка остатка.
            exchangeGain: money(exchange.gain + revaluation.gain),
            exchangeLoss: money(exchange.loss + revaluation.loss),
            exchangeNet: money(exchange.net + revaluation.net),
            exchangeRows: exchange.rows,
            revaluationGain: revaluation.gain,
            revaluationLoss: revaluation.loss,
            revaluationNet: revaluation.net,
            revaluationRows: revaluation.rows,
            unconvertedCurrencies: unconverted,
            netProfit,
            marginPercentage,
            // Все суммы отчёта — в тенге. Валютные пересчитаны по курсу,
            // зафиксированному на дату операции, и задним числом не меняются.
            currency: BASE_CURRENCY,
        };
    }

    // ==================== EXPORTS ====================

    async exportFinancialRegistry(companyId: string): Promise<Buffer> {
        // Выгрузка идёт по всему реестру, без страниц: без query метод
        // отдаёт массив, но тип общий на оба режима — разворачиваем явно.
        const registryResult = await this.getFinancialRegistry(companyId);
        const registry = Array.isArray(registryResult) ? registryResult : registryResult.data;

        const STATUS_RU: Record<string, string> = {
            DRAFT: 'Черновик',
            PENDING: 'Ожидает назначения',
            ASSIGNED: 'Назначен водитель',
            EN_ROUTE_PICKUP: 'В пути на погрузку',
            AT_PICKUP: 'На погрузке',
            LOADING: 'Идет погрузка',
            IN_TRANSIT: 'В пути',
            AT_DELIVERY: 'Прибыл на выгрузку',
            UNLOADING: 'Идет разгрузка',
            COMPLETED: 'Завершен',
            CANCELLED: 'Отменен',
            PROBLEM: 'Проблема',
        };

        const rows = registry.map(item => {
            let carrierName = '';
            if (item.subForwarder) carrierName = item.subForwarder.name;
            else if (item.partner) carrierName = item.partner.name;
            else if (item.assignedDriverName) carrierName = item.assignedDriverName;
            else if (item.driver) carrierName = `${item.driver.lastName} ${item.driver.firstName}`;

            const route = (item.routePoints || [])
                .map((p: any) => `${p.location?.city || ''} (${p.pointType === 'PICKUP' ? 'П' : 'В'})`)
                .join(' -> ');

            return {
                'Номер заявки': item.orderNumber,
                'Дата создания': item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '',
                'Статус': STATUS_RU[item.status] || item.status,
                'Груз': item.cargoDescription || '',
                'Маршрут': route,
                'Заказчик': item.customerCompany?.name || '',
                // Ставка — в валюте заявки, рядом её пересчёт в тенге по курсу
                // рейса. Одной колонкой «(KZT)» тут не обойтись: подписать
                // доллары тенге значит отдать бухгалтеру неверную выгрузку.
                'Валюта заявки': item.currency || 'KZT',
                'Стоимость для заказчика (валюта заявки)': item.customerPrice || 0,
                'Стоимость для заказчика (KZT)': (item.currency || 'KZT') === 'KZT'
                    ? (item.customerPrice || 0)
                    : (item.customerPriceBase ?? 0),
                'Оплачено заказчиком (KZT)': item.paidIn || 0,
                'Долг заказчика (KZT)': item.customerDebt || 0,
                'Статус оплаты заказчика': item.isCustomerPaid ? 'Оплачено' : 'Не оплачено',
                'Перевозчик': carrierName,
                'Стоимость перевозчика (KZT)': item.executorCost || 0,
                'Оплачено перевозчению (KZT)': item.paidOut || 0,
                'Долг перед перевозчиком (KZT)': item.executorDebt || 0,
                'Статус оплаты перевозчика': item.isDriverPaid || item.isSubForwarderPaid ? 'Оплачено' : 'Не оплачено',
                'Маржа (KZT)': item.margin || 0,
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        const maxLen = rows.reduce((widths, row) => {
            Object.keys(row).forEach((key, i) => {
                const val = String((row as any)[key] ?? '');
                widths[i] = Math.max(widths[i] || 10, val.length, key.length);
            });
            return widths;
        }, [] as number[]);
        ws['!cols'] = maxLen.map(w => ({ wch: w + 2 }));

        XLSX.utils.book_append_sheet(wb, ws, 'Реестр');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    async exportCounterpartyReport(companyId: string): Promise<Buffer> {
        const report = await this.getCounterpartyReport(companyId);

        const rows = report.counterparties.map(item => {
            let balanceText = 'В расчете';
            if (item.balance > 0) balanceText = 'Они нам должны';
            else if (item.balance < 0) balanceText = 'Мы им должны';

            return {
                'Контрагент': item.counterparty.name,
                'Наша роль': item.ourRole,
                'Всего сделок': item.totalOrders,
                'Всего они нам должны (KZT)': item.theyOweUs,
                'Оплачено ими нам (KZT)': item.theyOweUsPaid,
                'Долг за ними (KZT)': item.unpaidTheyOweUs,
                'Всего мы им должны (KZT)': item.weOweThem,
                'Оплачено нами им (KZT)': item.weOweThemPaid,
                'Долг за нами (KZT)': item.unpaidWeOweThem,
                'Баланс взаиморасчетов (KZT)': item.balance,
                'Статус': balanceText,
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        const maxLen = rows.reduce((widths, row) => {
            Object.keys(row).forEach((key, i) => {
                const val = String((row as any)[key] ?? '');
                widths[i] = Math.max(widths[i] || 10, val.length, key.length);
            });
            return widths;
        }, [] as number[]);
        ws['!cols'] = maxLen.map(w => ({ wch: w + 2 }));

        XLSX.utils.book_append_sheet(wb, ws, 'Взаиморасчеты');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    async exportCashflowReport(companyId: string, query: { startDate?: string; endDate?: string }): Promise<Buffer> {
        const report = await this.getCashflowReport(companyId, query);

        const rows = report.flows.map(item => ({
            'Дата': new Date(item.date).toLocaleDateString(),
            'Направление': item.direction === 'IN' ? 'Поступление' : 'Расход',
            'Сумма (₸)': item.amount,
            'Способ оплаты': item.method === 'CASH' ? 'Наличные' : item.method === 'BANK' ? 'Банк' : item.method === 'CARD' ? 'Карта' : 'Прочее',
            'Счет / Касса': item.accountName,
            'Статья': item.categoryName,
            'Контрагент': item.counterpartyName,
            'Примечание': item.note,
        }));

        // Валютные движения в тенговый лист не попали — но бухгалтер должен
        // узнать об этом из самой выгрузки, а не заметить нехватку потом.
        for (const foreign of report.foreignFlows) {
            rows.push({
                'Дата': '',
                'Направление': 'Справочно',
                'Сумма (₸)': 0,
                'Способ оплаты': '',
                'Счет / Касса': `Валютные счета (${foreign.currency})`,
                'Статья': '',
                'Контрагент': '',
                'Примечание': `За период в ${foreign.currency}: приход ${foreign.totalIn}, расход ${foreign.totalOut}. В тенговые итоги не входят.`,
            });
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        const maxLen = rows.reduce((widths, row) => {
            Object.keys(row).forEach((key, i) => {
                const val = String((row as any)[key] ?? '');
                widths[i] = Math.max(widths[i] || 10, val.length, key.length);
            });
            return widths;
        }, [] as number[]);
        ws['!cols'] = maxLen.map(w => ({ wch: w + 2 }));

        XLSX.utils.book_append_sheet(wb, ws, 'ДДС');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    async exportPnLReport(companyId: string, query: { startDate?: string; endDate?: string }): Promise<Buffer> {
        const report = await this.getPnLReport(companyId, query);

        const rows = [
            { 'Показатель': 'Выручка (Net)', 'Сумма (₸)': report.revenueNet },
            { 'Показатель': 'Себестоимость исполнителя (Net)', 'Сумма (₸)': report.executorCostNet },
            { 'Показатель': 'Валовая прибыль (Gross Profit)', 'Сумма (₸)': report.grossProfit },
            { 'Показатель': '—', 'Сумма (₸)': '—' },
            ...report.otherIncomes.map(i => ({ 'Показатель': `Прочие доходы: ${i.name}`, 'Сумма (₸)': i.amount })),
            { 'Показатель': 'Всего прочих доходов', 'Сумма (₸)': report.totalOtherIncomes },
            { 'Показатель': '—', 'Сумма (₸)': '—' },
            ...report.otherExpenses.map(e => ({ 'Показатель': `Прочие расходы: ${e.name}`, 'Сумма (₸)': e.amount })),
            { 'Показатель': 'Всего прочих расходов', 'Сумма (₸)': report.totalOtherExpenses },
            { 'Показатель': '—', 'Сумма (₸)': '—' },
            // Курсовые разницы — отдельными строками, обеими сторонами.
            // В выгрузке они нужны так же, как на экране: бухгалтер сверяет
            // именно их, когда деньги пришли, а суммы не совпали.
            ...(report.exchangeGain || report.exchangeLoss ? [
                { 'Показатель': 'Курсовые разницы: доход', 'Сумма (₸)': report.exchangeGain },
                { 'Показатель': 'Курсовые разницы: расход', 'Сумма (₸)': report.exchangeLoss },
                { 'Показатель': 'Курсовые разницы, итого', 'Сумма (₸)': report.exchangeNet },
                { 'Показатель': '—', 'Сумма (₸)': '—' },
            ] : []),
            { 'Показатель': 'Чистая прибыль (Net Profit)', 'Сумма (₸)': report.netProfit },
            { 'Показатель': 'Рентабельность (%)', 'Сумма (₸)': `${report.marginPercentage}%` },
            ...(report.unconvertedCurrencies.length ? [
                { 'Показатель': '—', 'Сумма (₸)': '—' },
                {
                    'Показатель': `ВНИМАНИЕ: нет курса ${report.unconvertedCurrencies.join(', ')} — суммы в этих валютах в отчёт не вошли`,
                    'Сумма (₸)': '—',
                },
            ] : []),
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        const maxLen = rows.reduce((widths, row) => {
            Object.keys(row).forEach((key, i) => {
                const val = String((row as any)[key] ?? '');
                widths[i] = Math.max(widths[i] || 10, val.length, key.length);
            });
            return widths;
        }, [] as number[]);
        ws['!cols'] = maxLen.map(w => ({ wch: w + 2 }));

        XLSX.utils.book_append_sheet(wb, ws, 'P&L');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }
}
