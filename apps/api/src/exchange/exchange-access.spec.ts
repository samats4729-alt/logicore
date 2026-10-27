import { ForbiddenException } from '@nestjs/common';
import { ExchangeCompanyAccessGuard, isSoleTrader, SOLE_TRADER_BLOCKED, soleTraderBlock } from './exchange-access';
import { ExchangeStatusController } from './exchange.controller';

/** Пока биржу проверяют, она открыта только компаниям, отмеченным в админке. */
describe('Биржа: доступ по компаниям', () => {
    const prismaWith = (company: { exchangeAccess: boolean; isPark?: boolean } | null) => ({
        company: { findUnique: jest.fn().mockResolvedValue(company) },
    });
    const context = (user: any) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;
    const env = process.env.EXCHANGE_ENABLED;
    beforeEach(() => { process.env.EXCHANGE_ENABLED = 'true'; });
    afterAll(() => { process.env.EXCHANGE_ENABLED = env; });

    it('отмеченная компания проходит в кабинет биржи', async () => {
        const guard = new ExchangeCompanyAccessGuard(prismaWith({ exchangeAccess: true }) as any);
        await expect(guard.canActivate(context({ companyId: 'c-1' }))).resolves.toBe(true);
    });

    it('неотмеченная — нет, и сказано почему', async () => {
        const guard = new ExchangeCompanyAccessGuard(prismaWith({ exchangeAccess: false }) as any);
        await expect(guard.canActivate(context({ companyId: 'c-1' }))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('без компании — нет', async () => {
        const guard = new ExchangeCompanyAccessGuard(prismaWith(null) as any);
        await expect(guard.canActivate(context({}))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('кабинет неотмеченной компании биржу не показывает вовсе', async () => {
        const controller = new ExchangeStatusController(prismaWith({ exchangeAccess: false, isPark: true }) as any);
        await expect(controller.status({ user: { companyId: 'c-1' } })).resolves.toEqual({ enabled: false, isPark: false });
    });

    it('отмеченной — показывает, вместе с отметкой «парк»', async () => {
        const controller = new ExchangeStatusController(prismaWith({ exchangeAccess: true, isPark: true }) as any);
        await expect(controller.status({ user: { companyId: 'c-1' } })).resolves.toEqual({ enabled: true, isPark: true, soleTrader: false });
    });

    it('владельцу платформы раздел виден всегда — даже если у него своя компания без отметки', async () => {
        const controller = new ExchangeStatusController(prismaWith({ exchangeAccess: false }) as any);
        await expect(controller.status({ user: { role: 'ADMIN', companyId: 'c-own' } })).resolves.toEqual({ enabled: true, isPark: false });
    });

    it('общий выключатель выключен — биржи нет ни у кого', async () => {
        process.env.EXCHANGE_ENABLED = '';
        const controller = new ExchangeStatusController(prismaWith({ exchangeAccess: true }) as any);
        await expect(controller.status({ user: { companyId: 'c-1' } })).resolves.toEqual({ enabled: false, isPark: false });
    });
});

/** ИП на бирже — только через парк или приложение водителя (задачи шефа, P7). */
describe('Биржа: ИП не выставляет заявки и не откликается', () => {
    const prismaWith = (company: Record<string, unknown> | null) => ({
        company: { findUnique: jest.fn().mockResolvedValue(company) },
    }) as any;

    it('ИП узнаётся по ИИН вместо БИН', () => {
        expect(isSoleTrader({ bin: '900101300007', name: 'Транс Сервис' })).toBe(true);
    });

    it('и по названию «ИП …»', () => {
        expect(isSoleTrader({ bin: null, name: 'ИП «Береке Транс»' })).toBe(true);
        expect(isSoleTrader({ bin: null, name: 'ИП Ахметов' })).toBe(true);
    });

    it('ТОО с БИН — не ИП', () => {
        // В БИН пятая цифра — вид организации (4–6), дня рождения 41 не бывает.
        expect(isSoleTrader({ bin: '150641116666', name: 'ТОО «Алтын Жол»' })).toBe(false);
        expect(isSoleTrader({ bin: null, name: 'Типография' })).toBe(false);
    });

    it('компании-ИП — запрет со словами', async () => {
        await expect(soleTraderBlock(prismaWith({ bin: null, name: 'ИП Ахметов', isPark: false }), 'c-1'))
            .resolves.toBe(SOLE_TRADER_BLOCKED);
    });

    it('парк на ИП работает: именно через парк ИП и выходят на биржу', async () => {
        await expect(soleTraderBlock(prismaWith({ bin: null, name: 'ИП Парк', isPark: true }), 'c-1')).resolves.toBeNull();
    });
});
