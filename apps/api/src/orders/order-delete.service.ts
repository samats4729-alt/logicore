import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Удалить заявку (задачи шефа, A12: «заявку не удалить ни из кабинета
 * компании, ни из кабинета парка»).
 *
 * Удаляется только заявка, по которой ещё не было денег и учётных
 * документов: платежей, долей платежа, приходов и расходов, счетов и актов,
 * начислений зарплаты, бонусов, выплат водителю. Такую заявку можно
 * отменить — удаление сбило бы взаиморасчёты, отчёты и зарплату задним
 * числом. Ошибочную или тестовую заявку без денег удаляет её хозяин:
 * экспедитор, а если экспедитора нет — заказчик, который её завёл.
 *
 * Файлы рейса (накладные, фото) и его история уходят вместе с заявкой;
 * в журнале действий остаётся запись, кто и когда удалил.
 */
@Injectable()
export class OrderDeleteService {
    constructor(private readonly prisma: PrismaService) {}

    /** Что мешает удалить — словами; пусто — можно. */
    async blockers(orderId: string): Promise<string[]> {
        const [payments, shares, incomes, expenses, operations, docs, lines, bonuses, accruals, payouts] = await Promise.all([
            this.prisma.payment.count({ where: { orderId } }),
            this.prisma.paymentOrderShare.count({ where: { orderId } }),
            this.prisma.income.count({ where: { orderId } }),
            this.prisma.expense.count({ where: { orderId } }),
            this.prisma.financeOperation.count({ where: { orderId } }),
            this.prisma.accountingDocumentOrder.count({ where: { orderId } }),
            this.prisma.accountingDocumentLine.count({ where: { orderId } }),
            this.prisma.bonus.count({ where: { orderId } }),
            this.prisma.payrollAccrual.count({ where: { orderId } }),
            this.prisma.driverPayoutItem.count({ where: { orderId } }),
        ]);
        const why: string[] = [];
        if (payments + shares) why.push('платежи');
        if (incomes + expenses + operations) why.push('приходы или расходы');
        if (docs + lines) why.push('счета или акты');
        if (bonuses + accruals) why.push('начисления зарплаты');
        if (payouts) why.push('выплата водителю');
        return why;
    }

    async delete(orderId: string, companyId: string | null | undefined, role: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, orderNumber: true, forwarderId: true, customerCompanyId: true },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');
        const owner = order.forwarderId ? order.forwarderId === companyId : order.customerCompanyId === companyId;
        if (role !== 'ADMIN' && !owner) {
            throw new ForbiddenException('Удалить заявку может только тот, кто её ведёт, — экспедитор этой заявки');
        }
        const why = await this.blockers(orderId);
        if (why.length) {
            throw new BadRequestException(
                `По заявке уже есть ${why.join(', ')} — удалить её нельзя, иначе собьются расчёты. Заявку можно отменить.`,
            );
        }
        await this.prisma.$transaction([
            // У этих связей нет каскадного удаления — убираем руками.
            this.prisma.document.deleteMany({ where: { orderId } }),
            this.prisma.gpsPoint.deleteMany({ where: { orderId } }),
            this.prisma.warehouseQueueItem.deleteMany({ where: { orderId } }),
            this.prisma.order.delete({ where: { id: orderId } }),
        ]);
        return { ok: true, orderNumber: order.orderNumber };
    }
}
