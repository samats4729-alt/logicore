import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExchangeAdvanceRequestsService } from './advance-requests.service';

/** Запросы водителя парка на топливо и аванс (Q17). */
describe('водитель просит на топливо или предоплату', () => {
    /**
     * Рейс: на руки 246 600, топливо по километражу 126 000. Парк уже дал на
     * топливо `fuelIssued`, предоплатой — `advanceIssued`; ждут решения —
     * `pendingFuel` и `pendingAdvance`.
     */
    function setup(opts: {
        pct?: number | null; fuelIssued?: number; advanceIssued?: number; pendingFuel?: number; pendingAdvance?: number;
        fuelEstimate?: number; status?: string; payoutItem?: boolean; request?: any;
    } = {}) {
        const request = {
            id: 'a1', status: 'REQUESTED', kind: 'FUEL', amount: 60000, orderId: 'o1',
            order: { id: 'o1', partnerId: 'park', driverPayoutItem: opts.payoutItem ? { id: 'p' } : null },
            ...opts.request,
        };
        const row = {
            ...request, comment: null, parkNote: null, issuedAmount: null, decidedAt: null, createdAt: new Date(), updatedAt: new Date(),
            order: { orderNumber: '000000023' }, driver: { id: 'd1', lastName: 'Водителев', firstName: 'Тест', phone: '+77019990001' },
        };
        const issues = [
            ...(opts.fuelIssued ? [{ id: 'fuel-1', amount: opts.fuelIssued }] : []),
            ...(opts.advanceIssued ? [{ id: 'adv-1', amount: opts.advanceIssued }] : []),
        ];
        const open = [
            ...(opts.pendingFuel ? [{ id: 'p-fuel', kind: 'FUEL', amount: opts.pendingFuel }] : []),
            ...(opts.pendingAdvance ? [{ id: 'p-adv', kind: 'ADVANCE', amount: opts.pendingAdvance }] : []),
        ];
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
            exchangeTripSettlement: { findUnique: jest.fn().mockResolvedValue({ driverTotal: 246600, fuelEstimate: opts.fuelEstimate ?? 126000 }) },
            parkPayoutRates: { findUnique: jest.fn().mockResolvedValue(opts.pct === null ? null : { advanceLimitPct: opts.pct ?? 50 }) },
            exchangeFuelIssue: { findMany: jest.fn().mockResolvedValue(issues) },
            driverAdvanceRequest: {
                count: jest.fn(async ({ where }: any) => open.filter((r) => r.kind === where.kind).length),
                create: jest.fn().mockResolvedValue({ id: 'a-new' }),
                findMany: jest.fn(async ({ where }: any) => {
                    // Выданная предоплата — по ней узнаём, какая запись выдачи — предоплата.
                    if (where.status === 'APPROVED') return opts.advanceIssued ? [{ fuelIssueId: 'adv-1' }] : [];
                    if (where.status?.in) return open.filter((r) => !where.id || r.id !== where.id.not);
                    return [];
                }),
                findFirst: jest.fn().mockResolvedValue(request),
                findUniqueOrThrow: jest.fn().mockResolvedValue(row),
                update: jest.fn(),
            },
            $transaction: jest.fn(async (cb: any) => cb(tx)),
        };
        return { service: new ExchangeAdvanceRequestsService(prisma), prisma, tx };
    }

    it('топливо и предоплата — раздельные лимиты: топливо по километражу, предоплата — доля суммы на руки', async () => {
        const { service } = setup({ pct: null, fuelIssued: 50000, advanceIssued: 20000, pendingFuel: 30000 });
        const { limit } = await service.forDriver('u1', 'o1');
        // Топливо: лимит 126 000, дали 50 000, ждёт 30 000 → 46 000. Предоплата —
        // не в счёт топлива: 50 % от 246 600 = 123 300, выдано 20 000 → 103 300.
        expect(limit).toEqual({
            pct: 50, onHand: 246600,
            fuel: { cap: 126000, issued: 50000, pending: 30000, available: 46000 },
            advance: { cap: 123300, issued: 20000, pending: 0, available: 103300 },
        });
    });

    it('в пределах — запрос уходит парку; больше — понятный отказ: какой лимит и почему', async () => {
        const { service, prisma } = setup({ fuelIssued: 100000 });
        await service.request('u1', 'o1', { kind: 'FUEL', amount: '26 000' });
        expect(prisma.driverAdvanceRequest.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
            parkCompanyId: 'park', driverId: 'd1', orderId: 'o1', kind: 'FUEL', amount: 26000,
        }));
        await expect(service.request('u1', 'o1', { kind: 'FUEL', amount: 26001 })).rejects.toThrow(/Топливо — не больше 26\s000 ₸ \(лимит 126\s000 ₸\)/);
        // Топливо, выданное парком, предоплату не уменьшает.
        await service.request('u1', 'o1', { kind: 'ADVANCE', amount: 123300 });
        await expect(service.request('u1', 'o1', { kind: 'ADVANCE', amount: 123301 })).rejects.toThrow(/Предоплата — не больше 123\s300 ₸ \(50 % от суммы на руки\)/);
    });

    it('топливо по рейсу не посчитано — на топливо не попросить, предоплату можно', async () => {
        const { service } = setup({ fuelEstimate: 0 });
        await expect(service.request('u1', 'o1', { kind: 'FUEL', amount: 1000 })).rejects.toThrow(/не рассчитано/);
        await expect(service.request('u1', 'o1', { kind: 'ADVANCE', amount: 1000 })).resolves.toBeDefined();
    });

    it('пока парк решает прошлый запрос того же вида — новый не уходит; другого вида — уходит', async () => {
        const { service, prisma } = setup({ pendingFuel: 30000 });
        await expect(service.request('u1', 'o1', { kind: 'FUEL', amount: 1000 })).rejects.toThrow(/Запрос на топливо уже у парка/);
        expect(prisma.driverAdvanceRequest.create).not.toHaveBeenCalled();
        await service.request('u1', 'o1', { kind: 'ADVANCE', amount: 1000 });
        expect(prisma.driverAdvanceRequest.create).toHaveBeenCalledTimes(1);
    });

    it('парк задал свою долю предоплаты — считается по ней', async () => {
        const { service } = setup({ pct: 30 });
        const { limit } = await service.forDriver('u1', 'o1');
        expect(limit?.advance.available).toBe(73980);
        expect(limit?.fuel.available).toBe(126000);
    });

    it('парк не выдаст больше лимита своего вида: предоплату — сверх доли от суммы на руки', async () => {
        const { service, tx } = setup({ advanceIssued: 100000, request: { kind: 'ADVANCE', amount: 30000 } });
        await expect(service.decide('park', 'acc', 'a1', { action: 'APPROVE' })).rejects.toThrow(/Предоплата — не больше 23\s300 ₸/);
        expect(tx.exchangeFuelIssue.create).not.toHaveBeenCalled();
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
