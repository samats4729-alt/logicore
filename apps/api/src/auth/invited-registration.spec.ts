import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));
jest.mock('bcryptjs', () => ({
    hash: jest.fn(async (пароль: string) => `хэш:${пароль}`),
    compare: jest.fn(async (пароль: string, хэш: string) => хэш === `хэш:${пароль}`),
}));

/**
 * Приглашённый сотрудник: регистрация, повторное приглашение, вход.
 *
 * Жалоба: человека пригласили, он зарегистрировался — и войти не смог.
 * Руководитель удалил его и пригласил заново, а регистрация ответила
 * «Пользователь с таким телефоном уже существует». Три причины, каждая —
 * отдельной проверкой ниже:
 * - после регистрации не записывалась сессия, и кабинет сразу отвечал
 *   «Сессия недействительна» — человек оказывался на странице входа;
 * - вход искал почту буква в букву: «Ivan@mail.ru» и «ivan@mail.ru» —
 *   разные люди;
 * - удаление только выключает сотрудника, а телефон и почта оставались
 *   занятыми его прежней записью.
 */

const КОМПАНИЯ = 'c1';

function стенд(options: { люди?: any[]; связи?: any[]; приглашение?: any } = {}) {
    const люди: any[] = (options.люди ?? []).map((ч) => ({ ...ч }));
    let связи: any[] = (options.связи ?? []).map((с) => ({ ...с }));
    const приглашение = {
        id: 'inv-1', token: 't-1', email: 'ivan@mail.ru', role: UserRole.LOGISTICIAN,
        permissions: ['orders'], companyId: КОМПАНИЯ, departmentId: null, position: 'Логист',
        sharedCompanyIds: [], isUsed: false, expiresAt: new Date(Date.now() + 86_400_000),
        ...options.приглашение,
    };
    const подходит = (ч: any, where: any) => Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
        if (v && typeof v === 'object' && 'not' in v) return ч[k] !== v.not;
        if (v && typeof v === 'object' && 'equals' in v) return String(ч[k] ?? '').toLowerCase() === String(v.equals).toLowerCase();
        return ч[k] === v;
    });

    const prisma: any = {
        user: {
            findUnique: jest.fn(async ({ where }: any) => люди.find((ч) => подходит(ч, where)) ?? null),
            findMany: jest.fn(async ({ where, take }: any) => люди.filter((ч) => подходит(ч, where)).slice(0, take ?? 100)),
            findFirst: jest.fn(async ({ where }: any) => люди.find((ч) => подходит(ч, where)) ?? null),
            create: jest.fn(async ({ data }: any) => {
                const ч = { id: `u-${люди.length + 1}`, isActive: true, ...data };
                люди.push(ч);
                return ч;
            }),
            update: jest.fn(async ({ where, data }: any) => Object.assign(люди.find((ч) => ч.id === where.id), data)),
        },
        invitation: {
            findUnique: jest.fn(async ({ where }: any) => (where.token === приглашение.token ? приглашение : null)),
            update: jest.fn(async ({ data }: any) => Object.assign(приглашение, data)),
        },
        userCompanyRelation: {
            findUnique: jest.fn(async ({ where }: any) => связи.find((с) =>
                с.userId === where.userId_companyId.userId && с.companyId === where.userId_companyId.companyId) ?? null),
            findMany: jest.fn(async ({ where }: any) => связи.filter((с) => с.userId === where.userId && !where.companyId.notIn.includes(с.companyId))),
            deleteMany: jest.fn(async ({ where }: any) => {
                связи = связи.filter((с) => !(с.userId === where.userId && !where.companyId.notIn.includes(с.companyId)));
            }),
            upsert: jest.fn(async ({ where, create, update }: any) => {
                const { userId, companyId } = where.userId_companyId;
                const есть = связи.find((с) => с.userId === userId && с.companyId === companyId);
                if (есть) return Object.assign(есть, update);
                связи.push({ ...create });
                return create;
            }),
        },
        session: { create: jest.fn(async () => ({})), deleteMany: jest.fn(async () => ({})) },
        company: { findUnique: jest.fn(async () => ({ id: КОМПАНИЯ, name: 'ТОО «Мы»' })) },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));

    let выдано = 0;
    const jwt: any = { sign: jest.fn(() => `пропуск-${++выдано}`) };
    const redis: any = {
        getSession: jest.fn(async () => null),
        setSession: jest.fn(async () => undefined),
        deleteSession: jest.fn(async () => undefined),
    };
    const email: any = { sendPasswordResetEmail: jest.fn(async () => undefined) };
    const identity: any = { syncMembership: jest.fn(async () => undefined), removeMembership: jest.fn(async () => undefined) };
    const audit: any = { log: jest.fn(async () => undefined) };

    const service = new AuthService(prisma, jwt, {} as any, redis, email, identity, audit);
    return { service, prisma, redis, email, identity, audit, люди, связи: () => связи, приглашение };
}

const форма = (сверху: any = {}) => ({
    token: 't-1', firstName: 'Иван', lastName: 'Петров', phone: '+77010000001', password: 'новый-пароль', ...сверху,
});

