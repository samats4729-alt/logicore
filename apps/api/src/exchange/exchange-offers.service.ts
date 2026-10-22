import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { kzToday } from '../common/utils/business-date';
import { MakeOfferDto } from './dto/exchange-order.dto';
import { EXCHANGE_ORDER_SELECT, ON_EXCHANGE, exchangeView, managerOf } from './exchange-orders';
import { PUBLISHER_HAS_ACCESS, soleTraderBlock } from './exchange-access';
import { ExchangeDriverLoadsService } from './driver-loads.service';
import { ExchangeSettlementService, SettlementCalc } from './settlement.service';
import { BlockCandidates, findBlock } from '../blocklist/blocklist';

/** Что о водителе видит компания в отклике — чтобы решить, кого выбрать. */
const DRIVER_IN_OFFER = {
    id: true, userId: true, kind: true, status: true,
    lastName: true, firstName: true, middleName: true, phone: true,
    ipName: true, vehiclePlate: true, vehicleBodyType: true, vehicleCapacityKg: true,
    tripsCompleted: true, createdAt: true, parkCompanyId: true,
    park: { select: { id: true, name: true } },
} satisfies Prisma.ExchangeDriverSelect;

const OFFER_SELECT = {
    id: true, orderId: true, status: true, price: true, agreed: true, readyDate: true, comment: true,
    driverTotal: true, calc: true,
    createdAt: true, updatedAt: true, decidedAt: true,
    driver: { select: DRIVER_IN_OFFER },
    company: { select: { id: true, name: true, bin: true, phone: true } },
} satisfies Prisma.ExchangeOfferSelect;

type OfferRow = Prisma.ExchangeOfferGetPayload<{ select: typeof OFFER_SELECT }>;

/** Отклик в том виде, в каком его видит компания, выставившая заявку. */
function offerView(o: OfferRow) {
    const d = o.driver;
    return {
        id: o.id,
        status: o.status,
        price: Number(o.price),
        agreed: o.agreed,
        readyDate: o.readyDate,
        comment: o.comment,
        createdAt: o.createdAt,
        /** Последнее изменение — водитель или перевозчик поменял цену, подачу, комментарий. */
        updatedAt: o.updatedAt,
        decidedAt: o.decidedAt,
        /** Кто откликнулся: водитель (с ИП или через парк) или компания-перевозчик. */
        kind: d ? (d.kind === 'IP' ? 'DRIVER_IP' : 'DRIVER_PARK') : 'COMPANY',
        name: d ? [d.lastName, d.firstName, d.middleName].filter(Boolean).join(' ') || 'Водитель' : o.company?.name ?? 'Компания',
        phone: d ? d.phone : o.company?.phone ?? null,
        driver: d ? {
            ipName: d.ipName,
            parkName: d.park?.name ?? null,
            vehiclePlate: d.vehiclePlate,
            vehicleBodyType: d.vehicleBodyType,
            vehicleCapacityKg: d.vehicleCapacityKg,
            tripsCompleted: d.tripsCompleted,
            since: d.createdAt,
        } : null,
        company: o.company ? { name: o.company.name, bin: o.company.bin } : null,
    };
}

export type OfferView = ReturnType<typeof offerView>;

/** Свой отклик — как его видит откликнувшийся: цена, статус, когда. */
function ownOfferView(o: { id: string; status: string; price: Prisma.Decimal; agreed: boolean; readyDate: Date | null; comment: string | null; updatedAt: Date }) {
    return {
        id: o.id, status: o.status, price: Number(o.price), agreed: o.agreed,
        readyDate: o.readyDate, comment: o.comment, updatedAt: o.updatedAt,
    };
}

/**
 * Свой отклик глазами водителя парка: его цена — сумма на руки, а не цена
 * для компании (у отклика по прежнему расчёту суммы на руки нет — цена как есть).
 */
function driverOwnView(o: Parameters<typeof ownOfferView>[0] & { driverTotal: Prisma.Decimal | null }) {
    return { ...ownOfferView(o), price: o.driverTotal != null ? Number(o.driverTotal) : Number(o.price) };
}

/** Заявка, на которую можно откликнуться: на бирже, без исполнителя. */
const ORDER_FOR_OFFER = {
    id: true, orderNumber: true, exchangePrice: true,
    customerCompanyId: true, forwarderId: true, subForwarderId: true,
} satisfies Prisma.OrderSelect;

