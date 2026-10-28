import { AdminOrdersService } from './admin-orders.service';
import { OrderDeleteService } from '../orders/order-delete.service';

/** Разбор заявки для администратора платформы (владелец, 28.10.2026). */
describe('Админка: разбор заявки', () => {
    const company = (id: string, name: string, isExternal = false) => ({ id, name, bin: null, isExternal });

    function build(extra: { payoutStatus?: string; status?: string; payments?: any[]; fuelIssues?: any[]; advanceLinks?: any[] } = {}) {
        const order = {
            id: 'o1', orderNumber: 'LC-1', status: extra.status ?? 'COMPLETED', createdAt: new Date(), completedAt: new Date(),
            cargoDescription: 'Напитки', cargoWeight: 20000, customerPrice: null, driverCost: 118000, subForwarderPrice: null,
            customerCompanyId: null, forwarderId: 'fwd', subForwarderId: null, partnerId: 'park',
            customerCompany: null, forwarder: company('fwd', 'ТОО «Экспедитор»'), subForwarder: null, partner: company('park', 'ТОО «Парк»'),
            assignedDriverName: 'Рулев Нурлан', assignedDriverPhone: null, assignedDriverPlate: '999 PRK 02', assignedDriverTrailer: null,
            driver: null, routePoints: [], statusHistory: [],
        };
        const count = (n = 0) => jest.fn().mockResolvedValue(n);
        const payoutItems = extra.payoutStatus ? [{
            toPay: 118000, net: 118000,
            payout: { status: extra.payoutStatus, requestedAt: new Date(), paidAt: null, park: { name: 'ТОО «Парк»' }, driver: { lastName: 'Рулев', firstName: 'Нурлан' } },
        }] : [];
        const prisma: any = {
            order: { findUnique: jest.fn().mockResolvedValue(order) },
            payment: { findMany: jest.fn().mockResolvedValue(extra.payments ?? []), count: count((extra.payments ?? []).length) },
            paymentOrderShare: { findMany: jest.fn().mockResolvedValue([]), count: count() },
            income: { findMany: jest.fn().mockResolvedValue([]), count: count() },
            expense: { findMany: jest.fn().mockResolvedValue([]), count: count() },
            financeOperation: { count: count() },
            accountingDocumentOrder: { findMany: jest.fn().mockResolvedValue([]), count: count() },
            accountingDocumentLine: { findMany: jest.fn().mockResolvedValue([]), count: count() },
            payrollAccrual: { findMany: jest.fn().mockResolvedValue([]), count: count() },
            bonus: { findMany: jest.fn().mockResolvedValue([]), count: count() },
            driverPayoutItem: { findMany: jest.fn().mockResolvedValue(payoutItems), count: count(payoutItems.length) },
            document: { count: count(2) },
            company: { findMany: jest.fn(async ({ where }: any) => [company('fwd', 'ТОО «Экспедитор»'), company('park', 'ТОО «Парк»')].filter((c) => !where?.id?.in || where.id.in.includes(c.id))) },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            oneCObjectMap: { findMany: jest.fn().mockResolvedValue([]) },
            exchangeFuelIssue: { findMany: jest.fn().mockResolvedValue(extra.fuelIssues ?? []), count: count((extra.fuelIssues ?? []).length) },
            exchangeFuelReceipt: { findMany: jest.fn().mockResolvedValue([]), count: count() },
            driverAdvanceRequest: { findMany: jest.fn().mockResolvedValue(extra.advanceLinks ?? []) },
        };
        // Обе стороны зарегистрированы — так у шефа: он и экспедитор, и водитель парка.
        const orders: any = { getRegisteredParticipants: jest.fn().mockResolvedValue(['fwd', 'park']) };
        return { service: new AdminOrdersService(prisma, orders, new OrderDeleteService(prisma, {} as any)), prisma };
    }

    it('случай шефа: удалить мешает запрошенная выплата водителю — сказано, кто и где её отклоняет', async () => {
        const d = await build({ payoutStatus: 'REQUESTED' }).service.details('o1');
        expect(d.delete.can).toBe(false);
        expect(d.delete.blockers).toEqual([expect.objectContaining({
            what: 'Водитель запросил выплату за этот рейс',
            items: [expect.stringMatching(/^Рулев Нурлан — 118\s000 ₸, запрошена, ждёт парка \(ТОО «Парк»\)$/)],
            fix: expect.stringMatching(/Парку отклонить эту выплату.*Выплаты водителям/),
        })]);
    });

    it('выплата уже проведена — честно: удалить нельзя, только отменить', async () => {
        const d = await build({ payoutStatus: 'PAID' }).service.details('o1');
        expect(d.delete.blockers[0].fix).toMatch(/Выплата уже проведена/);
    });

    it('завершённая заявка двух зарегистрированных компаний: сами не отменят, администратор — может', async () => {
        const d = await build().service.details('o1');
        expect(d.cancel).toMatchObject({ companiesCan: false, adminCan: true });
        expect(d.cancel.blockers[0]).toMatchObject({ items: ['ТОО «Экспедитор»', 'ТОО «Парк»'], fix: expect.stringMatching(/Отменить может администратор/) });
    });

    it('платёж — по записи: дата, сумма, чья компания и где его убрать', async () => {
        const d = await build({
            status: 'IN_TRANSIT',
            payments: [{ id: 'p1', date: new Date('2026-10-12T10:00:00Z'), amount: 50000, direction: 'IN', company: { name: 'ТОО «Экспедитор»' }, counterparty: { name: 'ТОО «Заказчик»' } }],
        }).service.details('o1');
        expect(d.delete.blockers).toEqual([expect.objectContaining({
            what: 'Платежи по заявке',
            items: [expect.stringMatching(/^Поступление 12\.10\.2026 на 50\s000 ₸ — ТОО «Экспедитор» ↔ ТОО «Заказчик»$/)],
            fix: expect.stringMatching(/Деньги → Платежи/),
        })]);
        expect(d.cancel.adminCan).toBe(true);
        expect(d.order).toMatchObject({ driverCost: 118000, filesCount: 2, driver: { name: 'Рулев Нурлан', plate: '999 PRK 02' } });
    });

    it('парк выдал водителю топливо и предоплату — удалить нельзя, расписано, что выдано и где убрать', async () => {
        const d = await build({
            status: 'IN_TRANSIT',
            fuelIssues: [
                { id: 'f1', amount: 60000, method: 'STATION', note: null, createdAt: new Date('2026-10-27T10:00:00Z') },
                { id: 'a1', amount: 50000, method: 'TO_DRIVER', note: null, createdAt: new Date('2026-10-27T11:00:00Z') },
            ],
            advanceLinks: [{ fuelIssueId: 'a1', kind: 'ADVANCE', status: 'APPROVED' }],
        }).service.details('o1');
        expect(d.delete.can).toBe(false);
        expect(d.delete.blockers[0]).toMatchObject({
            what: 'Парк выдал водителю деньги по рейсу',
            items: [
                expect.stringMatching(/^Топливо 60\s000 ₸ — 27\.10\.2026, на заправке, без запроса$/),
                expect.stringMatching(/^Предоплата 50\s000 ₸ — 27\.10\.2026, переводом, по запросу водителя$/),
            ],
            fix: expect.stringMatching(/Выдачи и чеки/),
        });
    });

    it('без денег и документов — удалить можно', async () => {
        const d = await build({ status: 'PENDING' }).service.details('o1');
        expect(d.delete).toEqual({ can: true, blockers: [] });
    });
});
