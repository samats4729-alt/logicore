import { UserRole } from '@prisma/client';
import { CompanyService } from './company.service';

jest.mock('bcryptjs', () => ({ hash: jest.fn(async (п: string) => `хэш:${п}`) }));

/**
 * Руководитель правит сотрудника: роль, почта для входа, новый пароль.
 *
 * Раньше в правку уходило тело запроса целиком, и одним запросом
 * руководитель любой компании делал сотрудника — или себя —
 * администратором всей платформы: роль «ADMIN» без компании. Проверено на
 * стенде: после такой правки вход открывал все компании платформы.
 *
 * Теперь поля — только перечисленные, роль — только из ролей компании. А
 * почту и пароль — то, чего раньше руководителю не хватало, когда сотрудник
 * забыл пароль и письмо на его почту не доходит, — можно задать здесь.
 */

const МЫ = 'c1';

function build(сотрудник: any, занятаПочта: any = null) {
    const prisma: any = {
        user: {
            findFirst: jest.fn(async ({ where }: any) => (where.email ? занятаПочта : { ...сотрудник })),
            count: jest.fn().mockResolvedValue(2),
            update: jest.fn(async ({ data }: any) => ({ ...сотрудник, ...data })),
        },
        userCompanyRelation: { upsert: jest.fn() },
        session: { deleteMany: jest.fn() },
    };
    const redis: any = { deleteSession: jest.fn(async () => undefined) };
    const service = new CompanyService(prisma, {} as any, {} as any, redis, {} as any, {} as any, {} as any);
    return { service, prisma, redis, записано: () => prisma.user.update.mock.calls[0]?.[0].data };
}

const логист = { id: 'u-1', companyId: МЫ, role: UserRole.LOGISTICIAN, email: 'ivan@mail.ru', firstName: 'Иван', lastName: 'Петров' };

describe('Правка сотрудника руководителем', () => {
    it('администратором платформы сделать нельзя — ни сотрудника, ни себя', async () => {
        const { service, prisma } = build(логист);

        await expect(service.updateCompanyUser(МЫ, 'u-1', { role: 'ADMIN' }, 'руководитель')).rejects.toThrow('Недопустимая роль');
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('чужие поля в правку не проходят: компанию, активность, права так не поменять', async () => {
        const { service, записано } = build(логист);

        await service.updateCompanyUser(МЫ, 'u-1', {
            firstName: 'Иван', companyId: null, isActive: true, permissions: ['*'], passwordHash: 'x',
        }, 'руководитель');

        expect(записано()).toEqual({ firstName: 'Иван' });
    });

    it('почта для входа — маленькими буквами; занятую не ставим, объясняем словами', async () => {
        const свободно = build(логист);
        await свободно.service.updateCompanyUser(МЫ, 'u-1', { email: ' Novaya@Mail.RU ' }, 'руководитель');
        expect(свободно.записано().email).toBe('novaya@mail.ru');

        const занято = build(логист, { id: 'u-другой' });
        await expect(занято.service.updateCompanyUser(МЫ, 'u-1', { email: 'Admin@P3.kz' }, 'руководитель'))
            .rejects.toThrow('Эта почта уже занята');
        expect(занято.prisma.user.update).not.toHaveBeenCalled();
    });

    it('не похожее на почту не сохраняем', async () => {
        const { service } = build(логист);

        await expect(service.updateCompanyUser(МЫ, 'u-1', { email: 'ivan@mail' }, 'руководитель')).rejects.toThrow('не похоже на адрес почты');
    });

    it('новый пароль: не короче 8 символов, а прежние входы с его устройств гаснут', async () => {
        const короткий = build(логист);
        await expect(короткий.service.updateCompanyUser(МЫ, 'u-1', { password: '123' }, 'руководитель')).rejects.toThrow('не короче 8');

        const { service, prisma, redis, записано } = build(логист);
        await service.updateCompanyUser(МЫ, 'u-1', { password: 'NovyiParol1' }, 'руководитель');

        expect(записано()).toEqual({ passwordHash: 'хэш:NovyiParol1' });
        expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
        expect(redis.deleteSession).toHaveBeenCalledWith('u-1');
    });

    it('почту и пароль другого руководителя компании не поменять — иначе забрали бы его вход', async () => {
        const второйРуководитель = { ...логист, id: 'u-рук', role: UserRole.COMPANY_ADMIN };
        const { service, prisma } = build(второйРуководитель);

        await expect(service.updateCompanyUser(МЫ, 'u-рук', { password: 'NovyiParol1' }, 'u-другой-руководитель'))
            .rejects.toThrow('меняет он сам');
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('свою почту руководитель поменять может', async () => {
        const руководитель = { ...логист, id: 'u-рук', role: UserRole.COMPANY_ADMIN };
        const { service, записано } = build(руководитель);

        await service.updateCompanyUser(МЫ, 'u-рук', { email: 'boss@mail.ru' }, 'u-рук');

        expect(записано().email).toBe('boss@mail.ru');
    });
});
