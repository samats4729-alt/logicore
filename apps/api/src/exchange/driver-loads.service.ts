import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { removeExchangeFile } from './exchange-files';
import { EXCHANGE_ORDER_SELECT, ExchangeOrderRow, ON_EXCHANGE, byLoadingDate, exchangeView, matches, notPast } from './exchange-orders';
import { PUBLISHER_HAS_ACCESS } from './exchange-access';
import { ExchangeSettlementService } from './settlement.service';

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
        private readonly settlement: ExchangeSettlementService,
    ) {}

    /** Водитель допущен к бирже — иначе объясняем, что мешает. */
    async approvedDriver(userId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({
            where: { userId },
            select: { id: true, status: true, kind: true, tripsCompleted: true, parkCompanyId: true, park: { select: { exchangeAccess: true } } },
        });
        if (!driver) throw new ForbiddenException('Сначала заполните анкету водителя');
        if (driver.status === 'BLOCKED') throw new ForbiddenException('Вы заблокированы на бирже');
        if (driver.status !== 'APPROVED') {
            throw new ForbiddenException(
                driver.status === 'PENDING' ? 'Анкета на проверке у парка — заявки откроются после допуска'
                    : 'Отправьте анкету — заявки откроются после допуска',
            );
        }
        // Пока биржу проверяют, грузы видят только водители парков, которым
        // её открыли. Водитель со своим ИП парка не имеет — ему тоже рано.
        if (driver.kind !== 'PARK' || !driver.park?.exchangeAccess) {
            throw new ForbiddenException('Биржа пока работает в тестовом режиме — заявки видят водители подключённых парков');
        }
        return driver as typeof driver & { parkCompanyId: string };
    }

    /**
     * Заявка глазами водителя парка. Цена компании на бирже — база: столько
     * водитель получит на руки вместе с топливом, а налоги, комиссии и НДС
     * парк прибавляет сверху (владелец, 15.10.2026: «сверху прибавляется»).
     */
    private forDriver(base: Awaited<ReturnType<ExchangeSettlementService['driverBase']>>, row: ExchangeOrderRow) {
        const view = exchangeView(row);
        const ctx = this.settlement.contextFromRow(base, row);
        const calc = view.price != null ? this.settlement.tryDriverTotal(ctx, view.price) : null;
        return {
            ...view,
            price: calc ? calc.driverTotal : null,
            /** Топливо по оценке — входит в сумму на руки; заправка через парк, чеки на БИН парка. */
            fuelEstimate: ctx.fuel || null,
            distanceKm: ctx.distanceKm,
            /**
             * Из чего сложилась сумма на руки (владелец, 15.10.2026: «комиссия и
             * общая сумма — чтобы было понятно, за что высчитывают»). Это
             * меняет решение от 12.10, когда цену компании водителю не
             * показывали: теперь он видит её и всё, что из неё уходит.
             */
            breakdown: calc ? {
                customerPrice: calc.customerPrice,
                platformPct: calc.rates.platformPct,
                platformFee: calc.platformFee,
                parkPct: calc.rates.parkPct,
                parkFee: calc.parkFee,
                /** Налоги и взносы за водителя: ОПВ, ВОСМС, ИПН и социальные отчисления — платит парк. */
                taxes: (Math.round(calc.opv * 100) + Math.round(calc.vosms * 100) + Math.round(calc.ipn * 100) + Math.round(calc.so * 100)) / 100,
                opv: calc.opv,
                vosms: calc.vosms,
                ipn: calc.ipn,
                so: calc.so,
                /** НДС сверху — только если парк плательщик НДС; иначе 0. */
                vat: calc.vat,
                vatPct: calc.rates.vatPct ?? 0,
                driverTotal: calc.driverTotal,
                fuel: calc.fuel,
                /** Бухгалтер парка ещё не подтвердил расчёт — суммы предварительные. */
                preliminary: calc.preliminary,
            } : null,
        };
    }

    /** Лента: заявки на бирже с сегодняшней погрузкой и дальше, ближайшие сверху. */
    async feed(userId: string, bodyType?: string) {
        const driver = await this.approvedDriver(userId);
        const base = await this.settlement.driverBase(driver);
        const rows = await this.prisma.order.findMany({
            where: { ...ON_EXCHANGE, AND: [PUBLISHER_HAS_ACCESS] },
            select: EXCHANGE_ORDER_SELECT,
            orderBy: { exchangePublishedAt: 'desc' },
            take: 300,
        });
        return rows.filter((r) => notPast(r)).map((r) => this.forDriver(base, r)).filter((v) => matches(v, { bodyType })).sort(byLoadingDate);
    }

    /** Заявка с биржи. Сняли или нашли исполнителя — говорим прямо. */
    async card(userId: string, orderId: string) {
        const driver = await this.approvedDriver(userId);
        const row = await this.prisma.order.findFirst({ where: { id: orderId, ...ON_EXCHANGE, AND: [PUBLISHER_HAS_ACCESS] }, select: EXCHANGE_ORDER_SELECT });
        if (!row) throw new NotFoundException('Заявка уже снята с биржи или у неё появился исполнитель');
        return this.forDriver(await this.settlement.driverBase(driver), row);
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
