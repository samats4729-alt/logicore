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
import { documentsOfOwnOrders, managerOrdersFilter } from '../common/manager-orders';

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

    async getPendingWork(
        companyId: string,
        viewer?: { userId?: string | null; role?: string | null },
    ): Promise<{
        ordersWithoutAct: PendingWorkGroup;
        actsWithoutInvoice: PendingWorkGroup;
        overdueInvoices: PendingWorkGroup;
        unconfirmedSettlements: PendingWorkGroup;
        generatedAt: Date;
    }> {
        // Виджет раньше был только у тех, кто и так видит компанию целиком.
        // Теперь его можно открыть менеджеру — и тогда он обязан показывать
        // висяки по его рейсам, иначе через список «рейс завершён, акта нет»
        // видно чужие сделки со ставками.
        const свои = await managerOrdersFilter(this.prisma, {
            companyId,
            role: viewer?.role,
            userId: viewer?.userId,
        });
        const [ordersWithoutAct, actsWithoutInvoice, overdueInvoices, unconfirmedSettlements] =
            await Promise.all([
                this.ordersWithoutAct(companyId, свои),
                this.actsWithoutInvoice(companyId, свои),
                this.overdueInvoices(companyId, свои),
                this.unconfirmedSettlements(companyId, свои),
            ]);
        return {
            ordersWithoutAct,
            actsWithoutInvoice,
            overdueInvoices,
            unconfirmedSettlements,
            generatedAt: new Date(),
        };
    }

    /**
     * Рейсы, где расчёты ждут бухгалтера.
     *
     * Обычно это новый контрагент, у которого в карточке ещё не заполнены НДС
     * и срок оплаты. Пока не заполнены, по рейсу нельзя заверить договор и
     * выставить счёт — и без этого списка бухгалтер узнавал бы о таких рейсах
     * от менеджера, у которого не работает кнопка.
     */
    private async unconfirmedSettlements(
        companyId: string,
        свои: Prisma.OrderWhereInput | null,
    ): Promise<PendingWorkGroup> {
        return this.collectOrders(this.только(свои, {
            settlementsConfirmedAt: null,
            status: { notIn: [OrderStatus.CANCELLED, OrderStatus.COMPLETED] },
            OR: [
                { forwarderId: companyId },
                { partnerId: companyId },
                { responsibleManager: { companyId } },
            ],
        }));
    }

    /**
     * Добавить к отбору «и только свои рейсы».
     *
     * Отдельным `AND`, а не слиянием ключей: у отбора уже есть свой `OR`
     * (кем мы приходимся рейсу), и у «своих» тоже свой. Слей их в один
     * объект — второй затрёт первый, и вместо сужения выйдет расширение.
     */
    private только(
        свои: Prisma.OrderWhereInput | null,
        where: Prisma.OrderWhereInput,
    ): Prisma.OrderWhereInput {
        if (!свои) return where;
        const было = where.AND;
        const прежние = Array.isArray(было) ? было : было ? [было] : [];
        return { ...where, AND: [...прежние, свои] };
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
    private async ordersWithoutAct(
        companyId: string,
        свои: Prisma.OrderWhereInput | null,
    ): Promise<PendingWorkGroup> {
        const where: Prisma.OrderWhereInput = {
            ...this.sellerOrdersWhere(companyId),
            status: OrderStatus.COMPLETED,
            accountingDocuments: {
                none: this.hasOutgoing(companyId, AccountingDocumentType.SERVICE_ACT),
            },
        };
        return this.collectOrders(this.только(свои, where));
    }

    /** Акт выписан, а счёта на оплату по этому рейсу нет — денег не ждём. */
    private async actsWithoutInvoice(
        companyId: string,
        свои: Prisma.OrderWhereInput | null,
    ): Promise<PendingWorkGroup> {
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
        return this.collectOrders(this.только(свои, where));
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
    private async overdueInvoices(
        companyId: string,
        свои: Prisma.OrderWhereInput | null,
    ): Promise<PendingWorkGroup> {
        const documents = await this.prisma.accountingDocument.findMany({
            where: {
                companyId,
                type: AccountingDocumentType.PAYMENT_INVOICE,
                direction: AccountingDocumentDirection.OUTGOING,
                // Черновик никто не отправлял — просрочки по нему нет.
                status: AccountingDocumentStatus.POSTED,
                dueDate: { lt: this.today() },
                balanceDue: { gt: 0 },
                ...(свои ? documentsOfOwnOrders(свои) : {}),
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
