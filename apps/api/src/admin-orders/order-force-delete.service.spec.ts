import { BadRequestException } from '@nestjs/common';
import { OrderForceDeleteService } from './order-force-delete.service';

/** Удаление тестовой заявки вместе с деньгами — только администратор (владелец, 28.10.2026). */
describe('Админка: удалить заявку вместе с деньгами', () => {
    const amounts = { gross: 90000, commission: 0, opv: 9000, vosms: 1800, ipn: 0, net: 81000, so: 4050, fuelIssued: 0, toPay: 81000 };

    function build(opts: { payoutItemsTotal?: number; paymentShares?: string[]; docOthers?: number } = {}) {
        const m = (v: any = undefined) => jest.fn().mockResolvedValue(v);
        const tx: any = {
            driverPayoutItem: {
                findMany: m([{ id: 'item-1', payoutId: 'payout-1', ...amounts }]),
                count: m(opts.payoutItemsTotal ?? 1),
                deleteMany: m({ count: 1 }),
            },
            driverPayout: { delete: m(), update: m() },
            payrollAccrual: { deleteMany: m({ count: 1 }) },
            bonus: { deleteMany: m({ count: 0 }) },
            payment: {
                findMany: jest.fn(async ({ where }: any) => (where.refundOfId
                    ? []
                    : [{ id: 'pay-1', orderId: 'o1', orderShares: (opts.paymentShares ?? ['o1']).map((orderId) => ({ orderId })) }])),
                update: m(), delete: m(), deleteMany: m({ count: 0 }),
            },
            accountingPaymentAllocation: { deleteMany: m({ count: 1 }) },
            income: { deleteMany: m({ count: 1 }) },
            expense: { deleteMany: m({ count: 0 }) },
            financeOperation: { deleteMany: m({ count: 0 }) },
            accountingDocumentOrder: { findMany: m([{ documentId: 'doc-1' }]), count: m(opts.docOthers ?? 0), deleteMany: m() },
            accountingDocumentLine: { findMany: m([]), count: m(0) },
            accountingDocument: { findUnique: m({ number: 'АВР-7' }), delete: m() },
            document: { deleteMany: m() }, gpsPoint: { deleteMany: m() }, warehouseQueueItem: { deleteMany: m() },
            order: { delete: m() },
        };
        const prisma: any = {
            order: { findUnique: m({ id: 'o1', orderNumber: 'LC-0042' }) },
            $transaction: jest.fn(async (cb: any) => cb(tx)),
        };
        return { service: new OrderForceDeleteService(prisma), tx };
    }

    it('без номера заявки в подтверждении — ничего не удаляется', async () => {
        const { service, tx } = build();
        await expect(service.delete('o1', 'LC-0041')).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.order.delete).not.toHaveBeenCalled();
    });

    it('тестовая заявка шефа: проведённая выплата только за этот рейс, платёж, акт — всё удаляется, затем заявка', async () => {
        const { service, tx } = build();
        const r = await service.delete('o1', ' LC-0042 ');
        expect(tx.driverPayout.delete).toHaveBeenCalledWith({ where: { id: 'payout-1' } });
        expect(tx.accountingPaymentAllocation.deleteMany).toHaveBeenCalledWith({ where: { paymentId: { in: ['pay-1'] } } });
        expect(tx.payment.delete).toHaveBeenCalledWith({ where: { id: 'pay-1' } });
        expect(tx.accountingDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
        expect(tx.order.delete).toHaveBeenCalledWith({ where: { id: 'o1' } });
        expect(r).toMatchObject({ orderNumber: 'LC-0042', payoutsDeleted: 1, paymentsDeleted: 1, documentsDeleted: ['АВР-7'], payroll: 1, incomesExpenses: 1 });
    });

    it('в выплате есть и другие рейсы — выплата остаётся, из её сумм вычитается этот рейс', async () => {
        const { service, tx } = build({ payoutItemsTotal: 3 });
        const r = await service.delete('o1', 'LC-0042');
        expect(tx.driverPayout.delete).not.toHaveBeenCalled();
        expect(tx.driverPayout.update.mock.calls[0][0].data).toMatchObject({ toPay: { decrement: 81000 }, net: { decrement: 81000 }, opv: { decrement: 9000 } });
        expect(tx.driverPayoutItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['item-1'] } } });
        expect(r.payoutsReduced).toBe(1);
    });

    it('платёж разнесён и на другую заявку, акт общий — не удаляются, только отвязываются', async () => {
        const { service, tx } = build({ paymentShares: ['o1', 'o2'], docOthers: 1 });
        const r = await service.delete('o1', 'LC-0042');
        expect(tx.payment.delete).not.toHaveBeenCalled();
        expect(tx.payment.update).toHaveBeenCalledWith({ where: { id: 'pay-1' }, data: { orderId: null } });
        expect(tx.accountingDocument.delete).not.toHaveBeenCalled();
        expect(tx.accountingDocumentOrder.deleteMany).toHaveBeenCalledWith({ where: { documentId: 'doc-1', orderId: 'o1' } });
        expect(r).toMatchObject({ paymentsUnlinked: 1, documentsShared: ['АВР-7'] });
    });
});