/**
 * Отклики на заявки биржи и выбор исполнителя.
 *
 * Откликается водитель биржи (в приложении) или компания-перевозчик (на
 * сайте): «согласен за вашу цену» или своя цена и когда подаст машину.
 * Компания, выставившая заявку, видит отклики и выбирает одного:
 *  - компания-перевозчик становится суб-экспедитором рейса со своей ценой —
 *    видит заявку у себя и назначает своего водителя, как при обычной
 *    передаче рейса партнёру;
 *  - водитель с ИП — водитель рейса, сам себе перевозчик;
 *  - водитель без ИП — водитель рейса, а перевозчик по документам — его парк.
 * Остальным откликам — «выбрали другого», заявка уходит с биржи.
 */
@Injectable()
export class ExchangeOffersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly drivers: ExchangeDriverLoadsService,
        private readonly settlement: ExchangeSettlementService,
    ) {}

    private async openOrder(orderId: string) {
        // Отклик — только на заявку компании, которой открыта биржа.
        const order = await this.prisma.order.findFirst({ where: { id: orderId, ...ON_EXCHANGE, AND: [PUBLISHER_HAS_ACCESS] }, select: ORDER_FOR_OFFER });
        if (!order) throw new NotFoundException('Заявка уже снята с биржи или у неё появился исполнитель');
        return order;
    }

    /**
     * Компания, выставившая заявку, занесла откликающегося в свой чёрный
     * список (F5/S2) — отклик не принимаем. Причину не называем: это
     * внутренняя запись той компании.
     */
    private async assertNotBlockedBy(order: { subForwarderId: string | null; forwarderId: string | null; customerCompanyId: string | null }, candidates: BlockCandidates) {
        const owner = managerOf(order);
        if (owner && await findBlock(this.prisma, owner, candidates)) {
            throw new ForbiddenException('Откликнуться на эту заявку нельзя: компания, которая её выставила, не принимает ваши отклики');
        }
    }

    /** Цена отклика: согласен — цена компании; своя — обязательна. */
    private priceOf(order: { exchangePrice: Prisma.Decimal | null }, dto: MakeOfferDto): number {
        if (dto.agree) {
            if (order.exchangePrice == null) throw new BadRequestException('У заявки цена договорная — предложите свою');
            return Number(order.exchangePrice);
        }
        if (!dto.price || dto.price <= 0) throw new BadRequestException('Укажите свою цену');
        return dto.price;
    }

    private readyDateOf(dto: MakeOfferDto): Date | null {
        if (!dto.readyDate) return null;
        const date = new Date(`${dto.readyDate.slice(0, 10)}T00:00:00Z`);
        if (Number.isNaN(date.getTime())) throw new BadRequestException('Дата подачи машины указана с ошибкой');
        if (date < kzToday()) throw new BadRequestException('Дата подачи машины уже прошла');
        return date;
    }

    // ==================== водитель ====================

    /**
     * Водитель парка откликается суммой на руки (без топлива — его оплачивает
     * парк) или соглашается на цену компании — тогда на руки = её сумма минус
     * топливо и ОПВ (схема шефа, 16.10.2026). В отклик пишем цену для компании
     * — с налогами парка, 10 % комиссии и НДС — и весь расчёт на этот момент.
     */
    private async driverCalc(driver: { id: string; parkCompanyId: string }, order: { id: string; exchangePrice: Prisma.Decimal | null }, dto: MakeOfferDto): Promise<SettlementCalc> {
        const ctx = await this.settlement.context(driver, order.id);
        if (dto.agree) {
            if (order.exchangePrice == null) throw new BadRequestException('У заявки цена договорная — предложите свою');
            const calc = this.settlement.tryBase(ctx, Number(order.exchangePrice));
            if (!calc) throw new BadRequestException('Цена компании не покрывает топливо по расчёту — предложите свою сумму');
            return calc;
        }
        if (!dto.price || dto.price <= 0) throw new BadRequestException('Укажите, сколько хотите получить на руки');
        return this.settlement.byOnHand(ctx, dto.price);
    }

    async offerAsDriver(userId: string, orderId: string, dto: MakeOfferDto) {
        const driver = await this.drivers.approvedDriver(userId);
        const order = await this.openOrder(orderId);
        const who = await this.prisma.exchangeDriver.findUnique({
            where: { id: driver.id },
            select: { iin: true, phone: true, vehiclePlate: true, park: { select: { bin: true } } },
        });
        await this.assertNotBlockedBy(order, {
            binIin: [who?.iin, who?.park?.bin], phones: [who?.phone], plates: [who?.vehiclePlate],
        });
        // Водитель парка — по новому расчёту; со своим ИП — цена как названа.
        const calc = driver.kind === 'PARK' && driver.parkCompanyId ? await this.driverCalc(driver, order, dto) : null;
        const data = {
            status: 'ACTIVE' as const,
            price: calc ? calc.customerPrice : this.priceOf(order, dto),
            driverTotal: calc ? calc.driverTotal : null,
            calc: calc ? (calc as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            agreed: !!dto.agree,
            readyDate: this.readyDateOf(dto),
            comment: dto.comment?.trim() || null,
            createdById: userId,
            decidedAt: null,
        };
        const offer = await this.prisma.exchangeOffer.upsert({
            where: { orderId_driverId: { orderId: order.id, driverId: driver.id } },
            create: { orderId: order.id, driverId: driver.id, ...data },
            update: data,
        });
        return driverOwnView(offer);
    }

    async withdrawAsDriver(userId: string, orderId: string) {
        const driver = await this.drivers.approvedDriver(userId);
        const { count } = await this.prisma.exchangeOffer.updateMany({
            where: { orderId, driverId: driver.id, status: 'ACTIVE' },
            data: { status: 'WITHDRAWN' },
        });
        if (!count) throw new BadRequestException('Отклика уже нет — компания могла принять решение');
        return { ok: true };
    }

    /** Свой отклик водителя на заявку — для карточки в приложении. */
    async driverOffer(userId: string, orderId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({ where: { userId }, select: { id: true } });
        if (!driver) return null;
        const offer = await this.prisma.exchangeOffer.findUnique({ where: { orderId_driverId: { orderId, driverId: driver.id } } });
        return offer ? driverOwnView(offer) : null;
    }

    /** Свои отклики водителя — на какие заявки откликнулся и что решили. */
    async driverOffers(userId: string) {
        const driver = await this.drivers.approvedDriver(userId);
        const rows = await this.prisma.exchangeOffer.findMany({
            where: { driverId: driver.id },
            orderBy: { updatedAt: 'desc' },
            take: 50,
            select: {
                id: true, status: true, price: true, driverTotal: true, agreed: true, readyDate: true, comment: true, updatedAt: true,
                order: {
                    select: {
                        id: true, orderNumber: true, status: true,
                        routePoints: {
                            select: { pointType: true, location: { select: { city: true, cityRecord: { select: { name: true } } } } },
                            orderBy: { sequence: 'asc' },
                        },
                    },
                },
            },
        });
        const city = (p?: { location: { city: string | null; cityRecord: { name: string } | null } }) =>
            p ? p.location.cityRecord?.name || p.location.city || '—' : '—';
        return rows.map((r) => ({
            ...driverOwnView(r),
            orderId: r.order.id,
            orderNumber: r.order.orderNumber,
            /** Где рейс сейчас: «Вас выбрали» не висит над лентой, когда рейс уже довезён или отменён. */
            orderStatus: r.order.status,
            from: city(r.order.routePoints.find((p) => p.pointType !== 'DELIVERY')),
            to: city([...r.order.routePoints].reverse().find((p) => p.pointType === 'DELIVERY')),
        }));
    }

    /** На какие заявки водитель уже откликнулся — для отметки в ленте. */
    async driverOfferStatuses(userId: string): Promise<Record<string, string>> {
        const driver = await this.prisma.exchangeDriver.findUnique({ where: { userId }, select: { id: true } });
        if (!driver) return {};
        const rows = await this.prisma.exchangeOffer.findMany({
            where: { driverId: driver.id, status: { in: ['ACTIVE', 'ACCEPTED', 'REJECTED'] } },
            select: { orderId: true, status: true },
        });
        return Object.fromEntries(rows.map((r) => [r.orderId, r.status]));
    }

    // ==================== компания-перевозчик ====================

    async offerAsCompany(companyId: string, userId: string, orderId: string, dto: MakeOfferDto) {
        // ИП в исполнении на бирже не участвует — только через парк или приложение (P7).
        const soleTrader = await soleTraderBlock(this.prisma, companyId);
        if (soleTrader) throw new ForbiddenException(soleTrader);
        // Парк откликается, как любой перевозчик: он и сам возит (владелец, 15.10.2026).
        const order = await this.openOrder(orderId);
        if ([order.customerCompanyId, order.forwarderId, order.subForwarderId].includes(companyId)) {
            throw new BadRequestException('Это ваша заявка — откликаться на неё не нужно');
        }
        const me = await this.prisma.company.findUnique({ where: { id: companyId }, select: { bin: true, phone: true } });
        await this.assertNotBlockedBy(order, { binIin: [me?.bin], phones: [me?.phone] });
        const data = {
            status: 'ACTIVE' as const,
            price: this.priceOf(order, dto),
            agreed: !!dto.agree,
            readyDate: this.readyDateOf(dto),
            comment: dto.comment?.trim() || null,
            createdById: userId,
            decidedAt: null,
        };
        const offer = await this.prisma.exchangeOffer.upsert({
            where: { orderId_companyId: { orderId: order.id, companyId } },
            create: { orderId: order.id, companyId, ...data },
            update: data,
        });
        return ownOfferView(offer);
    }

    async withdrawAsCompany(companyId: string, orderId: string) {
        const { count } = await this.prisma.exchangeOffer.updateMany({
            where: { orderId, companyId, status: 'ACTIVE' },
            data: { status: 'WITHDRAWN' },
        });
        if (!count) throw new BadRequestException('Отклика уже нет — компания могла принять решение');
        return { ok: true };
    }

    async companyOffer(companyId: string, orderId: string) {
        const offer = await this.prisma.exchangeOffer.findUnique({ where: { orderId_companyId: { orderId, companyId } } });
        return offer ? ownOfferView(offer) : null;
    }

    /** На какие заявки компания уже откликнулась — для отметки в списке биржи. */
    async companyOfferedOrderIds(companyId: string): Promise<Record<string, string>> {
        const rows = await this.prisma.exchangeOffer.findMany({
            where: { companyId, status: { in: ['ACTIVE', 'ACCEPTED', 'REJECTED'] } },
            select: { orderId: true, status: true },
        });
        return Object.fromEntries(rows.map((r) => [r.orderId, r.status]));
    }

    // ==================== выбор исполнителя ====================

    /** Заявка компании, выставившей её на биржу, — иначе отклики не её дело. */
    private async managedOrder(companyId: string, orderId: string) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, OR: [{ customerCompanyId: companyId }, { forwarderId: companyId }, { subForwarderId: companyId }] },
            select: { ...ORDER_FOR_OFFER, status: true },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');
        if (managerOf(order) !== companyId) throw new ForbiddenException('Отклики видит компания, которая выставила заявку на биржу');
        return order;
    }

    /** Отклики на свою заявку: сначала ждущие решения, дешевле — выше. */
    async offersForOrder(companyId: string, orderId: string) {
        await this.managedOrder(companyId, orderId);
        const rows = await this.prisma.exchangeOffer.findMany({
            where: { orderId, status: { in: ['ACTIVE', 'ACCEPTED'] } },
            select: OFFER_SELECT,
            orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
        });
        return rows.map(offerView);
    }

    /**
     * Отклики на все свои заявки на бирже — новые сверху (владелец, 15.10.2026:
     * вкладка «Предложения» на бирже и уведомления о новых откликах). Только
     * ждущие решения: выбранные и отклонённые уже не предложение.
     */
    async incomingOffers(companyId: string) {
        const orders = await this.prisma.order.findMany({
            where: {
                ...ON_EXCHANGE,
                OR: [
                    { subForwarderId: companyId },
                    { subForwarderId: null, forwarderId: companyId },
                    { subForwarderId: null, forwarderId: null, customerCompanyId: companyId },
                ],
            },
            select: EXCHANGE_ORDER_SELECT,
            take: 300,
        });
        if (!orders.length) return [];
        const byId = new Map(orders.map((o) => [o.id, exchangeView(o)]));
        const rows = await this.prisma.exchangeOffer.findMany({
            where: { orderId: { in: [...byId.keys()] }, status: 'ACTIVE' },
            select: OFFER_SELECT,
            // Свежие сверху — и новые, и с изменённой ценой.
            orderBy: { updatedAt: 'desc' },
            take: 100,
        });
        return rows.map((o) => {
            const order = byId.get(o.orderId)!;
            return { ...offerView(o), orderId: o.orderId, orderNumber: order.orderNumber, from: order.from, to: order.to, orderPrice: order.price };
        });
    }

    async accept(companyId: string, userId: string, orderId: string, offerId: string) {
        const order = await this.managedOrder(companyId, orderId);
        const offer = await this.prisma.exchangeOffer.findFirst({ where: { id: offerId, orderId }, select: OFFER_SELECT });
        if (!offer) throw new NotFoundException('Отклик не найден');
        if (offer.status !== 'ACTIVE') throw new BadRequestException('Этот отклик уже отозван или по нему принято решение');

        const view = offerView(offer);
        const now = new Date();
        const price = Number(offer.price);
        let orderData: Prisma.OrderUpdateManyMutationInput & { subForwarderId?: string; partnerId?: string | null; driverId?: string };
        let comment: string;
        /** Водитель парка — расчёт рейса фиксируется вместе с выбором. */
        let settlementData: Prisma.ExchangeTripSettlementUncheckedCreateInput | null = null;

        if (offer.company) {
            // Перевозчик — как при передаче рейса партнёру: видит заявку у
            // себя и назначает своего водителя.
            orderData = { subForwarderId: offer.company.id, subForwarderPrice: price, isConfirmed: true };
            comment = `С биржи выбран перевозчик ${offer.company.name} за ${price.toLocaleString('ru-RU')} ₸`;
        } else if (offer.driver) {
            const d = offer.driver;
            if (d.status !== 'APPROVED') throw new BadRequestException('Водитель больше не допущен к бирже — выберите другой отклик');
            if (d.kind === 'PARK' && !d.parkCompanyId) throw new BadRequestException('У водителя нет парка — выберите другой отклик');
            orderData = {
                driverId: d.userId,
                partnerId: d.kind === 'PARK' ? d.parkCompanyId : null,
                driverCost: price,
                status: OrderStatus.ASSIGNED,
                assignedDriverName: view.name,
                assignedDriverPhone: d.phone,
                assignedDriverPlate: d.vehiclePlate,
                assignedAt: now,
                isConfirmed: true,
            };
            comment = d.kind === 'PARK'
                ? `С биржи выбран водитель ${view.name} (через парк ${d.park?.name ?? ''}) за ${price.toLocaleString('ru-RU')} ₸`
                : `С биржи выбран водитель ${view.name} (свой ИП) за ${price.toLocaleString('ru-RU')} ₸`;
            if (d.kind === 'PARK' && d.parkCompanyId) {
                const driver = { id: d.id, parkCompanyId: d.parkCompanyId };
                // Вычет — по остатку на сейчас: пока отклик ждал, у водителя мог
                // пройти другой рейс месяца. Отклик до нового расчёта (без calc) —
                // рейс без расчёта «на руки», как раньше.
                const offered = offer.calc as unknown as SettlementCalc | null;
                const calc = offered ? this.settlement.atAccept(offered, await this.settlement.context(driver, order.id)) : null;
                if (calc) {
                    settlementData = this.settlement.fixData(order.id, driver, calc);
                    comment += ` — водителю на руки ${Math.round(calc.driverTotal).toLocaleString('ru-RU')} ₸ с топливом`;
                }
            }
        } else {
            throw new BadRequestException('Отклик без исполнителя');
        }

        await this.prisma.$transaction(async (tx) => {
            // Условие внутри обновления: два менеджера, выбирающие разом,
            // не назначат двух исполнителей на одну заявку.
            const { count } = await tx.order.updateMany({
                where: { id: order.id, ...ON_EXCHANGE },
                data: { ...orderData, exchangeClosedAt: now, exchangeCloseReason: `Выбран исполнитель: ${view.name}` } as any,
            });
            if (!count) throw new BadRequestException('У заявки уже появился исполнитель — обновите страницу');
            if (settlementData) {
                // Заявку могли снять с водителя и выставить снова — расчёт рейса один, последний.
                const { orderId: _orderId, ...rest } = settlementData;
                await tx.exchangeTripSettlement.upsert({ where: { orderId: order.id }, create: settlementData, update: rest });
            }
            await tx.exchangeOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED', decidedAt: now } });
            await tx.exchangeOffer.updateMany({
                where: { orderId: order.id, status: 'ACTIVE', id: { not: offer.id } },
                data: { status: 'REJECTED', decidedAt: now },
            });
            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: offer.driver ? OrderStatus.ASSIGNED : (order.status as OrderStatus),
                    comment,
                    changedById: userId,
                },
            });
        });

        return { orderNumber: order.orderNumber, executor: view.name, kind: view.kind, price };
    }

    /** Сняли заявку с биржи — ждущим откликам честно отвечаем «не актуально». */
    async closeOffers(orderId: string) {
        await this.prisma.exchangeOffer.updateMany({
            where: { orderId, status: 'ACTIVE' },
            data: { status: 'REJECTED', decidedAt: new Date() },
        });
    }
}
