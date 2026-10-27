import { OrderDeleteService } from './order-delete.service';

/** Удаление заявки (задачи шефа, A12): только без денег и учётных документов, только хозяином. */
describe('Удаление заявки', () => {
    function build(order: any = { id: 'o-1', orderNumber: '000000031', forwarderId: 'мы', customerCompanyId: 'заказчик' }, counts: Record<string, number> = {}) {
        const count = (k: string) => ({ count: jest.fn().mockResolvedValue(counts[k] ?? 0), deleteMany: jest.fn() });
        const prisma: any = {
            order: { findUnique: jest.fn().mockResolvedValue(order), delete: jest.fn() },
            payment: count('payment'), paymentOrderShare: count('share'), income: count('income'), expense: count('expense'),
            financeOperation: count('op'), accountingDocumentOrder: count('doc'), accountingDocumentLine: count('line'),
            bonus: count('bonus'), payrollAccrual: count('accrual'), driverPayoutItem: count('payout'),
            document: count('file'), gpsPoint: count('gps'), warehouseQueueItem: count('queue'),
            $transaction: jest.fn(async (ops: any[]) => ops),
        };
        return { service: new OrderDeleteService(prisma), prisma };
    }

    it('заявка без денег — удаляется вместе с файлами, точками GPS и очередью склада', async () => {
        const { service, prisma } = build();
        await expect(service.delete('o-1', 'мы', 'COMPANY_ADMIN')).resolves.toMatchObject({ ok: true, orderNumber: '000000031' });
        expect(prisma.document.deleteMany).toHaveBeenCalledWith({ where: { orderId: 'o-1' } });
        expect(prisma.order.delete).toHaveBeenCalledWith({ where: { id: 'o-1' } });
    });

    it('есть платёж или счёт — удалить нельзя, только отменить', async () => {
        const { service, prisma } = build(undefined, { payment: 1, doc: 1 });
        await expect(service.delete('o-1', 'мы', 'COMPANY_ADMIN')).rejects.toThrow(/платежи, счета или акты — удалить её нельзя.*отменить/);
        expect(prisma.order.delete).not.toHaveBeenCalled();
    });

    it('чужая заявка (мы перевозчик, а не экспедитор) — нельзя', async () => {
        const { service } = build();
        await expect(service.delete('o-1', 'перевозчик', 'COMPANY_ADMIN')).rejects.toThrow(/экспедитор этой заявки/);
    });

    it('заявка без экспедитора — удаляет заказчик, который её завёл', async () => {
        const { service } = build({ id: 'o-1', orderNumber: '1', forwarderId: null, customerCompanyId: 'заказчик' });
        await expect(service.delete('o-1', 'заказчик', 'LOGISTICIAN')).resolves.toMatchObject({ ok: true });
    });
});
