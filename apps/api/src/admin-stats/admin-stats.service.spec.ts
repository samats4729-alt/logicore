import { AdminStatsService } from './admin-stats.service';

describe('AdminStatsService.getAdSignups', () => {
    function build() {
        const count = jest.fn(async ({ where }: any) => {
            if (where.company) return 1;
            if (where.companyId) return 2;
            if (where.createdAt) return 3;
            return 5;
        });
        const findMany = jest.fn(async () => [{ id: 'u1', firstName: 'Айдос' }]);
        const service = new AdminStatsService({ user: { count, findMany } } as any);
        return { service, count, findMany };
    }

    it('считает только тех, кто пришёл с рекламы Google', async () => {
        const { service, count, findMany } = build();
        await service.getAdSignups();

        for (const [args] of count.mock.calls) {
            expect(args.where.signupSource).toBe('GOOGLE_ADS');
        }
        expect((findMany.mock.calls as any[][])[0][0].where.signupSource).toBe('GOOGLE_ADS');
    });

    it('отдаёт счётчики и список: всего, за неделю, с организацией, подтверждённые', async () => {
        const { service } = build();
        const result = await service.getAdSignups();

        expect(result).toEqual({
            total: 5,
            last7Days: 3,
            withCompany: 2,
            verified: 1,
            rows: [{ id: 'u1', firstName: 'Айдос' }],
        });
    });

    it('новые регистрации идут первыми, пароль в ответ не попадает', async () => {
        const { service, findMany } = build();
        await service.getAdSignups();

        const args = (findMany.mock.calls as any[][])[0][0];
        expect(args.orderBy).toEqual({ createdAt: 'desc' });
        expect(args.select.passwordHash).toBeUndefined();
    });
});
