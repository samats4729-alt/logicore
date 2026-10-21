import { expiringDocuments } from './document-expiry';

/** Удостоверения водителей с истекающим сроком — для «Требуют внимания» (R5). */
describe('сроки удостоверений водителей', () => {
    const NOW = new Date('2026-10-21T05:00:00Z');
    function prismaWith(opts: { isPark?: boolean; drivers?: any[]; parkDrivers?: any[] }) {
        return {
            company: {
                findMany: jest.fn().mockResolvedValue([{ id: 'c-1', name: 'Мы' }, { id: 'ext-1', name: 'ИП Перевозчик' }]),
                findUnique: jest.fn().mockResolvedValue({ isPark: !!opts.isPark }),
            },
            user: { findMany: jest.fn().mockResolvedValue(opts.drivers ?? []) },
            exchangeDriver: { findMany: jest.fn().mockResolvedValue(opts.parkDrivers ?? []) },
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
});
