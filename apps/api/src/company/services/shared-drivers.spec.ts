import { ForbiddenException } from '@nestjs/common';
import { CompanyDriversService } from './company-drivers.service';

/**
 * Общий список водителей и поиск двойника при добавлении.
 *
 * Раньше водитель был виден только у того ИП, под которым его завели, и
 * двойника искали только там же. Водителя, который вчера ехал от соседнего
 * ИП, заводили заново — и в базе оказывались два одинаковых человека с одним
 * телефоном. Приложение водителя пускало в одного из них наугад, и рейс,
 * назначенный на второго, водитель у себя не видел.
 */

const МЫ = 'наша-компания';
const ИП_А = 'ип-а';
const ИП_Б = 'ип-б';

const БАЗА = [
    { id: МЫ, name: 'ТОО «ЛогиКор»' },
    { id: ИП_А, name: 'ИП Сериков' },
    { id: ИП_Б, name: 'ИП Алтын Жол' },
];

const водитель = (сверху: any = {}) => ({
    id: 'в-1',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: null,
    phone: '+7 700 111 22 33',
    iin: null,
    vehicleType: null,
    vehiclePlate: '123 ABC 02',
    vehicleModel: 'Volvo',
    trailerNumber: null,
    docType: null,
    docNumber: null,
    docIssuedAt: null,
    docExpiresAt: null,
    docIssuedBy: null,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    companyId: ИП_А,
    isActive: true,
    ...сверху,
});

