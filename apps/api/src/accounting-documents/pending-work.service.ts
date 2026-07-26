import { Injectable } from '@nestjs/common';
import {
    AccountingDocumentDirection,
    AccountingDocumentStatus,
    AccountingDocumentType,
    OrderStatus,
    Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { D, ZERO, toNum } from '../common/utils/money';
import { kzDaysSince, kzToday } from '../common/utils/business-date';

/** Сколько строк показывать в виджете; счётчик считается по всей выборке. */
const PREVIEW_LIMIT = 5;

/** Потолок выборки: виджет отвечает «сколько и какие», а не грузит всё. */
const SCAN_LIMIT = 500;

export interface PendingWorkItem {
    id: string;
    /** Заявка или номер документа — то, по чему висяк опознаётся. */
    label: string;
    counterparty: string | null;
    amount: number;
    /** Сколько дней висит: с завершения рейса или с даты платежа по счёту. */
    daysWaiting: number;
    /** Куда вести по клику. */
    orderId?: string;
    documentId?: string;
}

export interface PendingWorkGroup {
    count: number;
    total: number;
    /** true — строк больше, чем удалось просмотреть; счётчик занижен. */
    truncated: boolean;
    items: PendingWorkItem[];
}

/**
 * «Висяки» — незакрытые хвосты между перевозкой и бухгалтерией.
 *
 * Рейс завершён, а акта нет; акт выписан, а счёта нет; счёт выставлен, а
 * срок оплаты прошёл. Каждый такой хвост — это либо неполученные деньги,
 * либо документ, которого не хватит при проверке. Раньше их находили,
 * обходя три журнала руками и сверяя по памяти.
 *
 * Считается только по исходящим документам: входящие выставляет
 * контрагент, и «забыл выписать акт» — не наша забота.
 */
@Injectable()
export class PendingWorkService {
    constructor(private readonly prisma: PrismaService) {}

    async getPendingWork(companyId: string): Promise<{
        ordersWithoutAct: PendingWorkGroup;
        actsWithoutInvoice: PendingWorkGroup;
        overdueInvoices: PendingWorkGroup;
        generatedAt: Date;
    }> {
        const [ordersWithoutAct, actsWithoutInvoice, overdueInvoices] = await Promise.all([
            this.ordersWithoutAct(companyId),
            this.actsWithoutInvoice(companyId),
            this.overdueInvoices(companyId),
        ]);
        return { ordersWithoutAct, actsWithoutInvoice, overdueInvoices, generatedAt: new Date() };
    }

    /**
     * Рейсы, где мы — исполнитель перед заказчиком.
     *
     * Тот же отбор участников, что и при выставлении исходящего документа
     * (`billableOrdersWhere`): иначе в висяках оказались бы рейсы, по
     * которым мы вообще ничего не выставляем.
     */
    private sellerOrdersWhere(companyId: string): Prisma.OrderWhereInput {
        return {
            customerCompanyId: { not: null },
            NOT: { customerCompanyId: companyId },
            OR: [
                { forwarderId: companyId },
                { partnerId: companyId },
                { subForwarderId: companyId },
                { responsibleManager: { companyId } },
            ],
        };
    }

    /** Есть ли у рейса живой исходящий документ такого вида. */
    private hasOutgoing(companyId: string, type: AccountingDocumentType) {
        return {
            document: {
                companyId,
                type,
                direction: AccountingDocumentDirection.OUTGOING,
                // Отменённый документ висяк не закрывает: услуга так и
                // осталась неоформленной.
                status: { not: AccountingDocumentStatus.CANCELLED },
            },
        };
    }

    /** Рейс завершён, а акта выполненных работ по нему нет. */
    private async ordersWithoutAct(companyId: string): Promise<PendingWorkGroup> {
        const where: Prisma.OrderWhereInput = {
            ...this.sellerOrdersWhere(companyId),
            status: OrderStatus.COMPLETED,
            accountingDocuments: {
                none: this.hasOutgoing(companyId, AccountingDocumentType.SERVICE_ACT),
            },
        };
        return this.collectOrders(where);
    }

    /** Акт выписан, а счёта на оплату по этому рейсу нет — денег не ждём. */
    private async actsWithoutInvoice(companyId: string): Promise<PendingWorkGroup> {
        const where: Prisma.OrderWhereInput = {
            ...this.sellerOrdersWhere(companyId),
            accountingDocuments: {
                some: this.hasOutgoing(companyId, AccountingDocumentType.SERVICE_ACT),
            },
            // Второе условие по той же связи — отдельным AND: в одном
            // объекте ключ `accountingDocuments` может стоять лишь раз.
            AND: [{
                accountingDocuments: {
                    none: this.hasOutgoing(companyId, AccountingDocumentType.PAYMENT_INVOICE),
                },
            }],
        };
        return this.collectOrders(where);
    }

    private async collectOrders(where: Prisma.OrderWhereInput): Promise<PendingWorkGroup> {
        const orders = await this.prisma.order.findMany({
            where,
            select: {
                id: true,
                orderNumber: true,
                customerPrice: true,
                updatedAt: true,
                customerCompany: { select: { name: true } },
            },
            orderBy: { updatedAt: 'asc' },
            take: SCAN_LIMIT,
        });

        const total = orders.reduce((sum, order) => sum.plus(D(order.customerPrice)), ZERO);
        return {
            count: orders.length,
            total: toNum(total),
            truncated: orders.length === SCAN_LIMIT,
            items: orders.slice(0, PREVIEW_LIMIT).map((order) => ({
                id: order.id,
                orderId: order.id,
                label: order.orderNumber,
                counterparty: order.customerCompany?.name ?? null,
                amount: toNum(order.customerPrice),
                daysWaiting: this.daysSince(order.updatedAt),
            })),
        };
    }

    /** Счёт проведён, срок оплаты прошёл, а долг остался. */
    private async overdueInvoices(companyId: string): Promise<PendingWorkGroup> {
        const documents = await this.prisma.accountingDocument.findMany({
            where: {
                companyId,
                type: AccountingDocumentType.PAYMENT_INVOICE,
                direction: AccountingDocumentDirection.OUTGOING,
                // Черновик никто не отправлял — просрочки по нему нет.
                status: AccountingDocumentStatus.POSTED,
                dueDate: { lt: this.today() },
                balanceDue: { gt: 0 },
            },
            select: {
                id: true,
                number: true,
                dueDate: true,
                balanceDue: true,
                counterparty: { select: { name: true } },
            },
            orderBy: { dueDate: 'asc' },
            take: SCAN_LIMIT,
        });

        const total = documents.reduce((sum, document) => sum.plus(D(document.balanceDue)), ZERO);
        return {
            count: documents.length,
            total: toNum(total),
            truncated: documents.length === SCAN_LIMIT,
            items: documents.slice(0, PREVIEW_LIMIT).map((document) => ({
                id: document.id,
                documentId: document.id,
                label: document.number,
                counterparty: document.counterparty?.name ?? null,
                amount: toNum(document.balanceDue),
                daysWaiting: document.dueDate ? this.daysSince(document.dueDate) : 0,
            })),
        };
    }

    /**
     * Сегодня по времени Казахстана, а не сервера: иначе с полуночи до
     * 05:00 счёт со сроком «сегодня» уже числился просроченным.
     */
    private today(): Date {
        return kzToday();
    }

    private daysSince(date: Date): number {
        return kzDaysSince(date);
    }
}
