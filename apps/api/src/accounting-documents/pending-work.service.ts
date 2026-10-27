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
/** Сколько дней вперёд счёт считается «срок подходит». */
const DUE_SOON_DAYS = 7;

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
    /** Счёт ждёт оплаты: сколько дней до срока (0 — сегодня). */
    daysLeft?: number;
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
        dueInvoices: PendingWorkGroup;
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
        const [ordersWithoutAct, actsWithoutInvoice, overdueInvoices, dueInvoices, unconfirmedSettlements] =
            await Promise.all([
                this.ordersWithoutAct(companyId, свои),
                this.actsWithoutInvoice(companyId, свои),
                this.overdueInvoices(companyId, свои),
                this.dueInvoices(companyId, свои),
                this.unconfirmedSettlements(companyId, свои),
            ]);
        return {
            ordersWithoutAct,
            actsWithoutInvoice,
            overdueInvoices,
            dueInvoices,
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
        // Рейсы с деньгами — выше рейсов без суммы (задачи шефа, I6): нулевая
        // строка над строкой на 300 тысяч только отвлекает. Внутри — по-прежнему
        // самые давние сверху.
        const withMoney = (order: { customerPrice: unknown }) => D(order.customerPrice as any).gt(0);
        const sorted = [...orders.filter(withMoney), ...orders.filter((order) => !withMoney(order))];
        return {
            count: orders.length,
            total: toNum(total),
            truncated: orders.length === SCAN_LIMIT,
            items: sorted.slice(0, PREVIEW_LIMIT).map((order) => ({
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
     * Счёт выставлен, срок оплаты подходит — в ближайшие 7 дней (задачи
     * шефа, I6: «выставленные счета, ожидающие оплаты, подошедшие по
     * графику»). Ещё не просрочен, но звонить заказчику пора.
     */
    private async dueInvoices(
        companyId: string,
        свои: Prisma.OrderWhereInput | null,
    ): Promise<PendingWorkGroup> {
        const today = this.today();
        const weekAhead = new Date(today.getTime() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000);
        const documents = await this.prisma.accountingDocument.findMany({
            where: {
                companyId,
                type: AccountingDocumentType.PAYMENT_INVOICE,
                direction: AccountingDocumentDirection.OUTGOING,
                status: AccountingDocumentStatus.POSTED,
                dueDate: { gte: today, lte: weekAhead },
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
                daysWaiting: 0,
                daysLeft: document.dueDate
                    ? Math.max(0, Math.round((document.dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)))
                    : 0,
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
