import { AuditService } from './audit.service';

/**
 * Выдачи водителю парка (топливо, предоплата) в истории рейса видит только
 * парк (27.10.2026): это деньги водителя на руки, а хозяин рейса — экспедитор —
 * видит в своей истории все действия, в том числе чужие.
 */
describe('История рейса: деньги водителя парка — только парку', () => {
    const order = { forwarderId: 'fwd', partnerId: 'park', customerCompanyId: 'client' };
    const actions = [
        { id: 'a1', orderId: 'o1', companyId: 'park', entity: 'driver_advance', action: 'CREATE', entityLabel: 'Предоплата водителю, 50 000 ₸: выдано', createdAt: new Date('2026-10-27T10:00:00Z') },
        { id: 'a2', orderId: 'o1', companyId: 'park', entity: 'order_document', action: 'CREATE', entityLabel: 'Загружена накладная', createdAt: new Date('2026-10-27T09:00:00Z') },
        { id: 'a3', orderId: 'o1', companyId: 'fwd', entity: 'order', action: 'UPDATE', entityLabel: 'Изменена дата', createdAt: new Date('2026-10-27T08:00:00Z') },
    ];
    const service = new AuditService({
        orderStatusHistory: { findMany: jest.fn().mockResolvedValue([]) },
        auditLog: { findMany: jest.fn().mockResolvedValue(actions) },
        user: { findMany: jest.fn().mockResolvedValue([]) },
    } as any);
    const labels = async (viewer: any) => (await service.getOrderHistory('o1', viewer)).map((e: any) => e.label);

    it('хозяин рейса не видит выдачу водителю, остальные действия парка — видит', async () => {
        expect(await labels({ companyId: 'fwd', order })).toEqual(['Загружена накладная', 'Изменена дата']);
    });

    it('парк видит свою выдачу', async () => {
        expect(await labels({ companyId: 'park', order })).toEqual(['Предоплата водителю, 50 000 ₸: выдано', 'Загружена накладная']);
    });

    it('заказчик не видит ни выдачу, ни чужие действия', async () => {
        expect(await labels({ companyId: 'client', order })).toEqual([]);
    });
});
