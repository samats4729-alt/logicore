import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ExchangePayoutsService } from './payouts.service';
import { calcPayout, normalizeIban, sumPayouts } from './payout-calc';

const RATES = { commissionPct: 5, opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5 };

describe('Выплата водителю парка: расчёт', () => {
    it('100 000 ₸ за рейс: комиссия 5 000, ОПВ 9 500, ВОСМС 1 900, ИПН 8 360 — на руки 75 240', () => {
        expect(calcPayout(100000, RATES)).toEqual({
            gross: 100000, commission: 5000, opv: 9500, vosms: 1900, ipn: 8360, net: 75240, so: 4275,
        });
    });

    it('до тиынов, и итог — сумма строк', () => {
        const a = calcPayout(123457, RATES);
        expect(Number.isInteger(a.net * 100)).toBe(true);
        expect(sumPayouts([a, a]).net).toBeCloseTo(a.net * 2, 2);
    });

    it('IBAN: KZ и 18 знаков, пробелы не в счёт', () => {
        expect(normalizeIban('kz12 3456 7890 1234 5678')).toBe('KZ123456789012345678');
        expect(normalizeIban('1234')).toBeNull();
    });
});

function build(driver: any = { id: 'd-1', userId: 'u-1', kind: 'PARK', parkCompanyId: 'park-1', payoutIban: 'KZ123456789012345678', payoutBank: 'Kaspi', park: { name: 'Парк А' } }) {
    const tx: any = {
        driverPayout: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        driverPayoutItem: { deleteMany: jest.fn() },
    };
    const prisma: any = {
        exchangeDriver: { findUnique: jest.fn().mockResolvedValue(driver), update: jest.fn() },
        parkPayoutRates: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
        driverPayoutItem: { count: jest.fn().mockResolvedValue(0) },
        order: {
            findMany: jest.fn().mockResolvedValue([
                { id: 'o-1', orderNumber: '7A-1', driverCost: 100000, completedAt: new Date(), routePoints: [] },
                { id: 'o-2', orderNumber: '7A-2', driverCost: 200000, completedAt: new Date(), routePoints: [] },
            ]),
        },
        driverPayout: {
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn(async (args: any) => ({ id: 'p-1', net: args.data.net })),
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            aggregate: jest.fn().mockResolvedValue({ _sum: { opv: null } }),
        },
        $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const drivers: any = { assertPark: jest.fn() };
    // Топливо по рейсам: по умолчанию ничего не выдавали и чеков нет.
    const fuel: any = { totals: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { issued: 0, receipts: 0 }]))) };
    const settlement: any = { platformPct: jest.fn().mockResolvedValue(5), parkSettings: jest.fn().mockResolvedValue({ fuelPerKm: 105 }) };
    return { service: new ExchangePayoutsService(prisma, drivers, fuel, settlement), prisma, tx, fuel };
}

