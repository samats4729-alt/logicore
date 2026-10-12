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
        },
        $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const drivers: any = { assertPark: jest.fn() };
    // Топливо по рейсам: по умолчанию ничего не выдавали и чеков нет.
    const fuel: any = { totals: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { issued: 0, receipts: 0 }]))) };
    const settlement: any = { platformPct: jest.fn().mockResolvedValue(5) };
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
        expect(data.items.create[0]).toMatchObject({ orderId: 'o-1', net: 75240, commissionPct: 5, ipnPct: 10 });
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
        const { buffer, count } = await service.exportFor1C('park-1', ['p-1']);
        expect(count).toBe(1);
        const book = XLSX.read(buffer, { type: 'buffer' });
        expect(book.SheetNames).toEqual(['Реестр выплат', 'По рейсам']);
        const row = XLSX.utils.sheet_to_json<any>(book.Sheets['Реестр выплат'])[0];
        expect(row).toMatchObject({ 'ФИО': 'Сериков Серик', 'ИИН': '900101300123', 'К перечислению': 75240 });
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
        await expect(service.markPaid('park-1', 'p-1', 'user-1')).rejects.toThrow(/уже проведена/);
    });

    it('ставки — от 0 до 100 %', async () => {
        const { service } = build();
        await expect(service.setRates('park-1', 'user-1', { ...RATES, ipnPct: 150 })).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('Выплата водителю парка: рейс по расчёту «на руки» (12.10.2026)', () => {
    const SETTLEMENT = {
        driverTotal: 400000, deductionApplied: true,
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
});
