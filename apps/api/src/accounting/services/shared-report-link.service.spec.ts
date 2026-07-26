import { SharedReportLinkService, SHARE_LINK_TTL_DAYS } from './shared-report-link.service';

const COMPANY = 'company-1';
const OTHER_COMPANY = 'company-9';
const COUNTERPARTY = 'company-2';
const USER = 'user-1';

const DAY = 24 * 60 * 60 * 1000;

function makeService(links: any[] = []) {
    const rows = [...links];
    const prisma: any = {
        company: {
            findUnique: jest.fn(async ({ where }: any) => (
                where.id === COMPANY ? { name: 'ТОО «Альфа»' }
                    : where.id === COUNTERPARTY ? { name: 'ТОО «Бета»' }
                        : null
            )),
        },
        sharedReportLink: {
            create: jest.fn(async ({ data }: any) => {
                const row = { id: `link-${rows.length + 1}`, token: `token-${rows.length + 1}`, ...data };
                rows.push(row);
                return row;
            }),
            findUnique: jest.fn(async ({ where }: any) => {
                const row = rows.find((r) => (where.token ? r.token === where.token : r.id === where.id));
                if (!row) return null;
                return {
                    ...row,
                    company: { name: 'ТОО «Альфа»' },
                    counterparty: { name: 'ТОО «Бета»' },
                };
            }),
            findMany: jest.fn(async () => rows.map((r) => ({
                ...r,
                counterparty: { id: COUNTERPARTY, name: 'ТОО «Бета»' },
                createdBy: { firstName: 'Тест', lastName: 'Тестов' },
            }))),
            update: jest.fn(async ({ where, data }: any) => {
                const row = rows.find((r) => r.id === where.id);
                Object.assign(row, data.revokedAt ? { revokedAt: data.revokedAt } : {});
                return row;
            }),
        },
    };
    const config: any = { get: () => 'https://app.example.kz' };
    return { service: new SharedReportLinkService(prisma, config), prisma, rows };
}

const activeLink = (overrides: Record<string, unknown> = {}) => ({
    id: 'link-1',
    token: 'token-1',
    companyId: COMPANY,
    counterpartyId: COUNTERPARTY,
    ourRole: 'EXECUTOR',
    expiresAt: new Date(Date.now() + 3 * DAY),
    revokedAt: null,
    ...overrides,
});

