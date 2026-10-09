import { DashboardBoardService, periodBounds } from './dashboard-board.service';

const DAY = 24 * 60 * 60 * 1000;

describe('Дашборд: границы периода', () => {
    // 8 октября 2026, 10:00 по Алматы (UTC+5).
    const now = new Date('2026-10-08T05:00:00Z');

    it('месяц — с 1 числа по Казахстану, прошлый — тот же кусок сентября', () => {
        const b = periodBounds('month', now);
        expect(b.start.toISOString()).toBe('2026-09-30T19:00:00.000Z');
        expect(b.prevStart.toISOString()).toBe('2026-08-31T19:00:00.000Z');
        // 7 дней и 10 часов от начала — столько же от начала сентября.
        expect(b.prevEnd.getTime() - b.prevStart.getTime()).toBe(now.getTime() - b.start.getTime());
    });

    it('неделя — с понедельника', () => {
        const b = periodBounds('week', now); // 8 октября 2026 — четверг
        expect(b.start.toISOString()).toBe('2026-10-04T19:00:00.000Z'); // понедельник 5 октября, 00:00 Алматы
        expect(b.start.getTime() - b.prevStart.getTime()).toBe(7 * DAY);
    });

    it('квартал — с начала квартала', () => {
        const b = periodBounds('quarter', now);
        expect(b.start.toISOString()).toBe('2026-09-30T19:00:00.000Z');
        expect(b.prevStart.toISOString()).toBe('2026-06-30T19:00:00.000Z');
    });
});

describe('Дашборд: история показателей по дням', () => {
    function build(opts: { active: any[]; history: any[]; finished?: any[] }) {
        const prisma: any = {
            order: {
                findMany: jest.fn()
                    .mockResolvedValueOnce(opts.active) // в работе, ждут, проблемы
                    .mockResolvedValueOnce([]) // созданные за период
                    .mockResolvedValueOnce([]) // без накладной
                    .mockResolvedValueOnce([]) // погрузки месяца
                    .mockResolvedValueOnce(opts.finished ?? []), // завершённые, что были в работе в окне
                count: jest.fn().mockResolvedValue(0),
            },
            orderStatusHistory: {
                findMany: jest.fn().mockResolvedValueOnce(opts.history).mockResolvedValue([]),
            },
        };
        return { service: new DashboardBoardService(prisma, {} as any), prisma };
    }
    const req = { companyId: 'c-1', userId: 'u-1', role: 'COMPANY_ADMIN' };
    const order = (id: string, status: string, createdDaysAgo: number) => ({
        id, orderNumber: id, status, createdAt: new Date(Date.now() - createdDaysAgo * DAY), isConfirmed: true,
        updatedAt: new Date(), customerPrice: null, assignedDriverName: null, assignedDriverPlate: null, driver: null, routePoints: [],
    });

    it('сегодняшняя точка графика — ровно число в плашке', async () => {
        const { service } = build({ active: [order('A', 'IN_TRANSIT', 30), order('B', 'PENDING', 1)], history: [] });
        const r = await service.ordersOverview(req, { period: 'month' });
        expect(r.kpi.inWork).toBe(1);
        expect(r.kpi.pending).toBe(1);
        expect(r.series.inWork[r.series.inWork.length - 1]).toBe(1);
        expect(r.series.pending[r.series.pending.length - 1]).toBe(1);
        expect(r.series.inWork).toHaveLength(14);
    });

    it('завершённый рейс считается «в работе» в те дни, когда ещё ехал', async () => {
        const finished = { id: 'C', status: 'COMPLETED', createdAt: new Date(Date.now() - 20 * DAY) };
        const { service } = build({
            active: [],
            history: [
                { orderId: 'C', status: 'IN_TRANSIT', changedAt: new Date(Date.now() - 10 * DAY) },
                { orderId: 'C', status: 'COMPLETED', changedAt: new Date(Date.now() - 3 * DAY) },
            ],
            finished: [finished],
        });
        const r = await service.ordersOverview(req, { period: 'month' });
        // 14 точек: 13 дней назад … сегодня. В работе — с 10-го по 4-й день назад.
        const вРаботе = r.series.inWork;
        expect(вРаботе[13]).toBe(0); // сегодня
        expect(вРаботе[13 - 3]).toBe(0); // в день завершения уже завершён
        expect(вРаботе[13 - 5]).toBe(1);
        expect(вРаботе[13 - 9]).toBe(1);
    });

    it('проблема: с какого момента стоит — из истории статусов', async () => {
        const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const prisma: any = {
            order: {
                findMany: jest.fn()
                    .mockResolvedValueOnce([order('P', 'PROBLEM', 3)])
                    .mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
            },
            orderStatusHistory: {
                findMany: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([{ orderId: 'P', changedAt: since, comment: 'Очередь на складе' }]),
            },
        };
        const service = new DashboardBoardService(prisma, {} as any);
        const r = await service.ordersOverview(req, { period: 'month' });
        expect(r.attention.problems).toEqual([
            expect.objectContaining({ orderNumber: 'P', since, comment: 'Очередь на складе' }),
        ]);
    });
});
