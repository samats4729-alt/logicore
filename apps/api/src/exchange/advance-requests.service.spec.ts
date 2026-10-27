import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExchangeAdvanceRequestsService } from './advance-requests.service';

/** Запросы водителя парка на топливо и аванс (Q17). */
describe('водитель просит на топливо или аванс', () => {
    function setup(opts: { pct?: number | null; issued?: number; pending?: number; status?: string; payoutItem?: boolean; request?: any } = {}) {
        const request = {
            id: 'a1', status: 'REQUESTED', kind: 'FUEL', amount: 60000, orderId: 'o1',
            order: { id: 'o1', partnerId: 'park', driverPayoutItem: opts.payoutItem ? { id: 'p' } : null },
            ...opts.request,
        };
        const row = {
            ...request, comment: null, parkNote: null, issuedAmount: null, decidedAt: null, createdAt: new Date(), updatedAt: new Date(),
            order: { orderNumber: '000000023' }, driver: { id: 'd1', lastName: 'Водителев', firstName: 'Тест', phone: '+77019990001' },
        };
        const tx: any = {
            exchangeFuelIssue: { create: jest.fn().mockResolvedValue({ id: 'issue-1' }) },
            driverAdvanceRequest: { update: jest.fn() },
        };
        const prisma: any = {
            exchangeDriver: { findUnique: jest.fn().mockResolvedValue({ id: 'd1', kind: 'PARK', parkCompanyId: 'park', status: 'APPROVED' }) },
            order: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'o1', partnerId: 'park', status: opts.status ?? 'IN_TRANSIT', driverPayoutItem: opts.payoutItem ? { id: 'p' } : null,
                }),
            },
            exchangeTripSettlement: { findUnique: jest.fn().mockResolvedValue({ driverTotal: 400000 }) },
            parkPayoutRates: { findUnique: jest.fn().mockResolvedValue(opts.pct === null ? null : { advanceLimitPct: opts.pct ?? 50 }) },
            exchangeFuelIssue: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: opts.issued ?? 0 } }) },
            driverAdvanceRequest: {
                aggregate: jest.fn().mockResolvedValue({ _sum: { amount: opts.pending ?? 0 } }),
                count: jest.fn().mockResolvedValue(opts.pending ? 1 : 0),
                create: jest.fn().mockResolvedValue({ id: 'a-new' }),
                findMany: jest.fn().mockResolvedValue([]),
                findFirst: jest.fn().mockResolvedValue(request),
                findUniqueOrThrow: jest.fn().mockResolvedValue(row),
                update: jest.fn(),
            },
            $transaction: jest.fn(async (cb: any) => cb(tx)),
        };
        return { service: new ExchangeAdvanceRequestsService(prisma), prisma, tx };
    }

    it('по умолчанию — не больше 50 % суммы за рейс за вычетом выданного и ждущего', async () => {
        const { service } = setup({ pct: null, issued: 100000, pending: 30000 });
        const { limit } = await service.forDriver('u1', 'o1');
        // 50 % от 400 000 = 200 000; уже дали 100 000 и ждут 30 000 → 70 000.
        expect(limit).toEqual(expect.objectContaining({ pct: 50, cap: 200000, available: 70000 }));
    });

    it('в пределах — запрос уходит парку; больше — понятный отказ с суммой', async () => {
        const { service, prisma } = setup({ issued: 100000 });
        await service.request('u1', 'o1', { kind: 'FUEL', amount: '100 000' });
        expect(prisma.driverAdvanceRequest.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
            parkCompanyId: 'park', driverId: 'd1', orderId: 'o1', kind: 'FUEL', amount: 100000,
        }));
        await expect(service.request('u1', 'o1', { kind: 'ADVANCE', amount: 100001 })).rejects.toThrow(/не больше 100\s000 ₸: это 50 %/);
    });

    it('пока парк решает прошлый запрос — новый не уходит', async () => {
        const { service, prisma } = setup({ pending: 30000 });
        await expect(service.request('u1', 'o1', { kind: 'ADVANCE', amount: 1000 })).rejects.toThrow(/решает прошлый запрос/);
        expect(prisma.driverAdvanceRequest.create).not.toHaveBeenCalled();
    });

    it('парк задал свою долю — считается по ней', async () => {
        const { service } = setup({ pct: 30 });
        const { limit } = await service.forDriver('u1', 'o1');
        expect(limit?.available).toBe(120000);
    });

    it('после рейса или после запроса выплаты — уже не аванс', async () => {
        await expect(setup({ status: 'COMPLETED' }).service.request('u1', 'o1', { kind: 'FUEL', amount: 1000 })).rejects.toThrow(/Рейс закрыт/);
        await expect(setup({ payoutItem: true }).service.request('u1', 'o1', { kind: 'FUEL', amount: 1000 })).rejects.toThrow(/Выплата по рейсу уже запрошена/);
    });

    it('парк выдаёт — запись «дали на топливо» по рейсу, сумма в запросе', async () => {
        const { service, tx } = setup();
        await service.decide('park', 'acc', 'a1', { action: 'APPROVE', amount: 50000, method: 'STATION' });
        expect(tx.exchangeFuelIssue.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
            orderId: 'o1', parkCompanyId: 'park', method: 'STATION', amount: 50000, note: 'Топливо по запросу водителя',
        }));
        expect(tx.driverAdvanceRequest.update.mock.calls[0][0].data).toEqual(expect.objectContaining({
            status: 'APPROVED', issuedAmount: 50000, fuelIssueId: 'issue-1', decidedById: 'acc',
        }));
    });

    it('доп. проверка — без причины можно; перезагрузить документы и отказ — только с пояснением', async () => {
        const check = setup();
        await check.service.decide('park', 'acc', 'a1', { action: 'CHECK' });
        expect(check.prisma.driverAdvanceRequest.update.mock.calls[0][0].data.status).toBe('CHECK');

        const { service } = setup();
        await expect(service.decide('park', 'acc', 'a1', { action: 'REUPLOAD' })).rejects.toThrow(/какие документы перезагрузить/);
        await expect(service.decide('park', 'acc', 'a1', { action: 'REJECT', note: ' ' })).rejects.toThrow(/причину отказа/);
    });

    it('решённый запрос второй раз не решается; водитель возвращает к парку только после «перезагрузить»', async () => {
        const decided = setup({ request: { status: 'APPROVED' } });
        await expect(decided.service.decide('park', 'acc', 'a1', { action: 'APPROVE' })).rejects.toBeInstanceOf(BadRequestException);

        const requested = setup();
        await expect(requested.service.resubmit('u1', 'a1')).rejects.toThrow(/не просил перезагрузить/);
        const reupload = setup({ request: { status: 'REUPLOAD' } });
        await reupload.service.resubmit('u1', 'a1');
        expect(reupload.prisma.driverAdvanceRequest.update.mock.calls[0][0].data).toEqual({ status: 'REQUESTED' });
    });

    it('водитель с ИП или заблокированный — не через парк', async () => {
        const ip = setup();
        ip.prisma.exchangeDriver.findUnique.mockResolvedValue({ id: 'd1', kind: 'IP', parkCompanyId: null, status: 'APPROVED' });
        await expect(ip.service.forDriver('u1', 'o1')).rejects.toBeInstanceOf(ForbiddenException);
        const blocked = setup();
        blocked.prisma.exchangeDriver.findUnique.mockResolvedValue({ id: 'd1', kind: 'PARK', parkCompanyId: 'park', status: 'BLOCKED' });
        await expect(blocked.service.forDriver('u1', 'o1')).rejects.toThrow(/заблокированы/);
    });
});
