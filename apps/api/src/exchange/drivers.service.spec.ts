import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CONSENT_VERSION, ExchangeDriversService, missingFor } from './drivers.service';
import { birthDateFromIin, isValidIin, normalizeIdNumber, normalizePhone, normalizePlate, parseDay } from './driver-identity';

/** Настоящий по контрольной цифре ИИН из первых одиннадцати цифр. */
function iinFrom(first11: string): string {
    const d = first11.split('').map(Number);
    let c = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].reduce((s, w, i) => s + w * d[i], 0) % 11;
    if (c === 10) c = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2].reduce((s, w, i) => s + w * d[i], 0) % 11;
    return first11 + String(c);
}
/** Первый номер подряд, у которого контрольная цифра — одна цифра, а не 10. */
const GOOD_IIN = ['90010130012', '90010130013', '90010130014'].map(iinFrom).find((x) => x.length === 12)!;

describe('Биржа: личные данные водителя', () => {
    it('настоящий ИИН проходит, перевранная цифра — нет', () => {
        expect(isValidIin(GOOD_IIN)).toBe(true);
        const broken = GOOD_IIN.slice(0, 11) + String((Number(GOOD_IIN[11]) + 1) % 10);
        expect(isValidIin(broken)).toBe(false);
    });

    it('ИИН с пробелами — тот же ИИН; не 12 цифр, кривая дата или век — не ИИН', () => {
        expect(isValidIin(`${GOOD_IIN.slice(0, 6)} ${GOOD_IIN.slice(6)}`)).toBe(true);
        expect(isValidIin('12345')).toBe(false);
        expect(isValidIin(iinFrom('90130130012'))).toBe(false); // 13-й месяц
        expect(isValidIin(iinFrom('90010190012'))).toBe(false); // седьмая цифра 9
    });

    it('телефон приводится к одному виду, чужой формат не принимается', () => {
        expect(normalizePhone('8 701 123 45 67')).toBe('+77011234567');
        expect(normalizePhone('+7 (701) 123-45-67')).toBe('+77011234567');
        expect(normalizePhone('701 123 45 67')).toBe('+77011234567');
        expect(normalizePhone('12345')).toBe('');
    });

    it('госномер — заглавными и без пробелов', () => {
        expect(normalizePlate(' 123 abc 02 ')).toBe('123ABC02');
    });

    it('дата рождения — из ИИН, с веком по седьмой цифре', () => {
        // 900101 + 3 (XX век) → 1 января 1990
        expect(birthDateFromIin(GOOD_IIN)?.toISOString().slice(0, 10)).toBe('1990-01-01');
        const xxi = ['05031550012', '05031550013', '05031550014'].map(iinFrom).find((x) => x.length === 12)!;
        expect(birthDateFromIin(xxi)?.toISOString().slice(0, 10)).toBe('2005-03-15');
        expect(birthDateFromIin('12345')).toBeNull();
    });

    it('номер удостоверения — девять цифр; дата из анкеты — настоящий день', () => {
        expect(normalizeIdNumber('045 123 456')).toBe('045123456');
        expect(normalizeIdNumber('12345')).toBe('');
        expect(parseDay('2030-02-28')?.toISOString().slice(0, 10)).toBe('2030-02-28');
        expect(parseDay('2030-02-30')).toBeNull();
        expect(parseDay('28.02.2030')).toBeNull();
    });
});