describe('Публичная ссылка на отчёт по взаиморасчётам', () => {
    describe('выдача', () => {
        it('живёт семь дней', async () => {
            const { service, rows } = makeService();

            await service.create(COMPANY, USER, { counterpartyId: COUNTERPARTY, ourRole: 'EXECUTOR' });

            const days = (rows[0].expiresAt.getTime() - Date.now()) / DAY;
            expect(Math.round(days)).toBe(SHARE_LINK_TTL_DAYS);
        });

        it('собирает адрес от FRONTEND_URL', async () => {
            const { service } = makeService();

            const link = await service.create(COMPANY, USER, { counterpartyId: COUNTERPARTY, ourRole: 'EXECUTOR' });

            expect(link.shareUrl).toBe('https://app.example.kz/shared/report/token-1');
        });

        it('запоминает, кому отправляли', async () => {
            const { service, rows } = makeService();

            await service.create(COMPANY, USER, {
                counterpartyId: COUNTERPARTY,
                ourRole: 'EXECUTOR',
                sentToEmail: '  buh@beta.kz ',
            });

            expect(rows[0].sentToEmail).toBe('buh@beta.kz');
        });

        it('не выдаёт ссылку на несуществующего контрагента', async () => {
            const { service } = makeService();

            await expect(service.create(COMPANY, USER, { counterpartyId: 'нет-такого', ourRole: 'EXECUTOR' }))
                .rejects.toThrow('Контрагент не найден');
        });
    });

    describe('разбор токена', () => {
        it('действующая ссылка отдаёт стороны и срок', async () => {
            const { service } = makeService([activeLink()]);

            const resolved = await service.resolve('token-1');

            expect(resolved.companyId).toBe(COMPANY);
            expect(resolved.counterpartyName).toBe('ТОО «Бета»');
        });

        it('просроченная не работает', async () => {
            const { service } = makeService([activeLink({ expiresAt: new Date(Date.now() - DAY) })]);

            await expect(service.resolve('token-1')).rejects.toThrow('недействительна');
        });

        it('ссылка, истекающая ровно сейчас, уже не работает', async () => {
            // Часы фиксируем: иначе `Date.now()` успевает уйти вперёд, пока
            // тест доходит до проверки, и граница остаётся непроверенной —
            // тест зеленел бы и при строгом сравнении, и при нестрогом.
            const frozen = new Date('2026-07-26T12:00:00.000Z').getTime();
            const clock = jest.spyOn(Date, 'now').mockReturnValue(frozen);
            try {
                const { service } = makeService([activeLink({ expiresAt: new Date(frozen) })]);

                await expect(service.resolve('token-1')).rejects.toThrow('недействительна');
            } finally {
                clock.mockRestore();
            }
        });

        it('ссылка, истекающая через миллисекунду, ещё работает', async () => {
            const frozen = new Date('2026-07-26T12:00:00.000Z').getTime();
            const clock = jest.spyOn(Date, 'now').mockReturnValue(frozen);
            try {
                const { service } = makeService([activeLink({ expiresAt: new Date(frozen + 1) })]);

                await expect(service.resolve('token-1')).resolves.toMatchObject({ companyId: COMPANY });
            } finally {
                clock.mockRestore();
            }
        });

        it('отозванная не работает, даже если срок не вышел', async () => {
            const { service } = makeService([activeLink({ revokedAt: new Date() })]);

            await expect(service.resolve('token-1')).rejects.toThrow('недействительна');
        });

        it('несуществующая отвечает так же, как отозванная', async () => {
            const { service } = makeService([activeLink()]);

            // По ответу нельзя понять, была ли такая ссылка вообще —
            // иначе токены можно было бы перебирать по разнице ответов.
            await expect(service.resolve('чужой-токен')).rejects.toThrow('недействительна');
        });
    });

    describe('отзыв', () => {
        it('отзывает свою ссылку', async () => {
            const { service, rows } = makeService([activeLink()]);

            await service.revoke(COMPANY, 'link-1');

            expect(rows[0].revokedAt).toBeInstanceOf(Date);
        });

        it('чужую ссылку отозвать нельзя', async () => {
            const { service } = makeService([activeLink()]);

            await expect(service.revoke(OTHER_COMPANY, 'link-1'))
                .rejects.toThrow('выдана другой организацией');
        });

        it('повторный отзыв не меняет время первого', async () => {
            const revokedAt = new Date(Date.now() - DAY);
            const { service } = makeService([activeLink({ revokedAt })]);

            const result = await service.revoke(COMPANY, 'link-1');

            expect(result.revokedAt).toBe(revokedAt);
        });
    });

    describe('список выданных', () => {
        it('помечает действующие, истёкшие и отозванные', async () => {
            const { service } = makeService([
                activeLink({ id: 'link-1', token: 't1' }),
                activeLink({ id: 'link-2', token: 't2', expiresAt: new Date(Date.now() - DAY) }),
                activeLink({ id: 'link-3', token: 't3', revokedAt: new Date() }),
            ]);

            const list = await service.list(COMPANY);

            expect(list.map((l) => l.status)).toEqual(['ACTIVE', 'EXPIRED', 'REVOKED']);
        });
    });

    describe('счётчик просмотров', () => {
        it('сбой счётчика не мешает открыть отчёт', async () => {
            const { service, prisma } = makeService([activeLink()]);
            prisma.sharedReportLink.update.mockRejectedValue(new Error('база недоступна'));

            // Счётчик вспомогательный: отчёт важнее статистики.
            await expect(service.trackView('link-1')).resolves.toBeUndefined();
        });
    });
});
