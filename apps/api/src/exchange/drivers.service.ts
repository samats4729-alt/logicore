import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ExchangeDriverDocumentKind, ExchangeDriverStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { assertAllowedUpload } from '../documents/allowed-files';
import { birthDateFromIin, digitsOnly, isValidIin, normalizeIdNumber, normalizePhone, normalizePlate, parseDay } from './driver-identity';
import { removeExchangeFile, safeExtension, storeExchangeFile } from './exchange-files';
import { PARK_FILTER_STATUSES, ParkDriverFilter, UpdateDriverProfileDto } from './dto/driver.dto';

/** Подписи документов — ими же сервер говорит, чего не хватает. */
export const DOCUMENT_TITLES: Record<ExchangeDriverDocumentKind, string> = {
    ID_FRONT: 'удостоверение — лицевая сторона',
    ID_BACK: 'удостоверение — обратная сторона',
    SELFIE_WITH_ID: 'фото с удостоверением в руке',
    LICENSE: 'водительское удостоверение',
    VEHICLE_REGISTRATION: 'техпаспорт',
    POWER_OF_ATTORNEY: 'доверенность от владельца машины',
    IP_CERTIFICATE: 'документ о регистрации ИП',
};

/**
 * Версия текста согласия на обработку персональных данных. Текст — в
 * приложении водителя (`apps/mobile/lib/consent.ts`); поменяли текст —
 * меняется и версия, и по ней видно, на какой текст согласился человек.
 */
export const CONSENT_VERSION = '2026-10-09';

/** Пока анкету можно править: заполняет или исправляет после отказа. */
const EDITABLE: ExchangeDriverStatus[] = ['DRAFT', 'REJECTED'];