function makeService(водители: any[], рейсы: any[] = []) {
    const prisma: any = {
        company: {
            findMany: jest.fn().mockResolvedValue(БАЗА),
            // Перевозчик, под которым заводят, — наш внешний контрагент.
            findUnique: jest.fn().mockResolvedValue({ isExternal: true, createdByCompanyId: МЫ }),
        },
        user: {
            findMany: jest.fn().mockResolvedValue(водители),
            update: jest.fn(async ({ where, data }: any) => ({ ...водители.find((в) => в.id === where.id), ...data })),
            create: jest.fn(async ({ data }: any) => ({ id: 'новый', ...data })),
        },
        order: { groupBy: jest.fn().mockResolvedValue(рейсы) },
        department: {
            findFirst: jest.fn().mockResolvedValue({ id: 'отдел' }),
            create: jest.fn(),
        },
        userCompanyRelation: { create: jest.fn() },
        $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    const identity: any = { syncMembership: jest.fn(), ensurePerson: jest.fn() };
    return { service: new CompanyDriversService(prisma, identity), prisma, identity };
}

describe('Общий список водителей', () => {
    it('в списке — свои и водители всех своих перевозчиков, и никого сверх базы', async () => {
        const { service, prisma } = makeService([
            водитель({ id: 'в-1', companyId: ИП_А }),
            водитель({ id: 'в-2', companyId: ИП_Б, phone: '+7 701 000 00 00', lastName: 'Петров' }),
            водитель({ id: 'в-3', companyId: МЫ, phone: '+7 702 000 00 00', lastName: 'Сидоров' }),
        ]);

        const список = await service.getDriverPool(МЫ);

        expect(список).toHaveLength(3);
        const { where } = prisma.user.findMany.mock.calls[0][0];
        // Своя компания, её перевозчики — и её нештатные без перевозчика.
        expect(where.OR).toEqual([
            { companyId: { in: [МЫ, ИП_А, ИП_Б] } },
            { companyId: null, baseCompanyId: МЫ },
        ]);
        expect(where.isActive).toBe(true);
    });

    it('штатный водитель помечен штатным', async () => {
        const { service } = makeService([водитель({ companyId: МЫ })]);

        const [в] = await service.getDriverPool(МЫ);

        expect(в.isStaff).toBe(true);
        expect(в.companyName).toBe('ТОО «ЛогиКор»');
    });

    describe('двойник, заведённый под двумя ИП', () => {
        const двойники = [
            водитель({ id: 'у-ип-а', companyId: ИП_А, phone: '+7 700 111 22 33', updatedAt: new Date('2026-09-01') }),
            // Та же персона, номер набран иначе, запись свежее — но рейсов на
            // ней нет.
            водитель({ id: 'у-ип-б', companyId: ИП_Б, phone: '87001112233', updatedAt: new Date('2026-09-10') }),
        ];
        const рейсы = [
            { driverId: 'у-ип-а', partnerId: ИП_А, subForwarderId: null, forwarderId: МЫ, _max: { createdAt: new Date('2026-09-20') }, _count: { _all: 2 } },
        ];

        it('показан одной строкой', async () => {
            const { service } = makeService(двойники, рейсы);

            const список = await service.getDriverPool(МЫ);

            expect(список).toHaveLength(1);
        });

        it('строка — запись с последним рейсом: на неё и пойдут новые рейсы', async () => {
            const { service } = makeService(двойники, рейсы);

            const [в] = await service.getDriverPool(МЫ);

            expect(в.id).toBe('у-ип-а');
            expect(в.lastTrip).toMatchObject({ carrierId: ИП_А, carrierName: 'ИП Сериков' });
        });

        it('перевозчики строки — оба ИП, под которыми его заводили', async () => {
            const { service } = makeService(двойники, рейсы);

            const [в] = await service.getDriverPool(МЫ);

            expect(в.carrierIds).toEqual(expect.arrayContaining([ИП_А, ИП_Б]));
        });
    });

    it('перевозчиками считаются и те, за кого водитель уже ездил', async () => {
        // Прописан у ИП «А», а рейс вёз за ИП «Б»: в заявке от «Б» его
        // поднимут наверх как уже знакомого.
        const { service } = makeService(
            [водитель({ id: 'в-1', companyId: ИП_А })],
            [{ driverId: 'в-1', partnerId: ИП_Б, subForwarderId: null, forwarderId: МЫ, _max: { createdAt: new Date('2026-09-21') }, _count: { _all: 1 } }],
        );

        const [в] = await service.getDriverPool(МЫ);

        expect(в.carrierIds).toEqual(expect.arrayContaining([ИП_А, ИП_Б]));
        expect(в.lastTrip?.carrierName).toBe('ИП Алтын Жол');
    });
});

describe('Добавление водителя, который уже есть в базе', () => {
    const новый = {
        firstName: 'Иван',
        lastName: 'Иванов',
        phone: '87001112233',
        vehiclePlate: '777 XYZ 02',
    };

    it('заведён под другим ИП — второго не заводим, берём существующего', async () => {
        const { service, prisma } = makeService([водитель({ id: 'у-ип-а', companyId: ИП_А })]);

        const итог: any = await service.createDriver(ИП_Б, новый, МЫ);

        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(итог.alreadyExists).toBe(true);
        expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'у-ип-а' } }));
    });

    it('телефон найденного водителя не переписываем — это его вход в приложение', async () => {
        // Нашли по номеру, набранному иначе: «8 700…» вместо «+7 700…».
        // Приложение сравнивает номер строкой, и перезапись заперла бы
        // водителя снаружи.
        const { service, prisma } = makeService([водитель({ id: 'у-ип-а', companyId: ИП_А })]);

        await service.createDriver(ИП_Б, новый, МЫ);

        const { data } = prisma.user.update.mock.calls[0][0];
        expect(data.phone).toBeUndefined();
        expect(data.vehiclePlate).toBe('777 XYZ 02');
    });

    it('прописку не меняем: у кого завели, у того и числится', async () => {
        const { service, prisma } = makeService([водитель({ id: 'у-ип-а', companyId: ИП_А })]);

        await service.createDriver(ИП_Б, новый, МЫ);

        const { data } = prisma.user.update.mock.calls[0][0];
        expect(data.companyId).toBeUndefined();
    });

    it('связь с чужим перевозчиком в новый слой не пишем — сверка слоёв приняла бы её за расхождение', async () => {
        const { service, identity } = makeService([водитель({ id: 'у-ип-а', companyId: ИП_А })]);

        await service.createDriver(ИП_Б, новый, МЫ);

        expect(identity.syncMembership).not.toHaveBeenCalled();
    });

    it('у того же ИП — как было: обновляем и пишем в новый слой', async () => {
        const { service, prisma, identity } = makeService([водитель({ id: 'у-ип-б', companyId: ИП_Б })]);

        await service.createDriver(ИП_Б, новый, МЫ);

        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(identity.syncMembership).toHaveBeenCalledWith('у-ип-б', ИП_Б, 'DRIVER', { isPrimary: true });
    });

    it('совпал ИИН при другом телефоне — тоже он', async () => {
        const { service, prisma } = makeService([
            водитель({ id: 'у-ип-а', companyId: ИП_А, phone: '+7 777 000 00 00', iin: '900101300123' }),
        ]);

        await service.createDriver(ИП_Б, { ...новый, iin: '900101300123' }, МЫ);

        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('новый человек — заводим как раньше', async () => {
        const { service, prisma } = makeService([водитель({ id: 'кто-то', phone: '+7 705 555 55 55' })]);

        await service.createDriver(ИП_Б, новый, МЫ);

        expect(prisma.user.create).toHaveBeenCalled();
        expect(prisma.user.create.mock.calls[0][0].data.companyId).toBe(ИП_Б);
    });

    it('в штат — ищем, как раньше, только среди штатных', async () => {
        // Штатный — это отдел, зарплата и список сотрудников. Человек,
        // ездивший от ИП, переходя в штат, получает свою запись: запись
        // перевозчика в списке сотрудников не видна.
        const { service, prisma } = makeService([водитель({ id: 'у-ип-а', companyId: ИП_А })]);
        prisma.user.findMany.mockImplementation(async ({ where }: any) =>
            where.companyId.in.includes(ИП_А) ? [водитель({ id: 'у-ип-а', companyId: ИП_А })] : []);

        await service.createDriver(МЫ, новый, МЫ);

        expect(prisma.user.findMany.mock.calls[0][0].where.companyId).toEqual({ in: [МЫ] });
        expect(prisma.user.create).toHaveBeenCalled();
    });

    it('в ответе — у кого нашёлся: экран так и скажет', async () => {
        const { service, prisma } = makeService([водитель({ id: 'у-ип-а', companyId: ИП_А })]);
        prisma.company.findUnique.mockResolvedValue({ isExternal: true, createdByCompanyId: МЫ, name: 'ИП Сериков' });

        const итог: any = await service.createDriver(ИП_Б, новый, МЫ);

        expect(итог.sharedFromName).toBe('ИП Сериков');
    });

    it('двойника ищем только в своей базе — и среди её нештатных', async () => {
        const { service, prisma } = makeService([]);

        await service.createDriver(ИП_Б, новый, МЫ);

        const { where } = prisma.user.findMany.mock.calls[0][0];
        expect(where.OR).toEqual([
            { companyId: { in: [МЫ, ИП_А, ИП_Б] } },
            { companyId: null, baseCompanyId: МЫ },
        ]);
    });
});

