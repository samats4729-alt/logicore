import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cityKey } from '../cities/city-key';
import { ExchangeBoardQueryDto, PublishOrderDto, RoutePricesQueryDto } from './dto/exchange-order.dto';
import {
    EXCHANGE_ORDER_SELECT, FREE_STATUSES, ON_EXCHANGE, byLoadingDate, exchangeView, managerOf, matches, notPast,
} from './exchange-orders';

const PARK_CANNOT_PUBLISH = 'Парк не выставляет заявки — он сам не возит, через него работают водители';

/** Медиана: одна случайная дорогая перевозка не должна задирать «обычную цену». */
function median(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Что нужно знать о заявке, чтобы решить, можно ли её выставить. */
const STATE_SELECT = {
    id: true, orderNumber: true, status: true,
    customerCompanyId: true, forwarderId: true, subForwarderId: true,
    partnerId: true, driverId: true, assignedDriverName: true,
    driverCost: true,
    exchangePublishedAt: true, exchangePrice: true, exchangeNote: true,
    exchangeClosedAt: true, exchangeCloseReason: true,
    routePoints: {
        select: { pointType: true, location: { select: { city: true, cityRecord: { select: { name: true } } } } },
        orderBy: { sequence: 'asc' as const },
    },
    _count: { select: { exchangeOffers: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.OrderSelect;

type StateRow = Prisma.OrderGetPayload<{ select: typeof STATE_SELECT }>;

/** Заявка не своя: компания в ней ни заказчик, ни экспедитор, ни суб-экспедитор. */
function notMine(companyId: string): Prisma.OrderWhereInput[] {
    return (['customerCompanyId', 'forwarderId', 'subForwarderId'] as const).map((field) => ({
        OR: [{ [field]: null }, { [field]: { not: companyId } }],
    }));
}

const cityName = (p?: { location: { city: string | null; cityRecord: { name: string } | null } }) =>
    p ? p.location.cityRecord?.name || p.location.city || null : null;

/**
 * Биржа со стороны компании.
 *
 * Своя сторона — выставить заявку без исполнителя и снять её. Чужая —
 * заявки других компаний, которые ищут, кто повезёт. Отклики и выбор
 * исполнителя — следующий шаг.
 */
@Injectable()
export class ExchangeService {
    constructor(private readonly prisma: PrismaService) {}

    /** Заявка, в которой компания участвует, — иначе её для компании нет. */
    private async participantOrder(companyId: string, orderId: string): Promise<StateRow> {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [{ customerCompanyId: companyId }, { forwarderId: companyId }, { subForwarderId: companyId }],
            },
            select: STATE_SELECT,
        });
        if (!order) throw new NotFoundException('Заявка не найдена');
        return order;
    }

    /** Почему заявку нельзя выставить — словами; null — можно. */
    private blocker(order: StateRow, companyId: string): string | null {
        if (managerOf(order) !== companyId) {
            return 'Выставить на биржу может только компания, которая ищет исполнителя по этой заявке';
        }
        if (order.partnerId || order.driverId || order.assignedDriverName) {
            return 'У заявки уже есть исполнитель — искать его на бирже не нужно';
        }
        if (!FREE_STATUSES.includes(order.status)) return 'Заявка уже в работе или закрыта';
        const types = order.routePoints.map((p) => p.pointType);
        if (!types.some((t) => t !== 'DELIVERY') || !types.includes('DELIVERY')) {
            return 'Добавьте в заявку погрузку и выгрузку — без маршрута её не выставить';
        }
        return null;
    }

    private stateView(order: StateRow, companyId: string) {
        const blocker = this.blocker(order, companyId);
        const published = !!order.exchangePublishedAt && !order.exchangeClosedAt;
        return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            /** Сейчас на бирже: выставлена, не снята и исполнителя всё ещё нет. */
            onExchange: published && !blocker,
            canPublish: !blocker,
            reason: blocker,
            publishedAt: order.exchangePublishedAt,
            price: order.exchangePrice != null ? Number(order.exchangePrice) : null,
            note: order.exchangeNote,
            closedAt: order.exchangeClosedAt,
            closeReason: order.exchangeCloseReason,
            /** Откуда и куда — для подсказки «почём возили по направлению». */
            from: cityName(order.routePoints.find((p) => p.pointType !== 'DELIVERY')),
            to: cityName([...order.routePoints].reverse().find((p) => p.pointType === 'DELIVERY')),
            /** Сколько откликов ждут решения. */
            offersCount: order._count.exchangeOffers,
            /** Подсказка цены — сколько в заявке заложено перевозчику. */
            suggestedPrice: order.driverCost != null ? Number(order.driverCost) : null,
        };
    }

    /** Биржа в карточке заявки: на бирже ли она и можно ли выставить. */
    async state(companyId: string, orderId: string) {
        const view = this.stateView(await this.participantOrder(companyId, orderId), companyId);
        // Парк сам не возит — и кнопки «Выставить на биржу» у него нет.
        if (view.canPublish && await this.isPark(companyId)) {
            return { ...view, canPublish: false, reason: PARK_CANNOT_PUBLISH };
        }
        return view;
    }

    private async isPark(companyId: string): Promise<boolean> {
        const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { isPark: true } });
        return !!company?.isPark;
    }

    async publish(companyId: string, userId: string, orderId: string, dto: PublishOrderDto) {
        if (await this.isPark(companyId)) throw new ForbiddenException(PARK_CANNOT_PUBLISH);
        const order = await this.participantOrder(companyId, orderId);
        const blocker = this.blocker(order, companyId);
        if (blocker) throw new BadRequestException(blocker);

        // Исполнителя могли назначить, пока открыта форма: обновляем, только
        // если заявка всё ещё свободна.
        const { count } = await this.prisma.order.updateMany({
            where: { id: order.id, status: { in: FREE_STATUSES }, partnerId: null, driverId: null, assignedDriverName: null },
            data: {
                exchangePublishedAt: new Date(),
                exchangePublishedById: userId,
                exchangePrice: dto.price,
                exchangeNote: dto.note?.trim() || null,
                exchangeClosedAt: null,
                exchangeCloseReason: null,
            },
        });
        if (!count) throw new BadRequestException('У заявки уже появился исполнитель — обновите страницу');
        return this.state(companyId, orderId);
    }

    async unpublish(companyId: string, orderId: string, reason: string) {
        const order = await this.participantOrder(companyId, orderId);
        if (managerOf(order) !== companyId) throw new BadRequestException('Снять с биржи может компания, которая её выставила');
        if (!order.exchangePublishedAt || order.exchangeClosedAt) throw new BadRequestException('Заявка уже не на бирже');
        await this.prisma.$transaction([
            this.prisma.order.update({
                where: { id: order.id },
                data: { exchangeClosedAt: new Date(), exchangeCloseReason: reason.trim() },
            }),
            // Сняли — ждущим откликам честно отвечаем «не актуально».
            this.prisma.exchangeOffer.updateMany({
                where: { orderId: order.id, status: 'ACTIVE' },
                data: { status: 'REJECTED', decidedAt: new Date() },
            }),
        ]);
        return this.state(companyId, orderId);
    }

    /**
     * Биржа: заявки других компаний, которые ищут исполнителя. Свои сюда не
     * попадают — свою заявку незачем брать самому. Прошедшая погрузка тоже:
     * на неё уже никто не успеет.
     */
    async board(companyId: string, filter: ExchangeBoardQueryDto = {}) {
        const rows = await this.prisma.order.findMany({
            where: {
                ...ON_EXCHANGE,
                // «Не своя»: поле пустое или другая компания. Простое NOT здесь не
                // годится — пустое поле в базе превращает его в «неизвестно», и
                // такая заявка молча пропадала с биржи.
                AND: notMine(companyId),
            },
            select: EXCHANGE_ORDER_SELECT,
            orderBy: { exchangePublishedAt: 'desc' },
            take: 300,
        });
        return rows.filter((r) => notPast(r)).map(exchangeView).filter((v) => matches(v, filter)).sort(byLoadingDate);
    }

    /** Заявка с биржи — как её видят другие. */
    async card(companyId: string, orderId: string) {
        const row = await this.prisma.order.findFirst({ where: { id: orderId, ...ON_EXCHANGE }, select: EXCHANGE_ORDER_SELECT });
        if (!row) throw new NotFoundException('Заявка уже снята с биржи или у неё появился исполнитель');
        const own = await this.prisma.order.count({
            where: { id: orderId, OR: [{ customerCompanyId: companyId }, { forwarderId: companyId }, { subForwarderId: companyId }] },
        });
        return { ...exchangeView(row), own: own > 0 };
    }

    /** Свои заявки на бирже — те, по которым компания сейчас ищет исполнителя. */
    async mine(companyId: string) {
        const rows = await this.prisma.order.findMany({
            where: {
                ...ON_EXCHANGE,
                OR: [
                    { subForwarderId: companyId },
                    { subForwarderId: null, forwarderId: companyId },
                    { subForwarderId: null, forwarderId: null, customerCompanyId: companyId },
                ],
            },
            select: EXCHANGE_ORDER_SELECT,
            orderBy: { exchangePublishedAt: 'desc' },
            take: 300,
        });
        return rows.map((r) => ({ ...exchangeView(r), stale: !notPast(r) })).sort(byLoadingDate);
    }

    /**
     * Почём возили по направлению — подсказка перед тем, как назвать цену.
     *
     * Цену система не придумывает, называет её человек. Здесь — прошлые
     * заявки биржи по направлению (их цены видели все) и свои рейсы
     * компании: сколько она платила перевозчику.
     */
    async routePrices(companyId: string, query: RoutePricesQueryDto) {
        const originKey = cityKey(query.originCityName);
        const destinationKey = cityKey(query.destinationCityName);
        if (!originKey || !destinationKey) return { exchange: [], ownOrders: [], summary: null };

        const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000);
        const select = {
            id: true, orderNumber: true, createdAt: true, driverCost: true, exchangePrice: true, exchangePublishedAt: true,
            cargoType: true, cargoWeight: true, forwarderId: true, subForwarderId: true, customerCompanyId: true,
            routePoints: {
                select: { pointType: true, sequence: true, location: { select: { city: true, cityRecord: { select: { name: true } } } } },
                orderBy: { sequence: 'asc' as const },
            },
        } satisfies Prisma.OrderSelect;

        const [onExchange, own] = await Promise.all([
            this.prisma.order.findMany({
                where: { exchangePublishedAt: { gte: yearAgo }, exchangePrice: { not: null }, status: { not: 'CANCELLED' } },
                select, orderBy: { exchangePublishedAt: 'desc' }, take: 300,
            }),
            this.prisma.order.findMany({
                where: { forwarderId: companyId, driverCost: { not: null }, status: { not: 'CANCELLED' }, createdAt: { gte: yearAgo } },
                select, orderBy: { createdAt: 'desc' }, take: 300,
            }),
        ]);

        // Маршрут лежит точками, город — в адресе. Сравниваем первую
        // погрузку и последнюю выгрузку теми же ключами, что и в запросе.
        const keyOf = (p?: { location: { city: string | null; cityRecord: { name: string } | null } }) =>
            cityKey(p?.location.cityRecord?.name || p?.location.city || '');
        const sameRoute = (o: { routePoints: { pointType: string; location: { city: string | null; cityRecord: { name: string } | null } }[] }) => {
            const pickup = o.routePoints.find((p) => p.pointType !== 'DELIVERY');
            const delivery = [...o.routePoints].reverse().find((p) => p.pointType === 'DELIVERY');
            return keyOf(pickup) === originKey && keyOf(delivery) === destinationKey;
        };

        const exchange = onExchange.filter(sameRoute).slice(0, 20).map((o) => ({
            number: o.orderNumber,
            date: o.exchangePublishedAt,
            price: Number(o.exchangePrice),
            bodyType: o.cargoType,
            weightKg: o.cargoWeight != null ? Math.round(o.cargoWeight) : null,
            own: managerOf(o) === companyId,
        }));
        const ownOrders = own.filter(sameRoute).slice(0, 10).map((o) => ({
            orderNumber: o.orderNumber,
            date: o.createdAt,
            price: Number(o.driverCost),
            bodyType: o.cargoType,
            weightKg: o.cargoWeight != null ? Math.round(o.cargoWeight) : null,
        }));

        const prices = [...exchange, ...ownOrders].map((r) => r.price).filter((p) => p > 0);
        return {
            exchange,
            ownOrders,
            summary: prices.length
                ? { count: prices.length, min: Math.min(...prices), max: Math.max(...prices), median: median(prices) }
                : null,
        };
    }
}