const base = {
    kind: null as any, parkCompanyId: null, lastName: null, firstName: null, iin: null, phone: null,
    ipName: null, ipIin: null, vehiclePlate: null, vehicleBodyType: null, vehicleIsOwn: true, contractSignedAt: null,
    idNumber: null as string | null, idIssuedBy: null as string | null, consentAt: null as Date | null,
    registrationAddress: null as string | null, vehicleModel: null as string | null, vehicleRegNumber: null as string | null,
    documents: [] as { kind: any }[],
};
const filled = {
    ...base, lastName: 'Сериков', firstName: 'Серик', iin: GOOD_IIN, phone: '+77011234567', vehiclePlate: '123ABC02', vehicleBodyType: 'тент',
    consentAt: new Date(),
};
/** Удостоверение, прописка и машина для договора — нужны водителю через парк. */
const withId = {
    idNumber: '045123456', idIssuedBy: 'МВД РК',
    registrationAddress: 'г. Алматы, ул. Абая, 1', vehicleModel: 'MAN TGX', vehicleRegNumber: 'AB1234567',
};
const allDocs = ['ID_FRONT', 'ID_BACK', 'SELFIE_WITH_ID', 'LICENSE', 'VEHICLE_REGISTRATION'].map((kind) => ({ kind })) as { kind: any }[];

describe('Биржа: чего не хватает в анкете', () => {
    it('сначала — выбрать, ИП или через парк', () => {
        expect(missingFor(base)).toEqual(['выберите: свой ИП или через парк']);
    });

    it('с ИП фото документов не нужны: перевозчик сам по себе', () => {
        expect(missingFor({ ...filled, kind: 'IP', ipName: 'ИП Сериков', ipIin: GOOD_IIN })).toEqual([]);
        expect(missingFor({ ...filled, kind: 'IP' })).toEqual(['название ИП', 'ИИН ИП']);
    });

    it('без ИП — парк, все фото и подпись договора', () => {
        const m = missingFor({ ...filled, kind: 'PARK' });
        expect(m).toContain('парк');
        expect(m).toContain('фото: фото с удостоверением в руке');
        expect(m).toContain('подпись договора с парком');
        expect(m).toContain('номер удостоверения личности');
        expect(m).toContain('кем выдано удостоверение');
        expect(m).toContain('адрес прописки');
        expect(m).toContain('марка и модель машины');
        expect(m).toContain('номер техпаспорта');
        expect(missingFor({ ...filled, ...withId, kind: 'PARK', parkCompanyId: 'park-1', documents: allDocs, contractSignedAt: new Date() as any })).toEqual([]);
    });

    it('машина не своя — договор с хозяином или доверенность от него (31.10.2026)', () => {
        const base = { ...filled, ...withId, kind: 'PARK' as const, parkCompanyId: 'park-1', contractSignedAt: new Date() as any, vehicleIsOwn: false };
        const безДоверенности = allDocs.filter((d: any) => d.kind !== 'POWER_OF_ATTORNEY');
        expect(missingFor({ ...base, documents: безДоверенности })).toEqual(['договор с хозяином машины или фото доверенности от него']);
        // Подписанный договор с хозяином — доверенность не нужна.
        expect(missingFor({ ...base, documents: безДоверенности, vehicleOwnerContracts: [{ id: 'oc-1' }] })).toEqual([]);
        // Доверенность есть — договор не нужен.
        expect(missingFor({ ...base, documents: [...безДоверенности, { kind: 'POWER_OF_ATTORNEY' }] as any })).toEqual([]);
    });

    it('без согласия на обработку данных анкету не отправить — ни с ИП, ни через парк', () => {
        expect(missingFor({ ...filled, kind: 'IP', ipName: 'ИП Сериков', ipIin: GOOD_IIN, consentAt: null }))
            .toEqual(['согласие на обработку персональных данных']);
        expect(missingFor({ ...filled, ...withId, kind: 'PARK', parkCompanyId: 'park-1', documents: allDocs, contractSignedAt: new Date() as any, consentAt: null }))
            .toEqual(['согласие на обработку персональных данных']);
    });

    it('с ИП удостоверение не спрашиваем — как и раньше (владелец, 09.10)', () => {
        expect(missingFor({ ...filled, kind: 'IP', ipName: 'ИП Сериков', ipIin: GOOD_IIN })).not.toContain('номер удостоверения личности');
    });
});

