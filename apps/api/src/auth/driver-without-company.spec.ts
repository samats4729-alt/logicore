import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * «Без организации — только водителю». Водитель биржи ведёт рейс через те же
 * адреса, что и водитель компании, а организации у него нет. Остальным без
 * организации туда нельзя: у пустой компании проверка участия в заявке
 * отвечает неправильно, и только что зарегистрированный руководитель
 * получил бы чужие заявки.
 */
describe('JwtAuthGuard: без организации — только водителю', () => {
    const contextFor = (user: any) => ({
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
        getHandler: () => undefined,
        getClass: () => undefined,
    }) as any;

    const guardWith = (metadata: unknown) => {
        const reflector = { getAllAndOverride: jest.fn().mockReturnValue(metadata) } as unknown as Reflector;
        const guard = new JwtAuthGuard(reflector);
        // Проверку самого токена здесь не проверяем — её делает passport.
        jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockResolvedValue(true);
        return guard;
    };

    afterEach(() => jest.restoreAllMocks());

    it('водитель без организации проходит', async () => {
        await expect(guardWith('DRIVER').canActivate(contextFor({ role: 'DRIVER', companyId: null }))).resolves.toBe(true);
    });

    it('руководитель без организации — нет', async () => {
        await expect(guardWith('DRIVER').canActivate(contextFor({ role: 'COMPANY_ADMIN', companyId: null })))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('с организацией — как раньше, проходит любой', async () => {
        await expect(guardWith('DRIVER').canActivate(contextFor({ role: 'LOGISTICIAN', companyId: 'c-1' }))).resolves.toBe(true);
    });
});