describe('Нештатный водитель без перевозчика', () => {
    // Человек со своей фурой и без ИП: экспедитор нашёл его на рейс, данные и
    // машину записал, а сделку ведёт через своего перевозчика. Прописать его
    // не у кого — он числится в базе компании, но не в штате.
    const нештатный = { firstName: 'Ержан', lastName: 'Садыков', phone: '+7 705 123 45 67', vehiclePlate: '888 FRE 02' };
    const ЧУЖИЕ = 'чужая-компания';

    it('заводится в базу компании, а не в штат', async () => {
        const { service, prisma, identity } = makeService([]);

        await service.createIndependentDriver(МЫ, нештатный);

        const { data } = prisma.user.create.mock.calls[0][0];
        expect(data).toMatchObject({ companyId: null, baseCompanyId: МЫ, role: 'DRIVER', isActive: true });
        // Не сотрудник: ни отдела «Водители», ни связи с компанией, ни
        // членства в новом слое — иначе он всплыл бы в «Сотрудниках».
        expect(data.departmentId).toBeUndefined();
        expect(prisma.department.create).not.toHaveBeenCalled();
        expect(prisma.userCompanyRelation.create).not.toHaveBeenCalled();
        expect(identity.syncMembership).not.toHaveBeenCalled();
        // А личность — как у всякого пользователя.
        expect(identity.ensurePerson).toHaveBeenCalled();
    });

    it('уже есть в базе у ИП — второго не заводим и прописку не меняем', async () => {
        const { service, prisma } = makeService([
            водитель({ id: 'у-ип-а', companyId: ИП_А, phone: '8 705 123 45 67' }),
        ]);

        const итог: any = await service.createIndependentDriver(МЫ, нештатный);

        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(итог.alreadyExists).toBe(true);
        const { data } = prisma.user.update.mock.calls[0][0];
        expect(data.companyId).toBeUndefined();
        expect(data.phone).toBeUndefined();
        expect(data.vehiclePlate).toBe('888 FRE 02');
    });

    it('двойника ищем по всей базе и среди нештатных', async () => {
        const { service, prisma } = makeService([]);

        await service.createIndependentDriver(МЫ, нештатный);

        const { where } = prisma.user.findMany.mock.calls[0][0];
        expect(where.OR).toEqual([
            { companyId: { in: [МЫ, ИП_А, ИП_Б] } },
            { companyId: null, baseCompanyId: МЫ },
        ]);
    });

    it('в общем списке — нештатным, без прописки', async () => {
        const { service } = makeService([водитель({ id: 'свой', companyId: null, baseCompanyId: МЫ })]);

        const [в] = await service.getDriverPool(МЫ);

        expect(в).toMatchObject({ kind: 'INDEPENDENT', isStaff: false, companyName: null });
    });

    it('в списке видно, кто есть кто: штатный и водитель перевозчика', async () => {
        const { service } = makeService([
            водитель({ id: 'штат', companyId: МЫ, phone: '+7 701 000 00 01' }),
            водитель({ id: 'ип', companyId: ИП_А, phone: '+7 701 000 00 02' }),
        ]);

        const список = await service.getDriverPool(МЫ);

        expect(список.find((в) => в.id === 'штат')).toMatchObject({ kind: 'STAFF', isStaff: true });
        expect(список.find((в) => в.id === 'ип')).toMatchObject({ kind: 'CARRIER', companyName: 'ИП Сериков' });
    });

    it('рейсов — сколько он отвёз за наших перевозчиков', async () => {
        const { service } = makeService(
            [водитель({ id: 'свой', companyId: null, baseCompanyId: МЫ })],
            [
                { driverId: 'свой', partnerId: ИП_А, subForwarderId: null, forwarderId: МЫ, _max: { createdAt: new Date('2026-09-20') }, _count: { _all: 2 } },
                { driverId: 'свой', partnerId: null, subForwarderId: ИП_Б, forwarderId: МЫ, _max: { createdAt: new Date('2026-09-22') }, _count: { _all: 1 } },
            ],
        );

        const [в] = await service.getDriverPool(МЫ);

        expect(в.tripsCount).toBe(3);
        expect(в.lastTrip).toMatchObject({ carrierId: ИП_Б });
    });

    it('править своего нештатного можно, чужого — нет', async () => {
        const { service, prisma } = makeService([]);
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'н', companyId: null, baseCompanyId: МЫ, phone: '+77051234567' });

        await service.updateDriver('н', МЫ, { vehiclePlate: '999 NEW 02' });
        expect(prisma.user.update).toHaveBeenCalled();

        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'н', companyId: null, baseCompanyId: ЧУЖИЕ, phone: '+77051234567' });
        await expect(service.updateDriver('н', МЫ, { vehiclePlate: '999 NEW 02' }))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('убрать из списка своего нештатного можно, чужого — нет', async () => {
        const { service, prisma } = makeService([]);
        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'н', companyId: null, baseCompanyId: МЫ });

        await service.deactivateDriver('н', МЫ);
        expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));

        prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'н', companyId: null, baseCompanyId: null });
        await expect(service.deactivateDriver('н', МЫ)).rejects.toBeInstanceOf(ForbiddenException);
    });
});
