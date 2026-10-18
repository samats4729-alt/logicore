import * as XLSX from 'xlsx';
import { ExchangeParkRegistryService } from './park-registry.service';

const RATES = { opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5, platformPct: 5, parkPct: 5, deductionMrp: 30, mrp: 4325 };

function settlementRow(overrides: Record<string, any> = {}) {
    return {
        orderId: 'o-1', taxMonth: '2026-10', driverTotal: 400000, fuelEstimate: 120000, deductionAmount: 129750, rates: RATES,
        customerPrice: 508437.93, vat: 0, parkFee: 18497.04, platformFee: 17616.23, preliminary: true, createdAt: new Date(),
        driver: { id: 'd-1', lastName: 'Сериков', firstName: 'Серик', middleName: null, iin: '900101300123' },
        order: {
            orderNumber: '000000013', status: 'COMPLETED', completedAt: new Date('2026-10-12T10:00:00Z'),
            routePoints: [
                { pointType: 'PICKUP', expectedDate: new Date('2026-10-10T03:00:00Z'), location: { city: 'Алматы', cityRecord: null } },
                { pointType: 'DELIVERY', expectedDate: null, location: { city: 'Астана', cityRecord: null } },
            ],
            driverPayoutItem: null,
            _count: { exchangeFuelReceipts: 1 },
        },
        ...overrides,
    };
}

function build(rows: any[] = [settlementRow()], confirmed = false) {
    const prisma: any = {
        exchangeTripSettlement: { findMany: jest.fn().mockResolvedValue(rows) },
        parkPayoutRates: { findUnique: jest.fn().mockResolvedValue(confirmed ? { ratesConfirmedAt: new Date() } : null) },
    };
    const drivers: any = { assertPark: jest.fn() };
    const fuel: any = { totals: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { issued: 120000, receipts: 120000 }]))) };
    return { service: new ExchangeParkRegistryService(prisma, drivers, fuel), prisma };
}

describe('Реестр бухгалтера парка за месяц', () => {
    it('рейс месяца: начислено, удержано, в бюджет, к перечислению; отменённые не в счёт', async () => {
        const { service, prisma } = build();
        const r = await service.month('park-1', '2026-10');
        expect(prisma.exchangeTripSettlement.findMany.mock.calls[0][0].where).toMatchObject({
            parkCompanyId: 'park-1', taxMonth: '2026-10', order: { status: { not: 'CANCELLED' } },
        });
        expect(r.lines[0]).toMatchObject({
            orderNumber: '000000013', route: 'Алматы → Астана', gross: 337152.78,
            opv: 33715.28, vosms: 6743.06, ipn: 16694.44, withheld: 57152.78, so: 15171.88, toBudget: 72324.66,
            toPay: 280000, paid: 0, payStatus: 'TO_REQUEST', fixed: false, preliminary: true, fuelReceiptsPending: 1,
        });
        expect(r.preliminary).toBe(true);
    });

    it('выплату провели — суммы из неё, «выплачено» заполнено', async () => {
        const item = { gross: 337152.78, opv: 33715.28, vosms: 6743.06, ipn: 16694.44, so: 15171.88, net: 280000, toPay: 280000, fuelIssued: 120000, fuelReceipts: 120000, payout: { status: 'PAID', paidAt: new Date() } };
        const { service } = build([settlementRow({ order: { ...settlementRow().order, driverPayoutItem: item } })], true);
        const r = await service.month('park-1', '2026-10');
        expect(r.lines[0]).toMatchObject({ paid: 280000, payStatus: 'PAID', fixed: true });
    });

    it('итоги по водителю и по месяцу — до тиына', async () => {
        const { service } = build([settlementRow(), settlementRow({ orderId: 'o-2', driverTotal: 123456.78, deductionAmount: 0 })]);
        const r = await service.month('park-1', '2026-10');
        expect(r.drivers).toHaveLength(1);
        expect(r.drivers[0].trips).toBe(2);
        const t = (v: number) => Math.round(v * 100);
        expect(t(r.totals.toBudget)).toBe(t(r.lines[0].toBudget) + t(r.lines[1].toBudget));
    });

    it('итог месяца парка: прибыль = комиссия + экономия топлива по довезённым рейсам (схема шефа)', async () => {
        const { service } = build([settlementRow({ scheme: 2, fuelEstimate: 125000, parkFee: 5237.25, workNet: 65700, gross: 73000, opv: 7300, vosms: 1460, ipn: 0, so: 3285 })]);
        const r = await service.month('park-1', '2026-10');
        // Расчёт 125 000, по чекам 120 000 — сэкономили 5 000.
        expect(r.lines[0]).toMatchObject({ fuelDiff: 5000, parkProfit: 10237.25 });
        expect(r.totals).toMatchObject({ fuelDiff: 5000, parkProfit: 10237.25 });
    });

    it('рейс ещё идёт — разницу по топливу не считаем', async () => {
        const { service } = build([settlementRow({ scheme: 2, fuelEstimate: 125000, order: { ...settlementRow().order, status: 'IN_TRANSIT' } })]);
        expect((await service.month('park-1', '2026-10')).lines[0].fuelDiff).toBe(0);
    });

    it('месяц с ошибкой — понятный отказ', async () => {
        const { service } = build();
        await expect(service.month('park-1', '2026-13')).rejects.toThrow(/ГГГГ-ММ/);
    });

    it('Excel: рейсы, итоги по водителям и лист «Внимание», пока расчёт предварительный', async () => {
        const { service } = build();
        const { buffer } = await service.export('park-1', '2026-10');
        const book = XLSX.read(buffer, { type: 'buffer' });
        expect(book.SheetNames).toEqual(['Рейсы', 'По водителям', 'Итог месяца', 'Внимание']);
        const row = XLSX.utils.sheet_to_json<any>(book.Sheets['Рейсы'])[0];
        expect(row).toMatchObject({ 'Заявка': '000000013', 'В бюджет всего': 72324.66, 'Расчёт': 'предварительный' });
    });

    it('бухгалтер подтвердил и рейсы посчитаны после — листа «Внимание» нет', async () => {
        const { service } = build([settlementRow({ preliminary: false })], true);
        const book = XLSX.read((await service.export('park-1', '2026-10')).buffer, { type: 'buffer' });
        expect(book.SheetNames).toEqual(['Рейсы', 'По водителям', 'Итог месяца']);
    });
});