describe('Регистрация по приглашению', () => {
    it('после регистрации кабинет пускает: сессия записана', async () => {
        const { service, prisma, redis } = стенд();

        const итог = await service.registerInvitedUser(форма());

        expect(prisma.session.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ userId: итог.user.id, token: итог.accessToken }),
        }));
        expect(redis.setSession).toHaveBeenCalledWith(итог.user.id, 'web', итог.accessToken, expect.any(Number));
    });

    it('почта сотрудника хранится маленькими буквами и без пробелов', async () => {
        const { service } = стенд({ приглашение: { email: ' Ivan@Mail.RU ' } });

        const итог = await service.registerInvitedUser(форма());

        expect(итог.user.email).toBe('ivan@mail.ru');
    });

    it('удалённый сотрудник возвращается по новому приглашению — та же запись, новый пароль', async () => {
        const { service, люди, связи, prisma, redis, identity, audit } = стенд({
            люди: [{
                id: 'u-старый', email: 'ivan@mail.ru', phone: '+77010000001', isActive: false,
                companyId: КОМПАНИЯ, passwordHash: 'хэш:забытый',
            }],
            связи: [
                { userId: 'u-старый', companyId: КОМПАНИЯ, role: UserRole.LOGISTICIAN },
                { userId: 'u-старый', companyId: 'c-прежняя', role: UserRole.LOGISTICIAN },
            ],
            приглашение: { email: 'Ivan@mail.ru' },
        });

        const итог = await service.registerInvitedUser(форма());

        expect(итог.user.id).toBe('u-старый');
        expect(люди).toHaveLength(1);
        expect(люди[0]).toMatchObject({ isActive: true, passwordHash: 'хэш:новый-пароль', firstName: 'Иван' });
        // Доступ — ровно по новому приглашению: прежняя вторая организация не оживает.
        expect(связи().map((с) => с.companyId)).toEqual([КОМПАНИЯ]);
        expect(identity.removeMembership).toHaveBeenCalledWith('u-старый', 'c-прежняя');
        // Старые входы с его устройств гаснут, новый — записан.
        expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-старый' } });
        expect(redis.deleteSession).toHaveBeenCalledWith('u-старый');
        expect(prisma.session.create).toHaveBeenCalled();
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
            entity: 'employee', entityLabel: 'Сотрудник вернулся по новому приглашению',
        }));
    });

    it('телефон выключенного сотрудника не занят: пригласили на исправленную почту — регистрация проходит', async () => {
        // Первый раз почту вписали с ошибкой, человек так и не вошёл. Его
        // удалили и пригласили на верную почту — телефон у него тот же.
        const { service, люди } = стенд({
            люди: [{ id: 'u-старый', email: 'ivan@mial.ru', phone: '+77010000001', isActive: false, companyId: КОМПАНИЯ }],
        });

        const итог = await service.registerInvitedUser(форма());

        expect(итог.user.id).not.toBe('u-старый');
        expect(люди.find((ч) => ч.id === итог.user.id)).toMatchObject({ email: 'ivan@mail.ru', phone: '+77010000001' });
    });

    it('телефон действующего человека занят — как и раньше', async () => {
        const { service } = стенд({
            люди: [{ id: 'u-другой', email: 'petr@mail.ru', phone: '+77010000001', isActive: true, companyId: КОМПАНИЯ }],
        });

        await expect(service.registerInvitedUser(форма())).rejects.toThrow('Пользователь с таким телефоном уже существует');
    });

    it('почта уже у действующего — подсказываем войти, а не заводить второго', async () => {
        const { service } = стенд({
            люди: [{ id: 'u-1', email: 'ivan@mail.ru', phone: '+77019999999', isActive: true, companyId: КОМПАНИЯ }],
        });

        await expect(service.registerInvitedUser(форма())).rejects.toThrow('уже зарегистрирована — войдите');
    });

    it('выключенную запись чужой компании не возвращаем: с ней ожили бы её старые доступы', async () => {
        const { service, люди } = стенд({
            люди: [{ id: 'u-чужой', email: 'ivan@mail.ru', phone: '+77010000001', isActive: false, companyId: 'c-чужая' }],
        });

        await expect(service.registerInvitedUser(форма())).rejects.toThrow('в другой компании');
        expect(люди[0].isActive).toBe(false);
    });

    it('использованное приглашение второй раз не срабатывает', async () => {
        const { service } = стенд({ приглашение: { isUsed: true } });

        await expect(service.registerInvitedUser(форма())).rejects.toThrow('Приглашение недействительно');
    });
});

describe('Вход и восстановление пароля по почте', () => {
    const заведён = (почта: string, id = 'u-1') => ({
        id, email: почта, phone: '+77010000001', isActive: true, companyId: КОМПАНИЯ,
        passwordHash: 'хэш:пароль', role: UserRole.LOGISTICIAN,
    });

    it('заведён как «Ivan@mail.ru», набирает « ivan@mail.ru » — пускает', async () => {
        const { service } = стенд({ люди: [заведён('Ivan@mail.ru')] });

        const итог = await service.loginWithEmail(' ivan@mail.ru ', 'пароль', 'устройство');

        expect(итог.user.id).toBe('u-1');
    });

    it('неверный пароль — по-прежнему отказ', async () => {
        const { service } = стенд({ люди: [заведён('ivan@mail.ru')] });

        await expect(service.loginWithEmail('ivan@mail.ru', 'не-тот', 'устройство')).rejects.toThrow('Неверный email или пароль');
    });

    it('две записи, отличающиеся только регистром, — берём ту, что набрана буква в букву', async () => {
        const { service } = стенд({ люди: [заведён('ivan@mail.ru', 'u-мал'), заведён('Ivan@mail.ru', 'u-бол')] });

        const итог = await service.loginWithEmail('Ivan@mail.ru', 'пароль', 'устройство');

        expect(итог.user.id).toBe('u-бол');
    });

    it('восстановление пароля находит почту без учёта регистра', async () => {
        const { service, email, redis } = стенд({ люди: [заведён('Ivan@Mail.ru')] });
        redis.set = jest.fn(async () => undefined);

        await service.forgotPassword('ivan@mail.ru');

        expect(redis.set).toHaveBeenCalledWith('password_reset:test-uuid', 'u-1', 1800);
        expect(email.sendPasswordResetEmail).toHaveBeenCalledWith('Ivan@Mail.ru', 'test-uuid', '');
    });
});
