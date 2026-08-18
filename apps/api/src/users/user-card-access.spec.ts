import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Кого видно в карточке сотрудника.
 *
 * У фото профиля проверка доступа стояла, а у самой карточки — никакой:
 * `GET /users/:id` отдавал имя, телефон, почту, роль и компанию любого
 * человека на платформе. Хватало быть владельцем компании или логистом —
 * то есть почти любым офисным сотрудником у любого нашего клиента.
 *
 * Доказано на стенде: сотрудник ТОО «Магнум Дистрибуция» прочитал карточку
 * администратора ТОО «ЛогиКор Экспедиция» — чужой компании — и получил её
 * целиком.
 *
 * Правило взято то же, что у фото: свои сотрудники и люди из карточек
 * контрагентов, которые завела наша компания.
 */
describe('Доступ к карточке сотрудника', () => {
    const build = (targetCompanyId: string | null, external?: { createdByCompanyId: string }) => {
        const prisma: any = {
            user: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'чужой',
                    email: 'admin@p3.kz',
                    phone: '+77010000009',
                    companyId: targetCompanyId,
                    passwordHash: 'секрет',
                    company: { id: targetCompanyId, name: 'ТОО «ЛогиКор»' },
                }),
            },
            company: {
                findUnique: jest.fn().mockResolvedValue(
                    external ? { isExternal: true, createdByCompanyId: external.createdByCompanyId } : null,
                ),
            },
        };
        return new UsersService(prisma, {} as any);
    };

    const проситель = (over: Record<string, unknown> = {}) =>
        ({ sub: 'я', role: 'COMPANY_ADMIN', companyId: 'моя', ...over }) as any;

    it('сотрудник чужой компании не отдаётся', async () => {
        const service = build('чужая');

        await expect(service.findById('чужой', проситель()))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('логисту — тоже нет', async () => {
        // Роль тут не помогает: дело не в должности, а в чужой компании.
        const service = build('чужая');

        await expect(service.findById('чужой', проситель({ role: 'LOGISTICIAN' })))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('свой сотрудник отдаётся', async () => {
        const service = build('моя');

        await expect(service.findById('чужой', проситель())).resolves.toMatchObject({ id: 'чужой' });
    });

    it('человек из карточки нашего контрагента отдаётся', async () => {
        // Справочник контрагентов завела наша компания — это её данные.
        const service = build('внешняя', { createdByCompanyId: 'моя' });

        await expect(service.findById('чужой', проситель())).resolves.toMatchObject({ id: 'чужой' });
    });

    it('карточка контрагента чужой компании — нет', async () => {
        const service = build('внешняя', { createdByCompanyId: 'другая' });

        await expect(service.findById('чужой', проситель()))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('администратору платформы видно всех', async () => {
        const service = build('чужая');

        await expect(service.findById('чужой', проситель({ role: 'ADMIN', companyId: undefined })))
            .resolves.toMatchObject({ id: 'чужой' });
    });

    it('свою карточку видно всегда', async () => {
        const service = build('чужая');

        await expect(service.findById('чужой', проситель({ sub: 'чужой' })))
            .resolves.toMatchObject({ id: 'чужой' });
    });

    it('хеш пароля наружу не уходит', async () => {
        const service = build('моя');
        const карточка: any = await service.findById('чужой', проситель());

        expect(карточка.passwordHash).toBeUndefined();
    });

    it('несуществующего человека — «не найден», а не пустой ответ', async () => {
        const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
        const service = new UsersService(prisma, {} as any);

        await expect(service.findById('нет-такого', проситель()))
            .rejects.toBeInstanceOf(NotFoundException);
    });
});