describe('Выплата водителю парка: запрос', () => {
    it('за все довезённые и неоплаченные рейсы его парка — со ставками на момент запроса', async () => {
        const { service, prisma } = build();
        const result = await service.request('u-1');
        expect(prisma.order.findMany.mock.calls[0][0].where).toMatchObject({
            driverId: 'u-1', partnerId: 'park-1', status: 'COMPLETED', driverPayoutItem: null,
        });
        const data = prisma.driverPayout.create.mock.calls[0][0].data;
        expect(data.items.create).toHaveLength(2);
        // Парк без своих настроек — комиссия по умолчанию 10 % (задача 15.10.2026).
        expect(data.items.create[0]).toMatchObject({ orderId: 'o-1', net: 71280, commissionPct: 10, ipnPct: 10 });
        expect(data).toMatchObject({ gross: 300000, iban: 'KZ123456789012345678' });
        expect(result.trips).toBe(2);
    });

    it('без счёта — сначала IBAN', async () => {
        const { service } = build({ id: 'd-1', userId: 'u-1', kind: 'PARK', parkCompanyId: 'park-1', payoutIban: null });
        await expect(service.request('u-1')).rejects.toThrow(/IBAN/);
    });

    it('прошлая выплата не завершена — вторую не запросить', async () => {
        const { service, prisma } = build();
        prisma.driverPayout.count.mockResolvedValue(1);
        await expect(service.request('u-1')).rejects.toThrow(/Прошлая выплата/);
    });

    it('нечего выплачивать — так и сказано', async () => {
        const { service, prisma } = build();
        prisma.order.findMany.mockResolvedValue([]);
        await expect(service.request('u-1')).rejects.toThrow(/нечего выплачивать/);
    });

    it('два нажатия разом — второй упирается в «рейс оплачивается один раз»', async () => {
        const { service, prisma } = build();
        prisma.driverPayout.create.mockRejectedValue({ code: 'P2002' });
        await expect(service.request('u-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('водителю с ИП выплат через приложение нет — платит заказчик', async () => {
        const { service } = build({ id: 'd-1', userId: 'u-1', kind: 'IP', parkCompanyId: null });
        await expect(service.earnings('u-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('Выплата водителю парка: парк', () => {
    it('реестр для 1С — Excel с двумя листами; выгруженные — «в 1С»', async () => {
        const { service, prisma } = build();
        prisma.driverPayout.findMany.mockResolvedValue([{
            id: 'p-1', status: 'REQUESTED', gross: 100000, commission: 5000, opv: 9500, vosms: 1900, ipn: 8360, net: 75240, so: 4275,
            iban: 'KZ123456789012345678', bank: 'Kaspi', requestedAt: new Date(),
            driver: { lastName: 'Сериков', firstName: 'Серик', middleName: null, iin: '900101300123' },
            items: [{ gross: 100000, commission: 5000, opv: 9500, vosms: 1900, ipn: 8360, net: 75240, order: { orderNumber: '7A-1', completedAt: new Date(), routePoints: [] } }],
        }]);
        const { buffer, count } = await service.exportFor1C('park-1', ['p-1'], true);
        expect(count).toBe(1);
        const book = XLSX.read(buffer, { type: 'buffer' });
        expect(book.SheetNames).toEqual(['Реестр выплат', 'По рейсам']);
        const row = XLSX.utils.sheet_to_json<any>(book.Sheets['Реестр выплат'])[0];
        expect(row).toMatchObject({ 'ФИО': 'Сериков Серик', 'ИИН': '900101300123', 'К перечислению': 75240, 'В бюджет (ОПВ+ВОСМС+ИПН+СО)': 24035, 'Расчёт': 'предварительный' });
        expect(prisma.driverPayout.updateMany.mock.calls[0][0]).toMatchObject({ where: { status: 'REQUESTED' }, data: { status: 'EXPORTED' } });
    });

    it('отклонить — с причиной, рейсы снова доступны к выплате', async () => {
        const { service, tx } = build();
        await service.reject('park-1', 'p-1', 'user-1', ' неверный IBAN ');
        expect(tx.driverPayout.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'REJECTED', rejectReason: 'неверный IBAN' });
        expect(tx.driverPayoutItem.deleteMany).toHaveBeenCalledWith({ where: { payoutId: 'p-1' } });
    });

    it('выплаченную второй раз не провести', async () => {
        const { service, prisma } = build();
        prisma.driverPayout.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.markPaid('park-1', 'p-1', 'user-1', true)).rejects.toThrow(/уже проведена/);
    });

    describe('расчёт предварительный, пока бухгалтер парка не подтвердил (15.10.2026)', () => {
        it('без согласия — ни выгрузки в 1С, ни «выплачено»', async () => {
            const { service, prisma } = build();
            await expect(service.exportFor1C('park-1', ['p-1'])).rejects.toThrow(/предварительный/);
            await expect(service.markPaid('park-1', 'p-1', 'user-1')).rejects.toThrow(/предварительный/);
            expect(prisma.driverPayout.updateMany).not.toHaveBeenCalled();
        });

        it('бухгалтер подтвердил, рейсы посчитаны после — согласие не нужно', async () => {
            const { service, prisma } = build();
            prisma.parkPayoutRates.findUnique.mockResolvedValue({ ratesConfirmedAt: new Date() });
            await service.markPaid('park-1', 'p-1', 'user-1');
            expect(prisma.driverPayout.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'PAID' });
        });

        it('подтвердил, но в выплате рейс, посчитанный до подтверждения, — снова нужно согласие', async () => {
            const { service, prisma } = build();
            prisma.parkPayoutRates.findUnique.mockResolvedValue({ ratesConfirmedAt: new Date() });
            prisma.driverPayoutItem.count.mockResolvedValue(1);
            await expect(service.markPaid('park-1', 'p-1', 'user-1')).rejects.toThrow(/предварительный/);
        });

        it('бухгалтер поменял ставку — подтверждение снимается', async () => {
            const { service, prisma } = build();
            prisma.parkPayoutRates.findUnique.mockResolvedValue({ ...RATES, ratesConfirmedAt: new Date() });
            await service.setRates('park-1', 'user-1', { ...RATES, commissionPct: 10 });
            expect(prisma.parkPayoutRates.upsert.mock.calls[0][0].update).toMatchObject({ ratesConfirmedAt: null });
        });

        it('поменял топливо или сезон — подтверждение остаётся: это не налоги', async () => {
            const { service, prisma } = build();
            prisma.parkPayoutRates.findUnique.mockResolvedValue({ ...RATES, fuelConsumption: 30, fuelSeason: 'SUMMER', ratesConfirmedAt: new Date() });
            await service.setRates('park-1', 'user-1', { ...RATES, fuelConsumption: 32, fuelSeason: 'WINTER', fuelPriceWinter: 400 });
            expect(prisma.parkPayoutRates.upsert.mock.calls[0][0].update).not.toHaveProperty('ratesConfirmedAt');
        });

        it('сохранил те же ставки — подтверждение остаётся', async () => {
            const { service, prisma } = build();
            prisma.parkPayoutRates.findUnique.mockResolvedValue({ ...RATES, ratesConfirmedAt: new Date() });
            await service.setRates('park-1', 'user-1', { ...RATES });
            expect(prisma.parkPayoutRates.upsert.mock.calls[0][0].update).not.toHaveProperty('ratesConfirmedAt');
        });

        it('подтвердить — отметка с датой и кто', async () => {
            const { service, prisma } = build();
            await service.confirmRates('park-1', 'user-1', true);
            expect(prisma.parkPayoutRates.upsert.mock.calls[0][0].update).toMatchObject({ ratesConfirmedById: 'user-1' });
            expect(prisma.parkPayoutRates.upsert.mock.calls[0][0].update.ratesConfirmedAt).toBeInstanceOf(Date);
        });
    });

    it('ставки — от 0 до 100 %', async () => {
        const { service } = build();
        await expect(service.setRates('park-1', 'user-1', { ...RATES, ipnPct: 150 })).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('Выплата водителю парка: рейс по расчёту «на руки» (12.10.2026)', () => {
    const SETTLEMENT = {
        driverTotal: 400000, deductionApplied: true, deductionAmount: 129750,
        rates: { opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5, platformPct: 5, parkPct: 5, deductionMrp: 30, mrp: 4325 },
    };

    it('договорились на 400 000, парк дал на топливо 120 000 (чеков на 100 000) — перечислить 280 000, налоги с 300 000', async () => {
        const { service, prisma, fuel } = build();
        prisma.order.findMany.mockResolvedValue([
            { id: 'o-1', orderNumber: '000000013', driverCost: 508437.93, completedAt: new Date(), routePoints: [], exchangeSettlement: SETTLEMENT },
        ]);
        fuel.totals.mockResolvedValue(new Map([['o-1', { issued: 120000, receipts: 100000 }]]));
        prisma.driverPayout.create.mockImplementation(async (args: any) => ({ id: 'p-1', net: args.data.net, toPay: args.data.toPay }));
        const result = await service.request('u-1');
        expect(result.net).toBe(280000);
        const data = prisma.driverPayout.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ toPay: 280000, fuelIssued: 120000, commission: 0, net: 300000 });
        expect(data.items.create[0]).toMatchObject({
            orderId: 'o-1', driverTotal: 400000, fuelIssued: 120000, fuelReceipts: 100000, toPay: 280000, net: 300000, commissionPct: 5,
        });
    });

    it('схема шефа: на руки как договорились, налоги из расчёта рейса; дали на топливо без чека — вычитается', async () => {
        const { service, prisma, fuel } = build();
        prisma.order.findMany.mockResolvedValue([{
            id: 'o-2', orderNumber: '000000030', driverCost: 115219.5, completedAt: new Date(), routePoints: [],
            exchangeSettlement: {
                scheme: 2, driverTotal: 65700, workNet: 65700, gross: 73000, opv: 7300, vosms: 1460, ipn: 0, so: 3285,
                deductionAmount: 65700, preliminary: true,
                rates: { opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5, platformPct: 5, parkPct: 10, deductionMrp: 30, mrp: 4325 },
            },
        }]);
        fuel.totals.mockResolvedValue(new Map([['o-2', { issued: 27000, receipts: 25000 }]]));
        prisma.driverPayout.create.mockImplementation(async (args: any) => ({ id: 'p-2', net: args.data.net, toPay: args.data.toPay }));
        await service.request('u-1');
        expect(prisma.driverPayout.create.mock.calls[0][0].data.items.create[0]).toMatchObject({
            orderId: 'o-2', gross: 73000, opv: 7300, vosms: 1460, ipn: 0, so: 3285, net: 65700, toPay: 63700, fuelIssued: 27000, fuelReceipts: 25000,
        });
    });

    it('в приложении «к выплате» — сколько перечислят, а не доход за работу', async () => {
        const { service, prisma, fuel } = build();
        prisma.order.findMany.mockResolvedValue([
            { id: 'o-1', orderNumber: '000000013', driverCost: 508437.93, completedAt: new Date(), routePoints: [], exchangeSettlement: SETTLEMENT },
        ]);
        fuel.totals.mockResolvedValue(new Map([['o-1', { issued: 120000, receipts: 120000 }]]));
        const e = await service.earnings('u-1');
        expect(e.trips[0]).toMatchObject({ net: 280000, workNet: 280000, driverTotal: 400000, fuelIssued: 120000 });
        expect(e.available.net).toBe(280000);
    });

    it('водитель видит, сколько ОПВ уже ушло на его пенсионный счёт (Q14)', async () => {
        const { service, prisma } = build();
        prisma.order.findMany.mockResolvedValue([]);
        prisma.driverPayout.aggregate
            .mockResolvedValueOnce({ _sum: { opv: 33000 } })
            .mockResolvedValueOnce({ _sum: { opv: 7300 } });
        const e = await service.earnings('u-1');
        expect(e.opvSaved).toMatchObject({ total: 33000, thisYear: 7300 });
        // Только выплаченное: пока выплата не прошла, взнос не перечислен.
        expect(prisma.driverPayout.aggregate.mock.calls[0][0].where).toMatchObject({ status: 'PAID' });
    });

    it('пенсионные по рейсам: итог растёт с каждым довезённым рейсом, видно, что уже перечислено и что прибавится (шеф, 27.10.2026)', async () => {
        const { service, prisma } = build();
        const trip = (id: string, day: string, extra: any = {}) => ({ id, orderNumber: id, driverCost: 100000, completedAt: new Date(`2026-10-${day}T10:00:00Z`), routePoints: [], ...extra });
        prisma.driverPayoutItem.findMany = jest.fn().mockResolvedValue([
            { opv: 7300, payout: { status: 'PAID' }, order: trip('o-1', '01') },
            { opv: 9000, payout: { status: 'REQUESTED' }, order: trip('o-2', '05') },
        ]);
        prisma.order.findMany.mockImplementation(async ({ where }: any) => (where.status === 'COMPLETED'
            // Довезён, выплату ещё не просили: ОПВ — из расчёта рейса.
            ? [trip('o-3', '10', { exchangeSettlement: {
                scheme: 2, driverTotal: 246600, workNet: 246600, gross: 274000, opv: 27400, vosms: 5480, ipn: 0, so: 12330, deductionAmount: 0,
                rates: { opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5, platformPct: 5, parkPct: 10, deductionMrp: 30, mrp: 4325 },
            } })]
            // В пути — прибавится после рейса.
            : [{ exchangeSettlement: { opv: 12000 } }]));
        const p = await service.pension('u-1');
        expect(p).toMatchObject({ opvPct: 10, total: 43700, paid: 7300, waiting: 36400, upcoming: 12000 });
        // Новые сверху; у каждого — прибавка и сколько стало после рейса.
        expect(p.trips.map((t) => [t.orderId, t.opv, t.total, t.paid])).toEqual([
            ['o-3', 27400, 43700, false],
            ['o-2', 9000, 16300, false],
            ['o-1', 7300, 7300, true],
        ]);
        // Только свои выплаты и свои рейсы через свой парк.
        expect(prisma.driverPayoutItem.findMany.mock.calls[0][0].where).toEqual({ payout: { driverId: 'd-1' } });
        expect(prisma.order.findMany.mock.calls[1][0].where).toMatchObject({ driverId: 'u-1', partnerId: 'park-1' });
    });
});
