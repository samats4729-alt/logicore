import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Люди платформы: свой профиль, чужие фото, правка администратором.
 *
 * Главное здесь — границы. «Свой профиль» принимал ту же форму, что и
 * правка пользователя администратором: водитель одним запросом делал себя
 * администратором платформы или переезжал в чужую компанию. Проверено
 * живьём на стенде — работало. Ниже проверяется, что не работает.
 */
describe('Люди платформы', () => {
    const ME = 'u-1';
    const COMPANY = 'c-1';

    const build = (options: { user?: any; target?: any; targetCompany?: any } = {}) => {
        const prisma: any = {
            user: {
                findUnique: jest.fn().mockResolvedValue(
                    options.target === undefined ? (options.user ?? { id: ME }) : options.target,
                ),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
            },
            company: { findUnique: jest.fn().mockResolvedValue(options.targetCompany ?? null) },
            session: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        };
        const s3: any = { isS3Enabled: () => false };
        return { service: new UsersService(prisma, s3), prisma };
    };

    describe('свой профиль', () => {
        it('имя и телефон меняются', async () => {
            const { service, prisma } = build();

            await service.updateProfile(ME, { firstName: 'Асель', phone: '+77011112233' });

            const { data } = prisma.user.update.mock.calls[0][0];
            expect(data.firstName).toBe('Асель');
            expect(data.phone).toBe('+77011112233');
        });

        it('роль через свой профиль не меняется', async () => {
            // Водитель прислал {"role":"ADMIN"} — и становился администратором
            // платформы. Один запрос, никаких прав не требовалось.
            const { service, prisma } = build();

            await service.updateProfile(ME, { firstName: 'Пробный', role: 'ADMIN' } as any);

            expect(prisma.user.update.mock.calls[0][0].data.role).toBeUndefined();
        });

        it('переехать в чужую компанию через свой профиль нельзя', async () => {
            const { service, prisma } = build();

            await service.updateProfile(ME, { companyId: 'чужая-компания' } as any);

            expect(prisma.user.update.mock.calls[0][0].data.companyId).toBeUndefined();
        });

        it('пароль через свой профиль не подменяется', async () => {
            // Смена пароля идёт отдельным путём и требует текущего пароля.
            const { service, prisma } = build();

            await service.updateProfile(ME, { password: 'что-угодно' } as any);

            const { data } = prisma.user.update.mock.calls[0][0];
            expect(data.passwordHash).toBeUndefined();
            expect(data.password).toBeUndefined();
        });

        it('уволить себя обратно на работу через профиль нельзя', async () => {
            // Отключённый сотрудник не должен возвращать себе доступ.
            const { service, prisma } = build();

            await service.updateProfile(ME, { isActive: true } as any);

            expect(prisma.user.update.mock.calls[0][0].data.isActive).toBeUndefined();
        });

        it('машина водителя правится — это его личное', async () => {
            const { service, prisma } = build();

            await service.updateProfile(ME, { vehiclePlate: '123ABC01', vehicleModel: 'MAN TGX' });

            const { data } = prisma.user.update.mock.calls[0][0];
            expect(data.vehiclePlate).toBe('123ABC01');
            expect(data.vehicleModel).toBe('MAN TGX');
        });

        it('правится именно свой профиль, а не присланный идентификатор', async () => {
            const { service, prisma } = build();

            await service.updateProfile(ME, { id: 'чужой', firstName: 'Х' } as any);

            expect(prisma.user.update.mock.calls[0][0].where.id).toBe(ME);
        });
    });

    describe('хеш пароля наружу', () => {
        it('не возвращается после правки профиля', async () => {
            // Ответ на «сохранить профиль» приходил вместе с хешем пароля.
            const { service, prisma } = build();
            prisma.user.update.mockResolvedValue({ id: ME, firstName: 'Асель', passwordHash: '$2a$10$xxx' });

            const result: any = await service.updateProfile(ME, { firstName: 'Асель' });

            expect(result.passwordHash).toBeUndefined();
            expect(result.firstName).toBe('Асель');
        });

        it('не возвращается в карточке пользователя', async () => {
            const { service, prisma } = build();
            prisma.user.findUnique.mockResolvedValue({ id: ME, passwordHash: '$2a$10$xxx' });

            expect((await service.findById(ME) as any).passwordHash).toBeUndefined();
        });

        it('не возвращается в списке пользователей', async () => {
            const { service, prisma } = build();
            prisma.user.findMany.mockResolvedValue([{ id: ME, passwordHash: '$2a$10$xxx' }]);

            expect(((await service.findAll())[0] as any).passwordHash).toBeUndefined();
        });

        it('не возвращается в списке водителей', async () => {
            const { service, prisma } = build();
            prisma.user.findMany.mockResolvedValue([{ id: 'd-1', passwordHash: '$2a$10$xxx' }]);

            expect(((await service.findDrivers(COMPANY))[0] as any).passwordHash).toBeUndefined();
        });

        it('для сверки текущего пароля хеш всё же берётся', async () => {
            // Иначе смена пароля перестала бы проверять старый.
            const { service, prisma } = build();
            prisma.user.findUnique.mockResolvedValue({ id: ME, passwordHash: '$2a$10$xxx' });

            expect((await service.findForPasswordCheck(ME))?.passwordHash).toBe('$2a$10$xxx');
        });
    });

    describe('правка администратором', () => {
        it('роль сменить можно', async () => {
            const { service, prisma } = build();

            await service.update('u-2', { role: 'ACCOUNTANT' as any });

            expect(prisma.user.update.mock.calls[0][0].data.role).toBe('ACCOUNTANT');
        });

        it('новый пароль сохраняется хешем, а не как есть', async () => {
            // Присланный `password` уходил в базу как несуществующая колонка:
            // правка пользователя падала ошибкой вместо смены пароля.
            const { service, prisma } = build();

            await service.update('u-2', { password: 'НовыйПароль123' });

            const { data } = prisma.user.update.mock.calls[0][0];
            expect(data.password).toBeUndefined();
            expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
            expect(data.passwordHash).not.toContain('НовыйПароль123');
        });

        it('без нового пароля старый не затирается', async () => {
            const { service, prisma } = build();

            await service.update('u-2', { firstName: 'Иван' });

            expect(prisma.user.update.mock.calls[0][0].data.passwordHash).toBeUndefined();
        });

        it('сотрудник отключается, а не удаляется', async () => {
            // Удалить человека — значит потерять, кто оформлял прошлые рейсы.
            const { service, prisma } = build();

            await service.deactivate('u-2');

            expect(prisma.user.update.mock.calls[0][0].data.isActive).toBe(false);
        });

        it('сброс устройства гасит все сессии человека', async () => {
            const { service, prisma } = build();

            await service.resetDeviceBinding('u-2');

            expect(prisma.session.deleteMany.mock.calls[0][0].where.userId).toBe('u-2');
        });
    });

    describe('фото профиля', () => {
        const requester = { sub: ME, role: 'LOGISTICIAN', companyId: COMPANY };

        it('своё фото доступно всегда', async () => {
            const { service } = build({ target: { avatarPath: 'uploads/a.png', companyId: 'другая' } });

            expect(await service.getAvatarPathFor(ME, requester)).toBe('uploads/a.png');
        });

        it('фото коллеги по компании доступно', async () => {
            const { service } = build({ target: { avatarPath: 'uploads/b.png', companyId: COMPANY } });

            expect(await service.getAvatarPathFor('u-2', requester)).toBe('uploads/b.png');
        });

        it('фото человека из чужой компании закрыто', async () => {
            const { service } = build({ target: { avatarPath: 'uploads/c.png', companyId: 'чужая' } });

            await expect(service.getAvatarPathFor('u-2', requester))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('водитель своего внешнего перевозчика виден', async () => {
            // Перевозчика завели мы: его водители возят наши грузы, и логист
            // должен видеть, кто едет.
            const { service } = build({
                target: { avatarPath: 'uploads/d.png', companyId: 'внешняя' },
                targetCompany: { isExternal: true, createdByCompanyId: COMPANY },
            });

            expect(await service.getAvatarPathFor('u-2', requester)).toBe('uploads/d.png');
        });

        it('водитель чужого внешнего перевозчика закрыт', async () => {
            const { service } = build({
                target: { avatarPath: 'uploads/e.png', companyId: 'внешняя' },
                targetCompany: { isExternal: true, createdByCompanyId: 'другая-компания' },
            });

            await expect(service.getAvatarPathFor('u-2', requester))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('администратору платформы доступно любое', async () => {
            const { service } = build({ target: { avatarPath: 'uploads/f.png', companyId: 'чужая' } });

            expect(await service.getAvatarPathFor('u-2', { sub: 'admin', role: 'ADMIN' }))
                .toBe('uploads/f.png');
        });

        it('человека без компании чужой сотрудник не увидит', async () => {
            const { service } = build({ target: { avatarPath: 'uploads/g.png', companyId: null } });

            await expect(service.getAvatarPathFor('u-2', requester))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('несуществующего человека нет', async () => {
            const { service } = build({ target: null });

            await expect(service.getAvatarPathFor('u-нет', requester))
                .rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