function driverRow(overrides: Record<string, any> = {}) {
    return {
        id: 'd-1', userId: 'u-1', kind: 'PARK', status: 'DRAFT', parkCompanyId: 'park-1', park: { id: 'park-1', name: 'Парк А' },
        lastName: 'Сериков', firstName: 'Серик', middleName: null, iin: GOOD_IIN, phone: '+77011234567', birthDate: null,
        registrationAddress: 'г. Алматы, ул. Абая, 1', vehicleModel: 'MAN TGX', vehicleRegNumber: 'AB1234567',
        idNumber: '045123456', idIssuedBy: 'МВД РК', idIssuedAt: null, idExpiresAt: null, consentAt: new Date(), consentVersion: CONSENT_VERSION,
        ipName: null, ipIin: null, vehiclePlate: '123ABC02', vehicleBodyType: 'тент', vehicleCapacityKg: 20000, vehicleIsOwn: true,
        contractSignedAt: new Date(), submittedAt: null, reviewedAt: null, rejectReason: null, blockedAt: null, blockedReason: null,
        tripsCompleted: 0, createdAt: new Date(), user: { email: 'serik@gmail.com' },
        documents: allDocs.map((d, i) => ({ id: `doc-${i}`, fileName: 'f.jpg', mimeType: 'image/jpeg', createdAt: new Date(), ...d })),
        ...overrides,
    };
}

function build(row = driverRow()) {
    const prisma: any = {
        exchangeDriver: {
            findUnique: jest.fn().mockResolvedValue(row),
            findFirst: jest.fn().mockResolvedValue(row),
            create: jest.fn(),
            update: jest.fn(async (args: any) => ({ ...row, ...args.data })),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            groupBy: jest.fn().mockResolvedValue([]),
            findMany: jest.fn().mockResolvedValue([]),
        },
        exchangeBlocklist: { findFirst: jest.fn().mockResolvedValue(null), upsert: jest.fn((a: any) => a) },
        company: { findUnique: jest.fn().mockResolvedValue({ isPark: true }), findFirst: jest.fn() },
        user: { findFirst: jest.fn(), create: jest.fn() },
        exchangeDriverContract: { create: jest.fn(async (args: any) => ({ id: 'c-1', ...args.data })) },
        $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    };
    const s3: any = { isS3Enabled: () => true, uploadFile: jest.fn(), deleteFile: jest.fn() };
    const contracts: any = {
        contentToSign: jest.fn(async () => ({ number: 'ПА-261009-D1', version: 'v-test', sections: [] })),
        latestSigned: jest.fn(async () => ({ number: 'ПА-261009-D1', signedAt: new Date('2026-10-09T10:00:00Z') })),
        forDriver: jest.fn(),
    };
    return { service: new ExchangeDriversService(prisma, s3, contracts), prisma, contracts };
}

describe('Биржа: отправить анкету', () => {
    it('без ИП — уходит парку на проверку', async () => {
        const { service, prisma } = build();
        await service.submit('u-1');
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.status).toBe('PENDING');
    });

    it('с ИП — допускается сразу, проверки нет', async () => {
        const { service, prisma } = build(driverRow({ kind: 'IP', parkCompanyId: null, ipName: 'ИП Сериков', ipIin: GOOD_IIN, documents: [] }));
        await service.submit('u-1');
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.status).toBe('APPROVED');
    });

    it('недозаполненная — не уходит, и сказано, чего не хватает', async () => {
        const { service } = build(driverRow({ contractSignedAt: null }));
        await expect(service.submit('u-1')).rejects.toThrow(/подпись договора с парком/);
    });

    it('кто в чёрном списке — не проходит и блокируется', async () => {
        const { service, prisma } = build();
        prisma.exchangeBlocklist.findFirst.mockResolvedValue({ reason: 'увёл груз' });
        await expect(service.submit('u-1')).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.status).toBe('BLOCKED');
        // Ищем по всем трём приметам: ИИН, телефону (цифрами) и номеру машины.
        expect(prisma.exchangeBlocklist.findFirst.mock.calls[0][0].where.OR).toEqual([
            { kind: 'IIN', value: GOOD_IIN }, { kind: 'PHONE', value: '77011234567' }, { kind: 'PLATE', value: '123ABC02' },
        ]);
    });

    it('анкету на проверке не исправить', async () => {
        const { service } = build(driverRow({ status: 'PENDING' }));
        await expect(service.update('u-1', { lastName: 'Иванов' })).rejects.toThrow(/на проверке/);
    });
});

