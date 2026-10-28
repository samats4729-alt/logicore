import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const AMOUNT_FIELDS = ['gross', 'commission', 'opv', 'vosms', 'ipn', 'net', 'so', 'fuelIssued', 'toPay'] as const;
const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

/** Что убрано вместе с заявкой — для ответа и журнала. */
export interface ForceDeleteResult {
    orderNumber: string;
    payoutsDeleted: number;
    payoutsReduced: number;
    paymentsDeleted: number;
    paymentsUnlinked: number;
    incomesExpenses: number;
    documentsDeleted: string[];
    /** Документы, где есть и другие заявки: из них заявку отвязали, суммы в документе — как были. */
    documentsShared: string[];
    payroll: number;
}

/**
 * Удалить заявку вместе с её деньгами — только администратор платформы
 * (владелец, 28.10.2026: «тестовая, выплата уже подтверждена — надо чтобы
 * можно было удалить»).
 *
 * Обычное удаление (`OrderDeleteService`) не трогает заявку, по которой
 * были деньги: так и должно быть у компаний. Здесь — для тестовых и
 * ошибочных заявок: убирается всё, что относится только к этой заявке.
 * - выплата водителю: если в ней только этот рейс — удаляется целиком,
 *   если есть и другие — из её сумм вычитается этот рейс;
 * - начисления зарплаты и бонусы по заявке;
 * - платежи только этой заявки — с разнесением по счетам и возвратами;
 *   платёж, разнесённый ещё и на другие заявки, остаётся, отвязывается;
 * - приходы и расходы по заявке;
 * - счета и акты только по этой заявке — целиком; общий с другими
 *   заявками документ остаётся, заявка из него отвязывается (суммы в нём
 *   не пересчитываются — это видно в ответе, править бухгалтеру);
 * - выдачи водителю парка, чеки, расчёт рейса, отклики — уходят с заявкой.
 * Что ушло в 1С, в 1С и остаётся — удалять там руками.
 *
 * Всё одной транзакцией: либо удалено всё, либо ничего.
 */
@Injectable()
export class OrderForceDeleteService {
    constructor(private readonly prisma: PrismaService) {}

    async delete(orderId: string, confirmNumber: string): Promise<ForceDeleteResult> {
        const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true } });
        if (!order) throw new NotFoundException('Заявка не найдена');
        if ((confirmNumber ?? '').trim() !== order.orderNumber) {
            throw new BadRequestException(`Для подтверждения впишите номер заявки: ${order.orderNumber}`);
        }

        return this.prisma.$transaction(async (tx) => {
            const result: ForceDeleteResult = {
                orderNumber: order.orderNumber, payoutsDeleted: 0, payoutsReduced: 0, paymentsDeleted: 0, paymentsUnlinked: 0,
                incomesExpenses: 0, documentsDeleted: [], documentsShared: [], payroll: 0,
            };

            // Выплаты водителю: рейс из выплаты убираем, пустую выплату — целиком.
            const items = await tx.driverPayoutItem.findMany({ where: { orderId }, select: { id: true, payoutId: true, ...pick(AMOUNT_FIELDS) } });
            for (const payoutId of new Set(items.map((i) => i.payoutId))) {
                const mine = items.filter((i) => i.payoutId === payoutId);
                const total = await tx.driverPayoutItem.count({ where: { payoutId } });
                if (total === mine.length) {
                    await tx.driverPayout.delete({ where: { id: payoutId } });
                    result.payoutsDeleted++;
                } else {
                    const data: Record<string, { decrement: number }> = {};
                    for (const f of AMOUNT_FIELDS) data[f] = { decrement: mine.reduce((s, i) => s + num((i as Record<string, unknown>)[f] as Prisma.Decimal), 0) };
                    await tx.driverPayout.update({ where: { id: payoutId }, data });
                    await tx.driverPayoutItem.deleteMany({ where: { id: { in: mine.map((i) => i.id) } } });
                    result.payoutsReduced++;
                }
            }

            result.payroll += (await tx.payrollAccrual.deleteMany({ where: { orderId } })).count;
            result.payroll += (await tx.bonus.deleteMany({ where: { orderId } })).count;

            // Платежи: только этой заявки — удаляем; разнесённые и на другие — отвязываем.
            const payments = await tx.payment.findMany({
                where: { OR: [{ orderId }, { orderShares: { some: { orderId } } }] },
                select: { id: true, orderId: true, orderShares: { select: { orderId: true } } },
            });
            for (const p of payments) {
                const elsewhere = p.orderShares.some((s) => s.orderId !== orderId) || (!!p.orderId && p.orderId !== orderId);
                if (elsewhere) {
                    if (p.orderId === orderId) await tx.payment.update({ where: { id: p.id }, data: { orderId: null } });
                    result.paymentsUnlinked++;
                    continue;
                }
                const refunds = await tx.payment.findMany({ where: { refundOfId: p.id }, select: { id: true } });
                const ids = [p.id, ...refunds.map((r) => r.id)];
                await tx.accountingPaymentAllocation.deleteMany({ where: { paymentId: { in: ids } } });
                await tx.payment.deleteMany({ where: { id: { in: refunds.map((r) => r.id) } } });
                await tx.payment.delete({ where: { id: p.id } });
                result.paymentsDeleted++;
            }

            result.incomesExpenses += (await tx.income.deleteMany({ where: { orderId } })).count;
            result.incomesExpenses += (await tx.expense.deleteMany({ where: { orderId } })).count;
            await tx.financeOperation.deleteMany({ where: { orderId } });

            // Счета и акты: только этой заявки — удаляем; общий — отвязываем.
            const docIds = new Set([
                ...(await tx.accountingDocumentOrder.findMany({ where: { orderId }, select: { documentId: true } })).map((d) => d.documentId),
                ...(await tx.accountingDocumentLine.findMany({ where: { orderId }, select: { documentId: true } })).map((d) => d.documentId),
            ]);
            for (const documentId of docIds) {
                const doc = await tx.accountingDocument.findUnique({ where: { id: documentId }, select: { number: true } });
                const others = await tx.accountingDocumentOrder.count({ where: { documentId, orderId: { not: orderId } } })
                    + await tx.accountingDocumentLine.count({ where: { documentId, orderId: { not: null, notIn: [orderId] } } });
                if (others) {
                    await tx.accountingDocumentOrder.deleteMany({ where: { documentId, orderId } });
                    result.documentsShared.push(doc?.number ?? documentId);
                } else {
                    await tx.accountingPaymentAllocation.deleteMany({ where: { documentId } });
                    await tx.accountingDocument.delete({ where: { id: documentId } });
                    result.documentsDeleted.push(doc?.number ?? documentId);
                }
            }

            // Дальше — как обычное удаление: файлы рейса, точки GPS, очередь склада, сама заявка.
            await tx.document.deleteMany({ where: { orderId } });
            await tx.gpsPoint.deleteMany({ where: { orderId } });
            await tx.warehouseQueueItem.deleteMany({ where: { orderId } });
            await tx.order.delete({ where: { id: orderId } });
            return result;
        }, { timeout: 30_000 });
    }
}

function pick<T extends readonly string[]>(fields: T) {
    return Object.fromEntries(fields.map((f) => [f, true])) as { [K in T[number]]: true };
}
