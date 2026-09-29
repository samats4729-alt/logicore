import { UserRole } from '@prisma/client';
import { CompanyService } from './company.service';

/**
 * Приглашение сотрудника: почта и кому приглашение не поможет.
 *
 * Почта в приглашении — будущий логин. Её хранят в одном виде (маленькими
 * буквами, без пробелов), иначе заглавная буква, которую поставил телефон,
 * потом не пускает человека на вход.
 *
 * Кого приглашать бесполезно, говорим сразу руководителю, а не человеку в
 * конце заполненной формы: того, кто уже работает, и почту, занятую в
 * другой компании. Выключенного сотрудника своей компании приглашать
 * можно — по новому приглашению он вернётся.
 */

const МЫ = 'c1';

function build(занята: any = null, связь: any = null) {
    const prisma: any = {
        user: { findFirst: jest.fn().mockResolvedValue(занята) },
        userCompanyRelation: { findUnique: jest.fn().mockResolvedValue(связь) },
        invitation: { create: jest.fn(async ({ data }: any) => ({ id: 'inv-1', ...data })) },
        company: { findUnique: jest.fn().mockResolvedValue({ name: 'ТОО «Мы»' }) },
    };
    const email: any = { sendInvitationEmail: jest.fn().mockResolvedValue(true) };
    const service = new CompanyService(prisma, {} as any, {} as any, {} as any, email, {} as any, {} as any);
    return { service, prisma, email };
}

describe('Приглашение сотрудника', () => {
    it('почта в приглашении — маленькими буквами и без пробелов, письмо уходит на неё же', async () => {
        const { service, prisma, email } = build();

        await service.createInvitation(МЫ, ' Ivan@Mail.RU ', UserRole.LOGISTICIAN, ['orders']);

        expect(prisma.invitation.create.mock.calls[0][0].data.email).toBe('ivan@mail.ru');
        expect(email.sendInvitationEmail.mock.calls[0][0]).toBe('ivan@mail.ru');
        // Занята ли почта — ищем без учёта регистра.
        expect(prisma.user.findFirst.mock.calls[0][0].where.email).toEqual({ equals: 'ivan@mail.ru', mode: 'insensitive' });
    });

    it('сотрудник уже работает у нас — приглашать заново не нужно, подсказываем «Забыли пароль?»', async () => {
        const { service, prisma } = build({ id: 'u-1', isActive: true, companyId: МЫ });

        await expect(service.createInvitation(МЫ, 'ivan@mail.ru', UserRole.LOGISTICIAN))
            .rejects.toThrow('уже работает в компании');
        expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('у нас он по второй организации холдинга — тоже «уже работает»', async () => {
        const { service } = build({ id: 'u-1', isActive: true, companyId: 'c-головная' }, { userId: 'u-1' });

        await expect(service.createInvitation(МЫ, 'ivan@mail.ru', UserRole.LOGISTICIAN))
            .rejects.toThrow('уже работает в компании');
    });

    it('почта занята в другой компании — просим пригласить на другую', async () => {
        const { service, prisma } = build({ id: 'u-1', isActive: true, companyId: 'c-чужая' });

        await expect(service.createInvitation(МЫ, 'ivan@mail.ru', UserRole.LOGISTICIAN))
            .rejects.toThrow('в другой компании');
        expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('выключенная запись другой компании — тоже другая почта', async () => {
        const { service } = build({ id: 'u-1', isActive: false, companyId: 'c-чужая' });

        await expect(service.createInvitation(МЫ, 'ivan@mail.ru', UserRole.LOGISTICIAN))
            .rejects.toThrow('в другой компании');
    });

    it('удалённого сотрудника своей компании пригласить можно — он вернётся', async () => {
        const { service, prisma } = build({ id: 'u-1', isActive: false, companyId: МЫ });

        await service.createInvitation(МЫ, 'ivan@mail.ru', UserRole.LOGISTICIAN);

        expect(prisma.invitation.create).toHaveBeenCalled();
    });
});