describe('Биржа: поменять данные после допуска', () => {
    function withTrips(row: any, active: number) {
        const built = build(row);
        built.prisma.order = { count: jest.fn().mockResolvedValue(active) };
        return built;
    }

    it('принятая анкета возвращается на правку — и потом снова через проверку', async () => {
        const { service, prisma } = withTrips(driverRow({ status: 'APPROVED' }), 0);
        await service.reopen('u-1');
        const call = prisma.exchangeDriver.updateMany.mock.calls[0][0];
        expect(call.where).toEqual({ id: 'd-1', status: 'APPROVED' });
        expect(call.data.status).toBe('DRAFT');
    });

    it('во время рейса — нельзя: заказчик видит машину из анкеты', async () => {
        const { service, prisma } = withTrips(driverRow({ status: 'APPROVED' }), 1);
        await expect(service.reopen('u-1')).rejects.toThrow(/довезите текущий груз/);
        expect(prisma.exchangeDriver.updateMany).not.toHaveBeenCalled();
    });

    it('заблокированному — нельзя, на проверке — ждать решения', async () => {
        await expect(withTrips(driverRow({ status: 'BLOCKED' }), 0).service.reopen('u-1')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(withTrips(driverRow({ status: 'PENDING' }), 0).service.reopen('u-1')).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('Биржа: ещё номера и почта для документов (Q6)', () => {
    it('номера приводятся к виду, зарубежный сохраняется, основной и повторы отбрасываются; проверки не нужно', async () => {
        const { service, prisma } = build(driverRow({ status: 'APPROVED' }));
        await service.setContacts('u-1', {
            extraPhones: ['8 707 765 43 21', '+998 90 123 45 67', '+7 701 123 45 67', '87077654321', ' '],
            docsEmail: ' Buh@Serik.KZ ',
            docsContact: ' Айгуль, бухгалтер ',
        });
        const data = prisma.exchangeDriver.update.mock.calls[0][0].data;
        expect(data).toEqual({ extraPhones: ['+77077654321', '+998901234567'], docsEmail: 'buh@serik.kz', docsContact: 'Айгуль, бухгалтер' });
        // Статус не трогаем — анкета не уходит на проверку.
        expect(data.status).toBeUndefined();
    });

    it('кривой номер или почта — понятный отказ; заблокированному — нельзя', async () => {
        const { service } = build(driverRow({ status: 'APPROVED' }));
        await expect(service.setContacts('u-1', { extraPhones: ['12345'] })).rejects.toThrow(/не похоже на номер/);
        await expect(service.setContacts('u-1', { docsEmail: 'buh@serik' })).rejects.toThrow(/Почта для документов/);
        await expect(build(driverRow({ status: 'BLOCKED' })).service.setContacts('u-1', { docsEmail: null })).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('Биржа: анкета', () => {
    it('ИИН с ошибкой не сохраняется', async () => {
        const { service } = build();
        await expect(service.update('u-1', { iin: '123456789012' })).rejects.toThrow(/с ошибкой/);
    });

    it('чужой ИИН не занять: один человек — одна анкета', async () => {
        const { service, prisma } = build();
        prisma.exchangeDriver.findFirst.mockResolvedValue({ id: 'd-2' });
        await expect(service.update('u-1', { iin: GOOD_IIN })).rejects.toThrow(/уже зарегистрирован/);
    });

    it('другой парк — договор надо подписать заново', async () => {
        const { service, prisma } = build();
        prisma.company.findFirst.mockResolvedValue({ id: 'park-2' });
        await service.update('u-1', { parkCompanyId: 'park-2' });
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.contractSignedAt).toBeNull();
    });

    it('не парк — выбрать нельзя', async () => {
        const { service, prisma } = build();
        prisma.company.findFirst.mockResolvedValue(null);
        await expect(service.update('u-1', { parkCompanyId: 'company-x' })).rejects.toThrow(/парка на бирже нет/);
    });

    it('ИИН вписан — дата рождения встаёт из него сама', async () => {
        const { service, prisma } = build();
        prisma.exchangeDriver.findFirst.mockResolvedValue(null);
        await service.update('u-1', { iin: GOOD_IIN });
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.birthDate.toISOString().slice(0, 10)).toBe('1990-01-01');
    });

    it('своя ли машина — система решает сама по ИИН собственника из техпаспорта (31.10.2026)', async () => {
        const { service, prisma } = build(driverRow({ vehicleOwnerIin: null, contractSignedAt: null }));
        const data = () => prisma.exchangeDriver.update.mock.calls.at(-1)[0].data;
        await service.update('u-1', { vehicleOwnerIin: GOOD_IIN });
        expect(data()).toMatchObject({ vehicleOwnerIin: GOOD_IIN, vehicleIsOwn: true });
        await service.update('u-1', { vehicleOwnerIin: '850101 300111' });
        expect(data()).toMatchObject({ vehicleOwnerIin: '850101300111', vehicleIsOwn: false });
        // ИИН собственника вписан — отметка «моя» из старого приложения его не перебивает.
        await service.update('u-1', { vehicleOwnerIin: '850101300111', vehicleIsOwn: true });
        expect(data().vehicleIsOwn).toBe(false);
        await expect(service.update('u-1', { vehicleOwnerIin: '12345' })).rejects.toThrow(/12 цифр/);
    });

    it('удостоверение: номер — девять цифр, просроченное не принимаем, пустое — стираем', async () => {
        const { service, prisma } = build();
        await expect(service.update('u-1', { idNumber: '12345' })).rejects.toThrow(/девять цифр/);
        await expect(service.update('u-1', { idExpiresAt: '2020-01-01' })).rejects.toThrow(/просрочено/);
        await expect(service.update('u-1', { idIssuedAt: '2999-01-01' })).rejects.toThrow(/не наступила/);
        await expect(service.update('u-1', { idIssuedAt: '01.02.2020' })).rejects.toThrow(/день, месяц и год/);
        await service.update('u-1', { idNumber: '045 123 456', idIssuedBy: ' МВД РК ', idIssuedAt: '2020-02-01', idExpiresAt: '' });
        const data = prisma.exchangeDriver.update.mock.calls[0][0].data;
        expect(data.idNumber).toBe('045123456');
        expect(data.idIssuedBy).toBe('МВД РК');
        expect(data.idIssuedAt.toISOString().slice(0, 10)).toBe('2020-02-01');
        expect(data.idExpiresAt).toBeNull();
    });

    it('согласие запоминается со временем и версией текста; снял галочку — отозвано', async () => {
        const { service, prisma } = build();
        await service.update('u-1', { consent: true });
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.consentAt).toBeInstanceOf(Date);
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.consentVersion).toBe(CONSENT_VERSION);
        await service.update('u-1', { consent: false });
        expect(prisma.exchangeDriver.update.mock.calls[1][0].data).toMatchObject({ consentAt: null, consentVersion: null });
    });
});

describe('Биржа: решения парка', () => {
    it('чужая компания — не парк, водителей не видит', async () => {
        const { service, prisma } = build();
        prisma.company.findUnique.mockResolvedValue({ isPark: false });
        await expect(service.parkDrivers('company-x')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('допустить можно только анкету на проверке', async () => {
        const { service, prisma } = build(driverRow({ status: 'PENDING' }));
        prisma.exchangeDriver.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.approve('park-1', 'd-1', 'manager-1')).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.exchangeDriver.updateMany.mock.calls[0][0].where).toEqual({ id: 'd-1', parkCompanyId: 'park-1', status: 'PENDING' });
    });

    it('блокировка заносит ИИН, телефон и номер машины в чёрный список', async () => {
        const { service, prisma } = build(driverRow({ status: 'APPROVED' }));
        await service.block('park-1', 'd-1', 'manager-1', 'взял аванс и пропал');
        const kinds = prisma.exchangeBlocklist.upsert.mock.calls.map((c: any[]) => c[0].where.kind_value);
        expect(kinds).toEqual([
            { kind: 'IIN', value: GOOD_IIN }, { kind: 'PHONE', value: '77011234567' }, { kind: 'PLATE', value: '123ABC02' },
        ]);
    });
});

describe('Биржа: вход водителя через Google', () => {
    it('новый человек — заводится водитель биржи с пустой анкетой', async () => {
        const { service, prisma } = build();
        prisma.user.findFirst.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({ id: 'u-9', role: 'DRIVER', companyId: null });
        prisma.exchangeDriver.findUnique.mockResolvedValue(null);
        await service.ensureDriverUser({ googleId: 'g-1', email: 'serik@gmail.com', firstName: 'Серик', lastName: 'Сериков' });
        expect(prisma.user.create.mock.calls[0][0].data.role).toBe('DRIVER');
        expect(prisma.exchangeDriver.create.mock.calls[0][0].data.userId).toBe('u-9');
    });

    it('аккаунт сотрудника компании для биржи не годится', async () => {
        const { service, prisma } = build();
        prisma.user.findFirst.mockResolvedValue({ id: 'u-1', role: 'LOGISTICIAN', companyId: 'c-1' });
        await expect(service.ensureDriverUser({ googleId: 'g-1', email: 'manager@p3.kz', firstName: 'А', lastName: 'Б' }))
            .rejects.toThrow(/кабинете компании/);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });
});

describe('Биржа: регистрация водителя по номеру', () => {
    it('новый номер — водитель биржи с паролем; номер и выбор уже в анкете', async () => {
        const { service, prisma } = build();
        prisma.user.findFirst.mockResolvedValue(null);
        prisma.user.create.mockImplementation(async (args: any) => ({ id: 'u-7', ...args.data }));
        await service.registerByPhone({ phone: '8 701 123 45 67', password: 'пароль-водителя', kind: 'PARK' });
        const data = prisma.user.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ role: 'DRIVER', phone: '+77011234567' });
        expect(data.passwordHash).toBeTruthy();
        expect(data.passwordHash).not.toBe('пароль-водителя');
        expect(data.exchangeDriver.create).toEqual({ phone: '+77011234567', kind: 'PARK' });
        expect(data.companyId).toBeUndefined();
    });

    it('номер ищется в обоих видах — «+7…» и «8…»', async () => {
        const { service, prisma } = build();
        prisma.user.findFirst.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({ id: 'u-7' });
        await service.registerByPhone({ phone: '+7 701 123 45 67', password: 'пароль-водителя' });
        expect(prisma.user.findFirst.mock.calls[0][0].where.phone.in).toEqual(['+77011234567', '87011234567']);
    });

    it('номер водителя компании — не регистрируется, подсказка про диспетчера', async () => {
        const { service, prisma } = build();
        prisma.user.findFirst.mockResolvedValue({ role: 'DRIVER', companyId: 'c-1' });
        await expect(service.registerByPhone({ phone: '+77011234567', password: 'пароль-водителя' }))
            .rejects.toThrow(/диспетчер/);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('занятый номер второй раз не регистрируется', async () => {
        const { service, prisma } = build();
        prisma.user.findFirst.mockResolvedValue({ role: 'DRIVER', companyId: null });
        await expect(service.registerByPhone({ phone: '+77011234567', password: 'пароль-водителя' }))
            .rejects.toThrow(/уже зарегистрирован/);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('не казахстанский мобильный — понятная ошибка', async () => {
        const { service, prisma } = build();
        await expect(service.registerByPhone({ phone: '12345', password: 'пароль-водителя' }))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });
});

describe('Биржа: вступить в парк по коду', () => {
    it('код подходит — водитель «через парк» этого парка, договор с новым парком — заново', async () => {
        const { service, prisma } = build(driverRow({ kind: null, parkCompanyId: null }));
        prisma.company.findFirst.mockResolvedValue({ id: 'park-2' });
        await service.joinParkByCode('u-1', ' abc234 ');
        expect(prisma.company.findFirst.mock.calls[0][0].where).toMatchObject({ parkInviteCode: 'ABC234', isPark: true });
        const data = prisma.exchangeDriver.update.mock.calls[0][0].data;
        expect(data).toMatchObject({ kind: 'PARK', park: { connect: { id: 'park-2' } }, contractSignedAt: null });
    });

    it('неверный код — понятный отказ', async () => {
        const { service, prisma } = build(driverRow({ kind: null }));
        prisma.company.findFirst.mockResolvedValue(null);
        await expect(service.joinParkByCode('u-1', 'XXXXXX')).rejects.toThrow(/Такого кода нет/);
    });

    it('анкета на проверке — код не сменить', async () => {
        const { service } = build(driverRow({ status: 'PENDING' }));
        await expect(service.joinParkByCode('u-1', 'ABC234')).rejects.toThrow(/на проверке/);
    });
});

describe('Биржа: отметка «парк» в админке', () => {
    it('сделать парком — биржа открывается сама: без неё нет ни кабинета парка, ни вступления водителей', async () => {
        const { service, prisma } = build();
        prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
        prisma.company.update = jest.fn();
        await service.setPark('c-1', true);
        expect(prisma.company.update.mock.calls[0][0].data).toEqual({ isPark: true, exchangeAccess: true });
    });

    it('снять отметку — биржа остаётся как была: компания может работать на ней дальше', async () => {
        const { service, prisma } = build();
        prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
        prisma.company.update = jest.fn();
        await service.setPark('c-1', false);
        expect(prisma.company.update.mock.calls[0][0].data).toEqual({ isPark: false });
    });
});

describe('Биржа: договор с парком', () => {
    it('подпись замораживает полный текст: экземпляр сохраняется вместе с отметкой о подписи', async () => {
        const { service, prisma, contracts } = build(driverRow({ contractSignedAt: null }));
        await service.signContract('u-1', 'device-1', '10.0.0.1');
        expect(contracts.contentToSign).toHaveBeenCalledWith('d-1', expect.any(Date));
        const saved = prisma.exchangeDriverContract.create.mock.calls[0][0].data;
        expect(saved).toMatchObject({ driverId: 'd-1', parkCompanyId: 'park-1', number: 'ПА-261009-D1', version: 'v-test', signedDevice: 'device-1', signedIp: '10.0.0.1' });
        expect(saved.signedAt).toEqual(prisma.exchangeDriver.update.mock.calls[0][0].data.contractSignedAt);
    });

    it('данных для договора не хватает — подписать нельзя, и ничего не сохраняется', async () => {
        const { service, prisma, contracts } = build(driverRow({ contractSignedAt: null }));
        contracts.contentToSign.mockRejectedValue(new BadRequestException('Для договора не хватает: адрес прописки'));
        await expect(service.signContract('u-1', undefined, undefined)).rejects.toThrow(/адрес прописки/);
        expect(prisma.exchangeDriverContract.create).not.toHaveBeenCalled();
    });

    it('после подписи сменилась машина — подпись снимается, договор подписывать заново', async () => {
        const { service, prisma } = build(driverRow({ contractSignedAt: new Date() }));
        await service.update('u-1', { vehicleModel: 'Volvo FH' });
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.contractSignedAt).toBeNull();
    });

    it('те же данные ещё раз — подпись остаётся: «Далее» пересохраняет шаг целиком', async () => {
        const { service, prisma } = build(driverRow({ contractSignedAt: new Date() }));
        prisma.exchangeDriver.findFirst.mockResolvedValue(null);
        await service.update('u-1', { lastName: 'Сериков', vehicleModel: 'MAN TGX', vehicleRegNumber: 'ab 1234567' });
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data).not.toHaveProperty('contractSignedAt');
    });

    it('парку в карточке — номер и дата подписанного договора', async () => {
        const { service, prisma } = build(driverRow({ status: 'PENDING' }));
        prisma.company.findUnique.mockResolvedValue({ isPark: true });
        const card: any = await service.parkDriverCard('park-1', 'd-1');
        expect(card.contract).toEqual({ number: 'ПА-261009-D1', signedAt: new Date('2026-10-09T10:00:00Z') });
    });
});

describe('Биржа: удаление аккаунта — заявкой, удаляет администратор (16.10.2026)', () => {
    it('водитель просит — ставится отметка с причиной, сам аккаунт не трогаем', async () => {
        const { service, prisma } = build();
        expect(await service.requestDeletion('u-1', ' ушёл с работы ')).toEqual({ requested: true });
        const data = prisma.exchangeDriver.update.mock.calls[0][0].data;
        expect(data.deletionReason).toBe('ушёл с работы');
        expect(data.deletionRequestedAt).toBeInstanceOf(Date);
    });

    it('передумал — заявка снимается', async () => {
        const { service, prisma } = build();
        await service.cancelDeletion('u-1');
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data).toEqual({ deletionRequestedAt: null, deletionReason: null });
    });

    it('админке — старые заявки сверху', async () => {
        const { service, prisma } = build();
        await service.deletionRequests();
        expect(prisma.exchangeDriver.findMany.mock.calls[0][0]).toMatchObject({ where: { deletionRequestedAt: { not: null } }, orderBy: { deletionRequestedAt: 'asc' } });
    });
});

describe('Биржа: заявление водителя на базовый вычет (16.10.2026)', () => {
    it('подал — отметка и дата; отозвал — снимается', async () => {
        const { service, prisma } = build();
        await service.setDeduction('u-1', true);
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.deductionRequested).toBe(true);
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.deductionRequestedAt).toBeInstanceOf(Date);
        await service.setDeduction('u-1', false);
        expect(prisma.exchangeDriver.update.mock.calls[1][0].data).toEqual({ deductionRequested: false, deductionRequestedAt: null });
    });
});

describe('Парк сам добавляет водителя (Q3/R1)', () => {
    const dto = { phone: '8 701 555 44 33', lastName: ' Сериков ', firstName: 'Ерлан' };

    it('водитель парка с паролем из цифр; пароль отдаётся один раз и в базе не лежит открыто', async () => {
        const { service, prisma } = build();
        prisma.user.findFirst.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({ exchangeDriver: { id: 'x-1' } });

        const added = await service.addByPark('park-1', dto);

        expect(added).toMatchObject({ id: 'x-1', lastName: 'Сериков', firstName: 'Ерлан', phone: '+77015554433' });
        expect(added.password).toMatch(/^\d{8}$/);
        const data = prisma.user.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ role: 'DRIVER', phone: '+77015554433', lastName: 'Сериков', firstName: 'Ерлан' });
        expect(data.passwordHash).not.toContain(added.password);
        expect(data.exchangeDriver.create).toMatchObject({ kind: 'PARK', parkCompanyId: 'park-1', phone: '+77015554433' });
    });

    it('номер уже в системе — второй раз не заводится', async () => {
        const { service, prisma } = build();
        prisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
        await expect(service.addByPark('park-1', dto)).rejects.toThrow(/уже есть/);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('номер из чёрного списка биржи — нельзя', async () => {
        const { service, prisma } = build();
        prisma.user.findFirst.mockResolvedValue(null);
        prisma.exchangeBlocklist.findFirst.mockResolvedValue({ reason: 'обман с топливом' });
        await expect(service.addByPark('park-1', dto)).rejects.toThrow(/чёрном списке/);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });
});
