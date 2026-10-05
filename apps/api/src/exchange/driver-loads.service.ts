import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ExchangeLoadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { kzToday } from '../common/utils/business-date';
import { loadNumber } from './exchange.service';
import { removeExchangeFile } from './exchange-files';

/** Рейс водителя идёт: взял груз и ещё не довёз. */
const ACTIVE: ExchangeLoadStatus[] = ['TAKEN', 'IN_TRANSIT'];

const FEED_SELECT = {
    id: true, seq: true, status: true,
    originCityName: true, originAddress: true, destinationCityName: true, destinationAddress: true,
    loadingDate: true, loadingTime: true, bodyType: true, cargoDescription: true,
    weightKg: true, volumeM3: true, requirements: true, price: true,
    takenAt: true, loadedAt: true, deliveredAt: true, driverId: true,
    company: { select: { name: true } },
    photos: { select: { id: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ExchangeLoadSelect;

type FeedRow = Prisma.ExchangeLoadGetPayload<{ select: typeof FEED_SELECT }>;

/** Кому звонить по грузу — сотрудник компании, который его поставил. */
function contactOf(person: { firstName: string | null; lastName: string | null; phone: string | null }) {
    return {
        name: [person.firstName, person.lastName].filter(Boolean).join(' ') || null,
        phone: person.phone || null,
    };
}

/**
 * Биржа со стороны водителя: лента грузов, «Беру», свой рейс.
 *
 * Видит и берёт грузы только допущенный водитель: с ИП — сразу после
 * анкеты, без ИП — после проверки парком.
 */
@Injectable()
export class ExchangeDriverLoadsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
    ) {}

    private view(row: FeedRow, withContact?: { phone: string | null; name: string | null }) {
        const { seq, company, photos, driverId: _driverId, ...rest } = row;
        return {
            ...rest,
            number: loadNumber(seq),
            companyName: company?.name ?? null,
            photoIds: photos.map((p) => p.id),
            contact: withContact ?? null,
        };
    }

    /** Водитель допущен к грузам — иначе объясняем, что мешает. */
    async approvedDriver(userId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({
            where: { userId },
            select: { id: true, status: true, kind: true, tripsCompleted: true },
        });
        if (!driver) throw new ForbiddenException('Сначала заполните анкету водителя');
        if (driver.status === 'BLOCKED') throw new ForbiddenException('Вы заблокированы на бирже');
        if (driver.status !== 'APPROVED') {
            throw new ForbiddenException(
                driver.status === 'PENDING' ? 'Анкета на проверке у парка — грузы откроются после допуска'
                    : 'Отправьте анкету — грузы откроются после допуска',
            );
        }
        return driver;
    }

    /** Лента: грузы, которые ищут машину, с сегодняшнего дня и дальше. */
    async feed(userId: string, bodyType?: string) {
        const driver = await this.approvedDriver(userId);
        const rows = await this.prisma.exchangeLoad.findMany({
            where: {
                status: 'OPEN',
                loadingDate: { gte: kzToday() },
                declines: { none: { driverId: driver.id } },
                ...(bodyType ? { bodyType } : {}),
            },
            select: FEED_SELECT,
            orderBy: [{ loadingDate: 'asc' }, { seq: 'asc' }],
            take: 200,
        });
        return rows.map((r) => this.view(r));
    }

    /**
     * Карточка груза. Чужой взятый груз не показываем; контакт отправителя —
     * только тому, кто груз взял: до этого звонить незачем.
     */
    async card(userId: string, loadId: string) {
        const driver = await this.approvedDriver(userId);
        const row = await this.prisma.exchangeLoad.findFirst({
            where: { id: loadId, OR: [{ status: 'OPEN' }, { driverId: driver.id }] },
            select: { ...FEED_SELECT, createdBy: { select: { firstName: true, lastName: true, phone: true } } },
        });
        if (!row) throw new NotFoundException('Груз уже недоступен — его взял другой водитель или сняли с биржи');
        const { createdBy, ...rest } = row;
        const mine = row.driverId === driver.id;
        return this.view(rest, mine ? contactOf(createdBy) : undefined);
    }

    async photo(userId: string, photoId: string) {
        const driver = await this.approvedDriver(userId);
        const photo = await this.prisma.exchangeLoadPhoto.findFirst({
            where: { id: photoId, load: { OR: [{ status: 'OPEN' }, { driverId: driver.id }] } },
            select: { fileKey: true, fileName: true, mimeType: true },
        });
        if (!photo) throw new NotFoundException('Фото недоступно');
        return photo;
    }

    /**
     * «Беру». Кто первый нажал, тот и везёт: условное обновление, второй
     * водитель получит «уже взяли». Один рейс за раз — сначала довезти.
     */
    async take(userId: string, loadId: string) {
        const driver = await this.approvedDriver(userId);
        const active = await this.prisma.exchangeLoad.findFirst({
            where: { driverId: driver.id, status: { in: ACTIVE } },
            select: { seq: true },
        });
        if (active) throw new BadRequestException(`Сначала довезите груз ${loadNumber(active.seq)}`);

        const { count } = await this.prisma.exchangeLoad.updateMany({
            where: { id: loadId, status: 'OPEN', loadingDate: { gte: kzToday() } },
            data: { status: 'TAKEN', driverId: driver.id, takenAt: new Date() },
        });
        if (!count) throw new BadRequestException('Груз уже взял другой водитель или его сняли с биржи');
        return this.card(userId, loadId);
    }

    /** «Не беру» — с причиной; груз пропадает из ленты этого водителя. */
    async decline(userId: string, loadId: string, reason: string) {
        const driver = await this.approvedDriver(userId);
        const load = await this.prisma.exchangeLoad.findFirst({ where: { id: loadId, status: 'OPEN' }, select: { id: true } });
        if (!load) throw new NotFoundException('Груз уже недоступен');
        await this.prisma.exchangeLoadDecline.create({ data: { loadId, driverId: driver.id, reason: reason.trim() } });
        return { ok: true };
    }

    /** Мои рейсы: идущий — первым, потом довезённые. */
    async trips(userId: string) {
        const driver = await this.approvedDriver(userId);
        // Все рейсы здесь — его собственные: телефон отправителя открыт,
        // чтобы позвонить с экрана рейса, не заходя в карточку.
        const rows = await this.prisma.exchangeLoad.findMany({
            where: { driverId: driver.id },
            select: { ...FEED_SELECT, createdBy: { select: { firstName: true, lastName: true, phone: true } } },
            orderBy: [{ takenAt: 'desc' }],
            take: 100,
        });
        return rows
            .map(({ createdBy, ...r }) => this.view(r, contactOf(createdBy)))
            .sort((a, b) => Number(ACTIVE.includes(b.status)) - Number(ACTIVE.includes(a.status)));
    }

    /**
     * Шаг рейса: «Погрузился» (взят → в пути) и «Доставил» (в пути →
     * доставлен). Довёз — счётчик рейсов растёт: от него зависит доверие.
     */
    async advance(userId: string, loadId: string, to: 'IN_TRANSIT' | 'DELIVERED') {
        const driver = await this.approvedDriver(userId);
        const from: ExchangeLoadStatus = to === 'IN_TRANSIT' ? 'TAKEN' : 'IN_TRANSIT';
        const now = new Date();
        const { count } = await this.prisma.exchangeLoad.updateMany({
            where: { id: loadId, driverId: driver.id, status: from },
            data: to === 'IN_TRANSIT' ? { status: to, loadedAt: now } : { status: to, deliveredAt: now },
        });
        if (!count) {
            throw new BadRequestException(to === 'IN_TRANSIT' ? 'Этот рейс уже в пути или не ваш' : 'Сначала отметьте погрузку');
        }
        if (to === 'DELIVERED') {
            await this.prisma.exchangeDriver.update({ where: { id: driver.id }, data: { tripsCompleted: { increment: 1 } } });
        }
        return this.card(userId, loadId);
    }

    /**
     * Сняться с рейса — только до погрузки и с причиной. Груз возвращается
     * на биржу, отказ после взятия записывается: парк видит, кто подводит.
     */
    async release(userId: string, loadId: string, reason: string) {
        const driver = await this.approvedDriver(userId);
        const { count } = await this.prisma.exchangeLoad.updateMany({
            where: { id: loadId, driverId: driver.id, status: 'TAKEN' },
            data: { status: 'OPEN', driverId: null, takenAt: null },
        });
        if (!count) throw new BadRequestException('Сняться можно только до погрузки');
        await this.prisma.exchangeLoadDecline.create({
            data: { loadId, driverId: driver.id, reason: reason.trim(), afterTaking: true },
        });
        return { ok: true };
    }

    /**
     * Удалить аккаунт — требование Google Play: удалить можно из самого
     * приложения. Личные данные и фото документов стираются, история
     * рейсов остаётся без имени. Чёрный список не трогаем: заблокированный
     * не вернётся, удалив аккаунт.
     */
    async deleteAccount(userId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({
            where: { userId },
            select: { id: true, documents: { select: { id: true, fileKey: true } } },
        });
        if (driver) {
            const active = await this.prisma.exchangeLoad.findFirst({
                where: { driverId: driver.id, status: { in: ACTIVE } },
                select: { seq: true },
            });
            if (active) throw new BadRequestException(`Сначала довезите груз ${loadNumber(active.seq)}`);
            await this.prisma.exchangeDriverDocument.deleteMany({ where: { driverId: driver.id } });
            for (const doc of driver.documents) await removeExchangeFile(this.s3, doc.fileKey);
            await this.prisma.exchangeDriver.update({
                where: { id: driver.id },
                data: {
                    lastName: null, firstName: null, middleName: null, iin: null, phone: null,
                    ipName: null, ipIin: null, vehiclePlate: null, contractSignedDevice: null, contractSignedIp: null,
                },
            });
        }
        await this.prisma.$transaction([
            this.prisma.session.deleteMany({ where: { userId } }),
            this.prisma.user.update({
                where: { id: userId },
                data: { isActive: false, email: null, googleId: null, firstName: 'Удалён', lastName: '', phone: '' },
            }),
        ]);
        return { ok: true };
    }
}
