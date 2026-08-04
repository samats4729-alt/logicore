import { HttpException } from '@nestjs/common';
import { of } from 'rxjs';
import { SubscriptionInterceptor } from './subscription.interceptor';

/**
 * Ворота подписки: что происходит с запросом неоплатившей компании.
 *
 * Ошибка здесь видна сразу всей платформе. Пустить лишнего — работа
 * бесплатно; закрыть лишнее — водитель посреди рейса не может отметить
 * разгрузку, и виноват в этом не он.
 */
describe('Ворота подписки', () => {
    const context = (user: any, path: string) => ({
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => ({ user, path }) }),
    }) as any;

    const build = (allowed: boolean) => {
        const billing = { isCompanyAllowed: jest.fn().mockResolvedValue(allowed) };
        return {
            interceptor: new SubscriptionInterceptor(billing as any),
            billing,
            next: { handle: () => of('прошло') } as any,
        };
    };

    const run = async (user: any, path: string, allowed = false) => {
        const { interceptor, billing, next } = build(allowed);
        const result = await interceptor.intercept(context(user, path), next)
            .then((o) => o.toPromise())
            .catch((e) => e);
        return { result, billing };
    };

    describe('кого останавливаем', () => {
        it('офисного сотрудника неоплатившей компании — да', async () => {
            const { result } = await run({ companyId: 'c-1', role: 'LOGISTICIAN' }, '/orders');

            expect(result).toBeInstanceOf(HttpException);
            expect((result as HttpException).getStatus()).toBe(402);
        });

        it('в отказе сказано, что делать', async () => {
            const { result } = await run({ companyId: 'c-1', role: 'ACCOUNTANT' }, '/orders');

            expect((result as HttpException).getResponse()).toMatchObject({
                code: 'SUBSCRIPTION_REQUIRED',
            });
        });

        it('водителя — нет: рейс в пути ломать нельзя', async () => {
            // Груз уже едет. Отметки о погрузке и разгрузке не должны
            // упираться в чужую бухгалтерию.
            const { result } = await run({ companyId: 'c-1', role: 'DRIVER' }, '/orders');

            expect(result).toBe('прошло');
        });

        it('грузополучателя — нет', async () => {
            const { result } = await run({ companyId: 'c-1', role: 'RECIPIENT' }, '/orders');

            expect(result).toBe('прошло');
        });

        it('администратора платформы — никогда', async () => {
            // Иначе разбираться с неоплаченной подпиской будет некому.
            const { result } = await run({ companyId: 'c-1', role: 'ADMIN' }, '/orders');

            expect(result).toBe('прошло');
        });

        it('человека без компании — нет', async () => {
            const { result, billing } = await run({ role: 'LOGISTICIAN' }, '/orders');

            expect(result).toBe('прошло');
            expect(billing.isCompanyAllowed).not.toHaveBeenCalled();
        });

        it('оплатившую компанию пропускаем', async () => {
            const { result } = await run({ companyId: 'c-1', role: 'LOGISTICIAN' }, '/orders', true);

            expect(result).toBe('прошло');
        });
    });

    describe('что остаётся доступным без подписки', () => {
        const blocked = { companyId: 'c-1', role: 'COMPANY_ADMIN' };

        it.each([
            ['вход', '/auth/login'],
            ['страница тарифов', '/billing/status'],
            ['свой профиль', '/users/me'],
            ['правка профиля', '/users/profile'],
            ['смена пароля', '/users/password'],
            ['список своих компаний', '/company/my-companies'],
            ['переключение компании', '/company/switch-company'],
        ])('%s', async (_name, path) => {
            const { result, billing } = await run(blocked, path);

            expect(result).toBe('прошло');
            expect(billing.isCompanyAllowed).not.toHaveBeenCalled();
        });

        it('своё фото профиля тоже открыто', async () => {
            const { result } = await run(blocked, '/users/me/avatar');

            expect(result).toBe('прошло');
        });

        it('а вот заявки и финансы — нет', async () => {
            for (const path of ['/orders', '/accounting-documents', '/company/settings']) {
                const { result } = await run(blocked, path);
                expect(result).toBeInstanceOf(HttpException);
            }
        });

        it('похожий адрес не открывается за компанию разрешённого', async () => {
            // Разрешено «/users/me», а не всё, что с него начинается: иначе
            // достаточно было бы завести маршрут вроде /users/message.
            const { result } = await run(blocked, '/users/messages');

            expect(result).toBeInstanceOf(HttpException);
        });

        it('чужое фото профиля закрыто, как и остальное', async () => {
            const { result } = await run(blocked, '/users/u-2/avatar');

            expect(result).toBeInstanceOf(HttpException);
        });
    });

    it('не-HTTP вызов проходит мимо ворот', async () => {
        const { interceptor, next } = build(false);
        const ctx = { getType: () => 'ws' } as any;

        const result = await interceptor.intercept(ctx, next).then((o) => o.toPromise());
        expect(result).toBe('прошло');
    });
});
