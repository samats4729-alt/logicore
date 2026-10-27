import { expiringDocuments, vehicleDocDates } from './document-expiry';

/** Удостоверения водителей с истекающим сроком — для «Требуют внимания» (R5). */
describe('сроки удостоверений водителей', () => {
    const NOW = new Date('2026-10-21T05:00:00Z');
    function prismaWith(opts: { isPark?: boolean; drivers?: any[]; parkDrivers?: any[]; vehicles?: any[] }) {
        return {
            company: {
                findMany: jest.fn().mockResolvedValue([{ id: 'c-1', name: 'Мы' }, { id: 'ext-1', name: 'ИП Перевозчик' }]),
                findUnique: jest.fn().mockResolvedValue({ isPark: !!opts.isPark }),
            },
            user: { findMany: jest.fn().mockResolvedValue(opts.drivers ?? []) },
            exchangeDriver: { findMany: jest.fn().mockResolvedValue(opts.parkDrivers ?? []) },
            vehicle: { findMany: jest.fn().mockResolvedValue(opts.vehicles ?? []) },
        } as any;
    }

    it('водители своей базы: ищет на 30 дней вперёд, просроченные помечены', async () => {
        const prisma = prismaWith({
            drivers: [
                { id: 'd1', lastName: 'Иванов', firstName: 'Иван', docExpiresAt: new Date('2026-10-01T00:00:00Z') },
                { id: 'd2', lastName: 'Петров', firstName: 'Пётр', docExpiresAt: new Date('2026-11-10T00:00:00Z') },
            ],
        });
        const rows = await expiringDocuments(prisma, 'c-1', NOW);

        expect(rows.map((r) => [r.name, r.expired])).toEqual([['Иванов Иван', true], ['Петров Пётр', false]]);
        const where = prisma.user.findMany.mock.calls[0][0].where;
        expect(where.docExpiresAt.lte.toISOString()).toBe('2026-11-20T05:00:00.000Z');
        // База — сама компания и её перевозчики из справочника, плюс нештатные водители.
        expect(where.OR).toEqual([{ companyId: { in: ['c-1', 'ext-1'] } }, { baseCompanyId: 'c-1' }]);
        expect(prisma.exchangeDriver.findMany).not.toHaveBeenCalled();
    });

    it('парк видит ещё и своих водителей с биржи — со ссылкой на карточку', async () => {
        const prisma = prismaWith({
            isPark: true,
            parkDrivers: [{ id: 'x1', lastName: 'Сериков', firstName: 'Ерлан', idExpiresAt: new Date('2026-11-01T00:00:00Z') }],
        });
        const rows = await expiringDocuments(prisma, 'c-1', NOW);

        expect(rows).toEqual([expect.objectContaining({ kind: 'PARK_DRIVER', href: '/company/park/drivers/x1', expired: false })]);
    });

    it('свои машины: страховка и техосмотр — отдельными строками, только то, что в пределах 30 дней', async () => {
        const prisma = prismaWith({
            vehicles: [{
                id: 'v1', plate: '123ABC01', model: 'Volvo FH',
                insuranceUntil: new Date('2026-10-15T00:00:00Z'),
                inspectionUntil: new Date('2027-03-01T00:00:00Z'),
            }, {
                id: 'v2', plate: '777KZ02', model: 'MAN',
                insuranceUntil: null,
                inspectionUntil: new Date('2026-11-05T00:00:00Z'),
            }],
        });
        const rows = await expiringDocuments(prisma, 'c-1', NOW);

        expect(rows.map((r) => [r.kind, r.name, r.expired])).toEqual([
            ['VEHICLE_INSURANCE', '123ABC01 · Volvo FH', true],
            ['VEHICLE_INSPECTION', '777KZ02 · MAN', false],
        ]);
        expect(rows[0].href).toBe('/company/vehicles');
        expect(prisma.vehicle.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ companyId: 'c-1', isActive: true }));
    });
});

describe('сроки машины из формы', () => {
    it('не прислали — не трогаем, пусто — стираем, дата — полночь по UTC', () => {
        expect(vehicleDocDates({})).toEqual({ insuranceUntil: undefined, inspectionUntil: undefined });
        expect(vehicleDocDates({ insuranceUntil: '', inspectionUntil: null })).toEqual({ insuranceUntil: null, inspectionUntil: null });
        expect(vehicleDocDates({ insuranceUntil: '2026-12-31' }).insuranceUntil!.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    });
});