const DRIVER_SELECT = {
    id: true, userId: true, kind: true, status: true,
    parkCompanyId: true, park: { select: { id: true, name: true } },
    lastName: true, firstName: true, middleName: true, iin: true, phone: true, birthDate: true,
    idNumber: true, idIssuedBy: true, idIssuedAt: true, idExpiresAt: true,
    consentAt: true, consentVersion: true,
    ipName: true, ipIin: true,
    vehiclePlate: true, vehicleBodyType: true, vehicleCapacityKg: true, vehicleIsOwn: true,
    contractSignedAt: true,
    submittedAt: true, reviewedAt: true, rejectReason: true, blockedAt: true, blockedReason: true,
    tripsCompleted: true, createdAt: true,
    user: { select: { email: true } },
    documents: { select: { id: true, kind: true, fileName: true, mimeType: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ExchangeDriverSelect;

type DriverRow = Prisma.ExchangeDriverGetPayload<{ select: typeof DRIVER_SELECT }>;

/**
 * Чего не хватает, чтобы отправить анкету, — словами для водителя.
 *
 * С ИП — перевозчик сам по себе, проверки нет (решение владельца,
 * 04.10.2026): нужны имя, ИИН (один человек — одна анкета), телефон, ИП и
 * машина. Без ИП — ещё парк, фото документов и подписанный договор с
 * парком: его допускает парк, посмотрев документы и позвонив.
 *
 * Согласие на обработку персональных данных — у всех: имя, ИИН и телефон
 * есть и у водителя с ИП. Удостоверение (номер и кем выдано) — только через
 * парк: парк сверяет его с фото и вписывает в договор (владелец, 09.10.2026).
 */
export function missingFor(d: Pick<DriverRow, 'kind' | 'parkCompanyId' | 'lastName' | 'firstName' | 'iin' | 'phone'
    | 'ipName' | 'ipIin' | 'vehiclePlate' | 'vehicleBodyType' | 'vehicleIsOwn' | 'contractSignedAt'
    | 'idNumber' | 'idIssuedBy' | 'consentAt'> & {
    documents: { kind: ExchangeDriverDocumentKind }[];
}): string[] {
    const missing: string[] = [];
    if (!d.kind) return ['выберите: свой ИП или через парк'];
    if (!d.lastName) missing.push('фамилия');
    if (!d.firstName) missing.push('имя');
    if (!d.iin) missing.push('ИИН');
    if (!d.phone) missing.push('телефон');
    if (!d.vehiclePlate) missing.push('госномер машины');
    if (!d.vehicleBodyType) missing.push('тип кузова');
    if (!d.consentAt) missing.push('согласие на обработку персональных данных');
    if (d.kind === 'IP') {
        if (!d.ipName) missing.push('название ИП');
        if (!d.ipIin) missing.push('ИИН ИП');
        return missing;
    }
    if (!d.idNumber) missing.push('номер удостоверения личности');
    if (!d.idIssuedBy) missing.push('кем выдано удостоверение');
    if (!d.parkCompanyId) missing.push('парк');
    const has = new Set(d.documents.map((x) => x.kind));
    const needed: ExchangeDriverDocumentKind[] = ['ID_FRONT', 'ID_BACK', 'SELFIE_WITH_ID', 'LICENSE', 'VEHICLE_REGISTRATION'];
    if (!d.vehicleIsOwn) needed.push('POWER_OF_ATTORNEY');
    for (const kind of needed) if (!has.has(kind)) missing.push(`фото: ${DOCUMENT_TITLES[kind]}`);
    if (!d.contractSignedAt) missing.push('подпись договора с парком');
    return missing;
}

/**
 * Водители биржи: анкета в приложении, проверка парком, чёрный список.
 */
@Injectable()
export class ExchangeDriversService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
    ) {}

    private view(d: DriverRow) {
        return { ...d, missing: missingFor(d), email: d.user?.email ?? null };
    }

    // ==================== вход водителя ====================

    /**
     * Завести водителя биржи по профилю Google, если его ещё нет.
     *
     * Google-аккаунт сотрудника компании для биржи не годится: у него своя
     * роль и своя компания, и одна запись не может быть и тем и другим.
     */
    async ensureDriverUser(google: { googleId: string; email: string; firstName: string; lastName: string }) {
        const existing = await this.prisma.user.findFirst({
            where: { OR: [{ googleId: google.googleId }, ...(google.email ? [{ email: google.email }] : [])] },
            select: { id: true, role: true, companyId: true },
        });
        if (existing && (existing.role !== 'DRIVER' || existing.companyId)) {
            throw new BadRequestException(
                'Этот аккаунт Google уже используется в кабинете компании. Для биржи войдите другим аккаунтом Google.',
            );
        }
        const user = existing ?? await this.prisma.user.create({
            data: {
                role: 'DRIVER',
                email: google.email || null,
                googleId: google.googleId,
                firstName: google.firstName || 'Водитель',
                lastName: google.lastName || '',
                // Телефон водитель впишет в анкете; парк при проверке ему позвонит.
                phone: '',
            },
            select: { id: true, role: true, companyId: true },
        });
        const driver = await this.prisma.exchangeDriver.findUnique({ where: { userId: user.id }, select: { id: true } });
        if (!driver) {
            await this.prisma.exchangeDriver.create({
                data: { userId: user.id, firstName: google.firstName || null, lastName: google.lastName || null },
            });
        }
        return user;
    }

    // ==================== водитель (приложение) ====================

    /** Анкета водителя. Первый вход — пустая анкета появляется сама. */
    async me(userId: string) {
        const existing = await this.prisma.exchangeDriver.findUnique({ where: { userId }, select: DRIVER_SELECT });
        if (existing) return this.view(existing);
        const created = await this.prisma.exchangeDriver.create({ data: { userId }, select: DRIVER_SELECT });
        return this.view(created);
    }

    private async ownDriver(userId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({ where: { userId }, select: DRIVER_SELECT });
        if (!driver) throw new NotFoundException('Анкета не найдена — откройте приложение заново');
        return driver;
    }

    private assertEditable(d: { status: ExchangeDriverStatus }) {
        if (d.status === 'BLOCKED') throw new ForbiddenException('Вы заблокированы на бирже');
        if (!EDITABLE.includes(d.status)) {
            throw new BadRequestException(
                d.status === 'PENDING'
                    ? 'Анкета на проверке у парка — дождитесь решения'
                    : 'Анкета уже принята. Чтобы что-то поменять, нажмите «Изменить данные» в профиле',
            );
        }
    }

    async update(userId: string, dto: UpdateDriverProfileDto) {
        const driver = await this.ownDriver(userId);
        this.assertEditable(driver);

        const data: Prisma.ExchangeDriverUpdateInput = {};
        const text = (v?: string) => (v === undefined ? undefined : v.trim() || null);

        if (dto.kind !== undefined) {
            data.kind = dto.kind;
            // Сменил вид работы — прежний выбор теряет смысл.
            if (dto.kind === 'IP') { data.park = { disconnect: true }; data.contractSignedAt = null; }
            if (dto.kind === 'PARK') { data.ipName = null; data.ipIin = null; }
        }
        if (dto.parkCompanyId !== undefined) {
            if (dto.parkCompanyId) {
                const park = await this.prisma.company.findFirst({
                    where: { id: dto.parkCompanyId, isPark: true, isActive: true, exchangeAccess: true },
                    select: { id: true },
                });
                if (!park) throw new BadRequestException('Такого парка на бирже нет');
                // Договор подписывают с конкретным парком: другой парк — другой договор.
                if (park.id !== driver.parkCompanyId) data.contractSignedAt = null;
                data.park = { connect: { id: park.id } };
            } else {
                data.park = { disconnect: true };
                data.contractSignedAt = null;
            }
        }
        if (dto.lastName !== undefined) data.lastName = text(dto.lastName);
        if (dto.firstName !== undefined) data.firstName = text(dto.firstName);
        if (dto.middleName !== undefined) data.middleName = text(dto.middleName);
        if (dto.iin !== undefined) {
            const iin = digitsOnly(dto.iin);
            if (iin && !isValidIin(iin)) throw new BadRequestException('ИИН указан с ошибкой — проверьте по удостоверению');
            if (iin) {
                const taken = await this.prisma.exchangeDriver.findFirst({ where: { iin, NOT: { id: driver.id } }, select: { id: true } });
                if (taken) throw new BadRequestException('Этот ИИН уже зарегистрирован на бирже');
            }
            data.iin = iin || null;
            // Дата рождения — из ИИН, вместе с ним: отдельно её не ввести и не перепутать.
            data.birthDate = birthDateFromIin(iin);
        }
        if (dto.phone !== undefined) {
            const phone = normalizePhone(dto.phone);
            if (dto.phone.trim() && !phone) throw new BadRequestException('Телефон — казахстанский мобильный, например +7 701 123 45 67');
            data.phone = phone || null;
        }
        if (dto.ipName !== undefined) data.ipName = text(dto.ipName);
        if (dto.ipIin !== undefined) {
            const ipIin = digitsOnly(dto.ipIin);
            if (ipIin && ipIin.length !== 12) throw new BadRequestException('ИИН ИП — 12 цифр');
            data.ipIin = ipIin || null;
        }
        if (dto.vehiclePlate !== undefined) data.vehiclePlate = normalizePlate(dto.vehiclePlate) || null;
        if (dto.vehicleBodyType !== undefined) data.vehicleBodyType = text(dto.vehicleBodyType);
        if (dto.vehicleCapacityKg !== undefined) data.vehicleCapacityKg = dto.vehicleCapacityKg;
        if (dto.vehicleIsOwn !== undefined) data.vehicleIsOwn = dto.vehicleIsOwn;
        if (dto.idNumber !== undefined) {
            const idNumber = normalizeIdNumber(dto.idNumber);
            if (dto.idNumber.trim() && !idNumber) throw new BadRequestException('Номер удостоверения — девять цифр, как на карточке');
            data.idNumber = idNumber || null;
        }
        if (dto.idIssuedBy !== undefined) data.idIssuedBy = text(dto.idIssuedBy);
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (dto.idIssuedAt !== undefined) {
            const issued = dto.idIssuedAt.trim() ? parseDay(dto.idIssuedAt) : null;
            if (dto.idIssuedAt.trim() && !issued) throw new BadRequestException('Дата выдачи удостоверения — день, месяц и год');
            if (issued && issued > today) throw new BadRequestException('Дата выдачи удостоверения — ещё не наступила, проверьте год');
            data.idIssuedAt = issued;
        }
        if (dto.idExpiresAt !== undefined) {
            const expires = dto.idExpiresAt.trim() ? parseDay(dto.idExpiresAt) : null;
            if (dto.idExpiresAt.trim() && !expires) throw new BadRequestException('Срок действия удостоверения — день, месяц и год');
            // Просроченное удостоверение парк не примет — лучше сказать сразу,
            // чем через день проверки.
            if (expires && expires < today) throw new BadRequestException('Удостоверение просрочено — для допуска нужно действующее');
            data.idExpiresAt = expires;
        }
        if (dto.consent !== undefined) {
            data.consentAt = dto.consent ? new Date() : null;
            data.consentVersion = dto.consent ? CONSENT_VERSION : null;
        }

        const updated = await this.prisma.exchangeDriver.update({ where: { id: driver.id }, data, select: DRIVER_SELECT });
        return this.view(updated);
    }

    /** Парки биржи — для выбора в анкете. */
    async parks() {
        return this.prisma.company.findMany({
            // Только парки, которым открыта биржа: в другой парк вступать пока незачем.
            where: { isPark: true, isActive: true, exchangeAccess: true },
            select: { id: true, name: true, bin: true },
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Подписать договор с парком. До подписи через eGov — подтверждение в
     * приложении: запоминаем, кто, когда и с какого устройства и адреса.
     */
    async signContract(userId: string, deviceId: string | undefined, ip: string | undefined) {
        const driver = await this.ownDriver(userId);
        this.assertEditable(driver);
        if (driver.kind !== 'PARK' || !driver.parkCompanyId) {
            throw new BadRequestException('Сначала выберите парк — договор подписывается с ним');
        }
        const updated = await this.prisma.exchangeDriver.update({
            where: { id: driver.id },
            data: {
                contractSignedAt: new Date(),
                contractSignedDevice: deviceId?.slice(0, 200) || null,
                contractSignedIp: ip?.slice(0, 64) || null,
            },
            select: DRIVER_SELECT,
        });
        return this.view(updated);
    }

    /** Есть ли что-то из анкеты в чёрном списке. */
    private async blockedBy(d: { iin: string | null; phone: string | null; vehiclePlate: string | null }) {
        const or = [
            d.iin && { kind: 'IIN', value: d.iin },
            d.phone && { kind: 'PHONE', value: digitsOnly(d.phone) },
            d.vehiclePlate && { kind: 'PLATE', value: d.vehiclePlate },
        ].filter(Boolean) as { kind: string; value: string }[];
        if (!or.length) return null;
        return this.prisma.exchangeBlocklist.findFirst({ where: { OR: or }, select: { reason: true } });
    }

    /**
     * Отправить анкету. С ИП — допускается сразу. Без ИП — уходит парку.
     * Кто в чёрном списке — не проходит ни так, ни так.
     */
    async submit(userId: string) {
        const driver = await this.ownDriver(userId);
        this.assertEditable(driver);
        const missing = missingFor(driver);
        if (missing.length) throw new BadRequestException(`Не заполнено: ${missing.join(', ')}`);

        const blocked = await this.blockedBy(driver);
        if (blocked) {
            await this.prisma.exchangeDriver.update({
                where: { id: driver.id },
                data: { status: 'BLOCKED', blockedAt: new Date(), blockedReason: 'Ранее заблокирован на бирже' },
            });
            throw new ForbiddenException('Регистрация невозможна: вы ранее заблокированы на бирже');
        }

        const now = new Date();
        const updated = await this.prisma.exchangeDriver.update({
            where: { id: driver.id },
            data: driver.kind === 'IP'
                ? { status: 'APPROVED', submittedAt: now, reviewedAt: now, rejectReason: null }
                : { status: 'PENDING', submittedAt: now, rejectReason: null },
            select: DRIVER_SELECT,
        });
        return this.view(updated);
    }

    /**
     * Поменять данные после допуска: сменилась машина, новый телефон.
     *
     * Анкета возвращается на правку и снова проходит отправку: с ИП —
     * допуск сразу, как в первый раз; через парк — парк проверяет заново,
     * иначе после проверки можно было бы подменить машину или человека.
     * Пока рейс не закрыт — нельзя: заказчик видит машину из анкеты.
     */
    async reopen(userId: string) {
        const driver = await this.ownDriver(userId);
        if (driver.status === 'BLOCKED') throw new ForbiddenException('Вы заблокированы на бирже');
        if (EDITABLE.includes(driver.status)) return this.view(driver);
        if (driver.status !== 'APPROVED') throw new BadRequestException('Анкета на проверке у парка — дождитесь решения');

        const activeTrips = await this.prisma.order.count({
            where: { driverId: driver.userId, status: { in: ['ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING', 'PROBLEM'] } },
        });
        if (activeTrips) throw new BadRequestException('Сначала довезите текущий груз — во время рейса данные менять нельзя');

        const { count } = await this.prisma.exchangeDriver.updateMany({
            where: { id: driver.id, status: 'APPROVED' },
            data: { status: 'DRAFT', reviewedAt: null, reviewedById: null },
        });
        if (!count) throw new BadRequestException('Анкета уже изменилась — обновите экран');
        return this.view(await this.ownDriver(userId));
    }

    async addDocument(userId: string, kind: ExchangeDriverDocumentKind, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Файл не получен');
        assertAllowedUpload(file);
        const driver = await this.ownDriver(userId);
        this.assertEditable(driver);

        const fileKey = `uploads/exchange-drivers/${driver.id}/${randomUUID()}${safeExtension(file.originalname)}`;
        await storeExchangeFile(this.s3, fileKey, file);

        // Один документ каждого вида: новое фото заменяет прежнее.
        const previous = await this.prisma.exchangeDriverDocument.findMany({ where: { driverId: driver.id, kind }, select: { id: true, fileKey: true } });
        await this.prisma.exchangeDriverDocument.create({
            data: { driverId: driver.id, kind, fileKey, fileName: (file.originalname || 'фото').slice(0, 200), mimeType: file.mimetype, size: file.size },
        });
        if (previous.length) {
            await this.prisma.exchangeDriverDocument.deleteMany({ where: { id: { in: previous.map((p) => p.id) } } });
            for (const p of previous) await removeExchangeFile(this.s3, p.fileKey);
        }
        return this.me(userId);
    }

    async removeDocument(userId: string, documentId: string) {
        const driver = await this.ownDriver(userId);
        this.assertEditable(driver);
        const doc = await this.prisma.exchangeDriverDocument.findFirst({ where: { id: documentId, driverId: driver.id }, select: { id: true, fileKey: true } });
        if (!doc) throw new NotFoundException('Документ не найден');
        await this.prisma.exchangeDriverDocument.delete({ where: { id: doc.id } });
        await removeExchangeFile(this.s3, doc.fileKey);
        return this.me(userId);
    }

    async ownDocument(userId: string, documentId: string) {
        const doc = await this.prisma.exchangeDriverDocument.findFirst({
            where: { id: documentId, driver: { userId } },
            select: { fileKey: true, fileName: true, mimeType: true },
        });
        if (!doc) throw new NotFoundException('Документ не найден');
        return doc;
    }

    // ==================== парк (кабинет) ====================

    /** Дальше только парк: чужая компания водителей не видит. */
    /**
     * Вступить в парк по коду из приглашения: парк выбран, вид работы —
     * «через парк». Проверка парком и подпись договора — как обычно.
     */
    async joinParkByCode(userId: string, rawCode: string) {
        const driver = await this.ownDriver(userId);
        this.assertEditable(driver);
        const code = rawCode.trim().toUpperCase();
        const park = await this.prisma.company.findFirst({
            where: { parkInviteCode: code, isPark: true, isActive: true, exchangeAccess: true },
            select: { id: true },
        });
        if (!park) throw new BadRequestException('Такого кода нет — проверьте его или попросите у парка новую ссылку');
        const updated = await this.prisma.exchangeDriver.update({
            where: { id: driver.id },
            data: {
                kind: 'PARK',
                ipName: null,
                ipIin: null,
                park: { connect: { id: park.id } },
                // Договор подписывают с конкретным парком: другой парк — другой договор.
                ...(park.id !== driver.parkCompanyId ? { contractSignedAt: null } : {}),
            },
            select: DRIVER_SELECT,
        });
        return this.view(updated);
    }

    async assertPark(companyId: string) {
        const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { isPark: true } });
        if (!company?.isPark) throw new ForbiddenException('Ваша компания не парк биржи');
    }

    async parkDrivers(companyId: string, filter: ParkDriverFilter = 'pending') {
        await this.assertPark(companyId);
        const rows = await this.prisma.exchangeDriver.findMany({
            where: { parkCompanyId: companyId, status: { in: PARK_FILTER_STATUSES[filter] } },
            select: DRIVER_SELECT,
            orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
            take: 500,
        });
        const grouped = await this.prisma.exchangeDriver.groupBy({
            by: ['status'],
            where: { parkCompanyId: companyId, status: { not: 'DRAFT' } },
            _count: { _all: true },
        });
        const count = (s: ExchangeDriverStatus[] | undefined) =>
            grouped.filter((g) => !s || s.includes(g.status)).reduce((sum, g) => sum + g._count._all, 0);
        return {
            drivers: rows.map((r) => this.view(r)),
            counts: {
                pending: count(['PENDING']),
                approved: count(['APPROVED']),
                rejected: count(['REJECTED']),
                blocked: count(['BLOCKED']),
                all: count(undefined),
            },
        };
    }

    private async parkDriver(companyId: string, driverId: string) {
        await this.assertPark(companyId);
        const driver = await this.prisma.exchangeDriver.findFirst({
            where: { id: driverId, parkCompanyId: companyId, status: { not: 'DRAFT' } },
            select: DRIVER_SELECT,
        });
        if (!driver) throw new NotFoundException('Водитель не найден');
        return driver;
    }

    async parkDriverCard(companyId: string, driverId: string) {
        return this.view(await this.parkDriver(companyId, driverId));
    }

    /** Допустить. Только из «на проверке»: условное обновление, двое не допустят разом. */
    async approve(companyId: string, driverId: string, reviewerId: string) {
        await this.parkDriver(companyId, driverId);
        const { count } = await this.prisma.exchangeDriver.updateMany({
            where: { id: driverId, parkCompanyId: companyId, status: 'PENDING' },
            data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: reviewerId, rejectReason: null },
        });
        if (!count) throw new BadRequestException('Анкета уже не на проверке');
        return this.parkDriverCard(companyId, driverId);
    }

    /** Отказать — с причиной: водитель увидит её и сможет исправить. */
    async reject(companyId: string, driverId: string, reviewerId: string, reason: string) {
        await this.parkDriver(companyId, driverId);
        const { count } = await this.prisma.exchangeDriver.updateMany({
            where: { id: driverId, parkCompanyId: companyId, status: 'PENDING' },
            data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: reviewerId, rejectReason: reason.trim() },
        });
        if (!count) throw new BadRequestException('Анкета уже не на проверке');
        return this.parkDriverCard(companyId, driverId);
    }

    /**
     * Заблокировать за обман. Насовсем: ИИН, телефон и номер машины уходят
     * в чёрный список, и новая анкета с ними не пройдёт ни в одном парке.
     */
    async block(companyId: string, driverId: string, reviewerId: string, reason: string) {
        const driver = await this.parkDriver(companyId, driverId);
        if (driver.status === 'BLOCKED') throw new BadRequestException('Водитель уже заблокирован');
        const why = reason.trim();
        const entries = [
            driver.iin && { kind: 'IIN', value: driver.iin },
            driver.phone && { kind: 'PHONE', value: digitsOnly(driver.phone) },
            driver.vehiclePlate && { kind: 'PLATE', value: driver.vehiclePlate },
        ].filter(Boolean) as { kind: string; value: string }[];

        await this.prisma.$transaction([
            this.prisma.exchangeDriver.update({
                where: { id: driverId },
                data: { status: 'BLOCKED', blockedAt: new Date(), blockedReason: why, reviewedById: reviewerId },
            }),
            ...entries.map((e) => this.prisma.exchangeBlocklist.upsert({
                where: { kind_value: e },
                create: { ...e, reason: why, createdById: reviewerId },
                update: {},
            })),
        ]);
        return this.parkDriverCard(companyId, driverId);
    }

    async parkDocument(companyId: string, documentId: string) {
        await this.assertPark(companyId);
        const doc = await this.prisma.exchangeDriverDocument.findFirst({
            where: { id: documentId, driver: { parkCompanyId: companyId } },
            select: { fileKey: true, fileName: true, mimeType: true },
        });
        if (!doc) throw new NotFoundException('Документ не найден');
        return doc;
    }

    // ==================== владелец платформы ====================

    async adminCompanies(q?: string) {
        const query = q?.trim();
        return this.prisma.company.findMany({
            where: {
                isExternal: false,
                ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { bin: { contains: query } }] } : {}),
            },
            select: { id: true, name: true, bin: true, isPark: true, exchangeAccess: true, isActive: true, _count: { select: { exchangeDrivers: true } } },
            orderBy: [{ exchangeAccess: 'desc' }, { isPark: 'desc' }, { name: 'asc' }],
            take: 100,
        });
    }

    async setPark(companyId: string, isPark: boolean) {
        const company = await this.prisma.company.findFirst({ where: { id: companyId, isExternal: false }, select: { id: true } });
        if (!company) throw new NotFoundException('Компания не найдена');
        return this.prisma.company.update({
            where: { id: companyId },
            data: { isPark },
            select: { id: true, name: true, bin: true, isPark: true, exchangeAccess: true },
        });
    }

    /**
     * Открыть компании биржу или закрыть. Пока биржу проверяют, её видят
     * только отмеченные компании и водители их парков. Закрыли — заявки
     * компании пропадают с ленты сами (лента смотрит на эту отметку), а
     * выставленными они остаются: вернули доступ — вернулись и они.
     */
    async setExchangeAccess(companyId: string, exchangeAccess: boolean) {
        const company = await this.prisma.company.findFirst({ where: { id: companyId, isExternal: false }, select: { id: true } });
        if (!company) throw new NotFoundException('Компания не найдена');
        return this.prisma.company.update({
            where: { id: companyId },
            data: { exchangeAccess },
            select: { id: true, name: true, bin: true, isPark: true, exchangeAccess: true },
        });
    }
}
