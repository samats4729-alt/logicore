import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

/**
 * Вход водителя, которого завели дважды.
 *
 * Раньше одного и того же человека заводили заново под каждым ИП, и у одного
 * телефона бывало две записи. Вход брал из них любую: водитель мог не
 * увидеть рейс, назначенный на соседнюю запись.
 *
 * Теперь в общем списке водителей двойники показаны одной строкой — записью,
 * на которую назначали последний рейс, и новые рейсы идут на неё. Вход
 * открывает её же. Если запись одна — всё как раньше.
 */

const ПАРОЛЬ = 'secret-1';

async function makeService(записи: any[], рейсы: any[] = []) {
    const hash = await bcrypt.hash(ПАРОЛЬ, 4);
    const кандидаты = записи.map((з) => ({
        company: null,
        email: null,
        role: 'DRIVER',
        companyId: 'ип',
        passwordHash: hash,
        ...з,
    }));
    const prisma: any = {
        user: { findMany: jest.fn().mockResolvedValue(кандидаты) },
        order: { groupBy: jest.fn().mockResolvedValue(рейсы) },
        session: { create: jest.fn(), deleteMany: jest.fn() },
    };
    const redis: any = { getSession: jest.fn(), setSession: jest.fn() };
    const jwt: any = { sign: jest.fn(() => 'token') };
    const service = new AuthService(prisma, jwt, {} as any, redis, {} as any, {} as any, {} as any);
    return { service, prisma };
}

describe('Вход водителя по телефону', () => {
    it('одна запись — как раньше', async () => {
        const { service, prisma } = await makeService([{ id: 'в-1', updatedAt: new Date('2026-09-01') }]);

        const { user } = await service.loginDriver('+77001112233', ПАРОЛЬ, 'телефон');

        expect(user.id).toBe('в-1');
        // Рейсы смотрим, только когда есть из чего выбирать.
        expect(prisma.order.groupBy).not.toHaveBeenCalled();
    });

    it('двойник — открывается запись с последним рейсом', async () => {
        const { service } = await makeService(
            [
                { id: 'старая', updatedAt: new Date('2026-09-15') },
                { id: 'рабочая', updatedAt: new Date('2026-09-01') },
            ],
            [
                { driverId: 'старая', _max: { createdAt: new Date('2026-08-01') } },
                { driverId: 'рабочая', _max: { createdAt: new Date('2026-09-20') } },
            ],
        );

        const { user } = await service.loginDriver('+77001112233', ПАРОЛЬ, 'телефон');

        expect(user.id).toBe('рабочая');
    });

    it('к записи с последним рейсом пароль не подошёл — берём ту, к которой подошёл', async () => {
        const { service } = await makeService(
            [
                { id: 'с-паролем', updatedAt: new Date('2026-09-01') },
                { id: 'без-пароля', updatedAt: new Date('2026-09-15'), passwordHash: null },
            ],
            [{ driverId: 'без-пароля', _max: { createdAt: new Date('2026-09-20') } }],
        );

        const { user } = await service.loginDriver('+77001112233', ПАРОЛЬ, 'телефон');

        expect(user.id).toBe('с-паролем');
    });

    it('неверный пароль — отказ, как раньше', async () => {
        const { service } = await makeService([{ id: 'в-1', updatedAt: new Date('2026-09-01') }]);

        await expect(service.loginDriver('+77001112233', 'не тот', 'телефон'))
            .rejects.toThrow(new UnauthorizedException('Неверный телефон или пароль'));
    });

    it('пароля не выдавали ни одной записи — подсказываем, кто его выдаёт', async () => {
        const { service } = await makeService([{ id: 'в-1', updatedAt: new Date('2026-09-01'), passwordHash: null }]);

        await expect(service.loginDriver('+77001112233', ПАРОЛЬ, 'телефон'))
            .rejects.toThrow('Пароль выдаёт ваша компания');
    });
});
