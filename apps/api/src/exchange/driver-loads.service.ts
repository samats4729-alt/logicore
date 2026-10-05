import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { removeExchangeFile } from './exchange-files';
import { EXCHANGE_ORDER_SELECT, ON_EXCHANGE, byLoadingDate, exchangeView, matches, notPast } from './exchange-orders';

/** Рейс идёт: водитель назначен и ещё не довёз. */
const ACTIVE_ORDER: OrderStatus[] = [
    OrderStatus.ASSIGNED, OrderStatus.EN_ROUTE_PICKUP, OrderStatus.AT_PICKUP, OrderStatus.LOADING,
    OrderStatus.IN_TRANSIT, OrderStatus.AT_DELIVERY, OrderStatus.UNLOADING, OrderStatus.PROBLEM,
];

/**
 * Биржа со стороны водителя: заявки, которые ищут исполнителя.
 *
 * Видит их только допущенный водитель: с ИП — сразу после анкеты, без ИП —
 * после проверки парком. Отклик с ценой — следующий шаг.
 */
@Injectable()
export class ExchangeDriverLoadsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
    ) {}

    /** Водитель допущен к бирже — иначе объясняем, что мешает. */
    async approvedDriver(userId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({
            where: { userId },
            select: { id: true, status: true, kind: true, tripsCompleted: true },
        });
        if (!driver) throw new ForbiddenException('Сначала заполните анкету водителя');
        if (driver.status === 'BLOCKED') throw new ForbiddenException('Вы заблокированы на бирже');
        if (driver.status !== 'APPROVED') {
            throw new ForbiddenException(
                driver.status === 'PENDING' ? 'Анкета на проверке у парка — заявки откроются после допуска'
                    : 'Отправьте анкету — заявки откроются после допуска',
            );
        }
        return driver;
    }

    /** Лента: заявки на бирже с сегодняшней погрузкой и дальше, ближайшие сверху. */
    async feed(userId: string, bodyType?: string) {
        await this.approvedDriver(userId);
        const rows = await this.prisma.order.findMany({
            where: ON_EXCHANGE,
            select: EXCHANGE_ORDER_SELECT,
            orderBy: { exchangePublishedAt: 'desc' },
            take: 300,
        });
        return rows.filter((r) => notPast(r)).map(exchangeView).filter((v) => matches(v, { bodyType })).sort(byLoadingDate);
    }

    /** Заявка с биржи. Сняли или нашли исполнителя — говорим прямо. */
    async card(userId: string, orderId: string) {
        await this.approvedDriver(userId);
        const row = await this.prisma.order.findFirst({ where: { id: orderId, ...ON_EXCHANGE }, select: EXCHANGE_ORDER_SELECT });
        if (!row) throw new NotFoundException('Заявка уже снята с биржи или у неё появился исполнитель');
        return exchangeView(row);
    }

    /**
     * Удалить аккаунт — требование Google Play: из самого приложения.
     *
     * Стираем личное (ФИО, ИИН, телефон, фото документов), закрываем вход.
     * Рейсы остаются у заказчиков — без имени водителя. Пока рейс идёт,
     * удалять нельзя: заказчик ждёт груз.
     */
    async deleteAccount(userId: string) {
        const active = await this.prisma.order.findFirst({
            where: { driverId: userId, status: { in: ACTIVE_ORDER } },
            select: { orderNumber: true },
        });
        if (active) throw new BadRequestException(`Сначала довезите груз по заявке ${active.orderNumber}`);

        const driver = await this.prisma.exchangeDriver.findUnique({
            where: { userId },
            select: { id: true, documents: { select: { id: true, fileKey: true } } },
        });
        if (driver) {
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
