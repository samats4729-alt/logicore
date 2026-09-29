import { UsersService } from './users.service';

/**
 * Сотрудник меняет свою почту в профиле.
 *
 * Почта — логин. Раньше занятая почта отвечала ошибкой сервера («Internal
 * server error»), а та же почта, набранная заглавными буквами, сохранялась:
 * в системе оказывались два человека с одним ящиком.
 */

function build(занята: any = null) {
    const prisma: any = {
        user: {
            findFirst: jest.fn().mockResolvedValue(занята),
            update: jest.fn(async ({ data }: any) => ({ id: 'u-1', ...data })),
        },
    };
    return { service: new UsersService(prisma, {} as any), prisma };
}

describe('Смена почты в профиле', () => {
    it('сохраняется маленькими буквами и без пробелов', async () => {
        const { service, prisma } = build();

        await service.updateProfile('u-1', { email: ' Novaya.Pochta@Mail.RU ' });

        expect(prisma.user.update.mock.calls[0][0].data.email).toBe('novaya.pochta@mail.ru');
    });

    it('занятая другим — понятный отказ, и ничего не сохраняется', async () => {
        const { service, prisma } = build({ id: 'u-другой' });

        await expect(service.updateProfile('u-1', { email: 'ADMIN@P3.KZ' })).rejects.toThrow('Эта почта уже занята');
        // Ищем без учёта регистра и не считаем занятой свою же почту.
        expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
            email: { equals: 'admin@p3.kz', mode: 'insensitive' },
            id: { not: 'u-1' },
        });
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('стереть почту нельзя — без неё не войти', async () => {
        const { service } = build();

        await expect(service.updateProfile('u-1', { email: '  ' })).rejects.toThrow('Укажите почту');
    });

    it('правка имени без почты почту не трогает', async () => {
        const { service, prisma } = build();

        await service.updateProfile('u-1', { firstName: 'Иван' });

        expect(prisma.user.findFirst).not.toHaveBeenCalled();
        expect(prisma.user.update.mock.calls[0][0].data.email).toBeUndefined();
    });
});
