import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, PushContent } from './notifications.service';

/**
 * Какие события приходят водителю push-уведомлением и какими словами.
 *
 * Только то, ради чего водитель должен открыть приложение: выбрали на рейс
 * или груз ушёл другому, анкета проверена, выплата прошла или отклонена,
 * парк выдал топливо или предоплату, решение по чеку на топливо, назначили
 * на рейс в компании.
 *
 * Сумм в уведомлениях нет, кроме своих же денег (выплата, выдача по рейсу): текст виден на
 * заблокированном экране, и цена рейса там ни к чему. Каждое событие
 * вызывается после того, как действие уже прошло, и никогда не бросает
 * исключений — сбой уведомления не отменяет решение парка или логиста.
 *
 * `data.url` — экран приложения, который откроется по нажатию.
 */
@Injectable()
export class DriverPushService {
    private readonly logger = new Logger(DriverPushService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationsService,
    ) {}

    private async safe(what: string, run: () => Promise<unknown>) {
        try {
            await run();
        } catch (e: any) {
            this.logger.warn(`push «${what}» не отправлен: ${e?.message ?? e}`);
        }
    }

    private send(userIds: (string | null | undefined)[], content: PushContent) {
        return this.notifications.sendToUsers(userIds.filter((id): id is string => !!id), content);
    }

    /** «Алматы → Астана» — откуда первая погрузка и куда последняя выгрузка. */
    async route(orderId: string): Promise<string> {
        const points = await this.prisma.orderRoutePoint.findMany({
            where: { orderId },
            orderBy: { sequence: 'asc' },
            select: { pointType: true, location: { select: { city: true, cityRecord: { select: { name: true } } } } },
        });
        const city = (p: (typeof points)[number] | undefined) => p?.location.cityRecord?.name || p?.location.city || '';
        const from = city(points.find((p) => p.pointType !== 'DELIVERY') ?? points[0]);
        const to = city([...points].reverse().find((p) => p.pointType === 'DELIVERY') ?? points[points.length - 1]);
        return from && to ? `${from} → ${to}` : from || to || '';
    }

    // ==================== биржа ====================

    /** Кто из водителей сейчас ждёт ответа по грузу: отклик → вход водителя. */
    async activeDriverOffers(orderId: string): Promise<{ offerId: string; userId: string }[]> {
        try {
            const rows = await this.prisma.exchangeOffer.findMany({
                where: { orderId, status: 'ACTIVE', driverId: { not: null } },
                select: { id: true, driver: { select: { userId: true } } },
            });
            return rows.filter((r) => r.driver).map((r) => ({ offerId: r.id, userId: r.driver!.userId }));
        } catch {
            return [];
        }
    }

    /**
     * Компания выбрала исполнителя: выбранному водителю — «вас выбрали»,
     * остальным откликнувшимся — что груз ушёл, чтобы не ждали зря.
     */
    offerDecided(orderId: string, waiting: { offerId: string; userId: string }[], acceptedOfferId: string) {
        return this.safe('выбор исполнителя', async () => {
            if (!waiting.length) return;
            const route = await this.route(orderId);
            const chosen = waiting.find((w) => w.offerId === acceptedOfferId);
            if (chosen) {
                await this.send([chosen.userId], {
                    title: 'Вас выбрали на рейс',
                    body: `${route ? `${route}. ` : ''}Откройте рейс в приложении: там адреса и время погрузки.`,
                    data: { type: 'EXCHANGE_CHOSEN', orderId, url: '/exchange/(tabs)/trip' },
                });
            }
            const others = waiting.filter((w) => w.offerId !== acceptedOfferId).map((w) => w.userId);
            await this.send(others, {
                title: 'Груз ушёл другому исполнителю',
                body: `${route ? `${route}. ` : ''}Посмотрите другие грузы на бирже.`,
                data: { type: 'EXCHANGE_TAKEN', orderId, url: '/exchange/(tabs)/loads' },
            });
        });
    }

    /** Парк проверил анкету: допустил или отказал с причиной. */
    driverReviewed(exchangeDriverId: string, approved: boolean, reason?: string | null) {
        return this.safe('проверка анкеты', async () => {
            const d = await this.prisma.exchangeDriver.findUnique({
                where: { id: exchangeDriverId },
                select: { userId: true, park: { select: { name: true } } },
            });
            if (!d) return;
            await this.send([d.userId], approved
                ? {
                    title: 'Анкета одобрена',
                    body: `${d.park?.name ? `${d.park.name}: в` : 'В'}ы допущены к грузам на бирже.`,
                    data: { type: 'DRIVER_APPROVED', url: '/exchange/(tabs)/loads' },
                }
                : {
                    title: 'Анкета не прошла проверку',
                    body: `${reason?.trim() ? `Причина: ${reason.trim()}. ` : ''}Исправьте анкету и отправьте снова.`,
                    data: { type: 'DRIVER_REJECTED', url: '/exchange' },
                });
        });
    }

    /** Парк провёл выплату или отклонил запрос. */
    payoutDecided(payoutId: string, paid: boolean, reason?: string | null) {
        return this.safe('выплата', async () => {
            const p = await this.prisma.driverPayout.findUnique({
                where: { id: payoutId },
                select: { toPay: true, net: true, driver: { select: { userId: true } } },
            });
            if (!p) return;
            const sum = Math.round(Number(p.toPay ?? p.net));
            await this.send([p.driver.userId], paid
                ? {
                    title: 'Выплата проведена',
                    body: `${sum.toLocaleString('ru-RU')} ₸ отправлены на ваш счёт.`,
                    data: { type: 'PAYOUT_PAID', url: '/exchange/(tabs)/earnings' },
                }
                : {
                    title: 'Выплата отклонена',
                    body: `${reason?.trim() ? `Причина: ${reason.trim()}. ` : ''}Рейсы снова доступны к выплате.`,
                    data: { type: 'PAYOUT_REJECTED', url: '/exchange/(tabs)/earnings' },
                });
        });
    }

    /**
     * Парк выдал по рейсу топливо или предоплату — по запросу или сам (шеф,
     * 27.10.2026). Сумма — своя, как у выплаты.
     */
    moneyIssued(orderId: string, kind: 'FUEL' | 'ADVANCE', amount: number | string, method: string) {
        return this.safe('выдача по рейсу', async () => {
            const o = await this.prisma.order.findUnique({ where: { id: orderId }, select: { driverId: true } });
            if (!o?.driverId) return;
            const route = await this.route(orderId);
            const sum = Math.round(Number(String(amount).replace(/\s/g, '').replace(',', '.'))).toLocaleString('ru-RU');
            await this.send([o.driverId], {
                title: kind === 'ADVANCE' ? 'Парк выдал предоплату' : method === 'STATION' ? 'Парк оплатил топливо' : 'Парк перевёл на топливо',
                body: `${sum} ₸${route ? ` — рейс ${route}` : ''}.`,
                data: { type: kind === 'ADVANCE' ? 'ADVANCE_ISSUED' : 'FUEL_ISSUED', orderId, url: '/exchange/(tabs)/trip' },
            });
        });
    }

    /** Парк принял или отклонил чек на топливо. */
    fuelReceiptDecided(receiptId: string) {
        return this.safe('чек на топливо', async () => {
            const r = await this.prisma.exchangeFuelReceipt.findUnique({
                where: { id: receiptId },
                select: { status: true, amount: true, rejectReason: true, orderId: true, driver: { select: { userId: true } } },
            });
            if (!r || r.status === 'PENDING') return;
            const route = await this.route(r.orderId);
            const sum = Math.round(Number(r.amount)).toLocaleString('ru-RU');
            await this.send([r.driver.userId], r.status === 'ACCEPTED'
                ? {
                    title: 'Чек на топливо принят',
                    body: `${sum} ₸${route ? ` — рейс ${route}` : ''}.`,
                    data: { type: 'FUEL_ACCEPTED', orderId: r.orderId, url: '/exchange/(tabs)/trip' },
                }
                : {
                    title: 'Чек на топливо отклонён',
                    body: `${r.rejectReason ? `Причина: ${r.rejectReason}. ` : ''}Загрузите правильный чек в рейсе.`,
                    data: { type: 'FUEL_REJECTED', orderId: r.orderId, url: '/exchange/(tabs)/trip' },
                });
        });
    }

    // ==================== рейсы компании ====================

    /** Кто водитель рейса сейчас — чтобы после назначения понять, сменился ли он. */
    async currentDriver(orderId: string): Promise<string | null> {
        try {
            const o = await this.prisma.order.findUnique({ where: { id: orderId }, select: { driverId: true } });
            return o?.driverId ?? null;
        } catch {
            return null;
        }
    }

    /** Логист назначил водителя компании на рейс. Тот же водитель — не дёргаем. */
    tripAssigned(orderId: string, previousDriverId: string | null) {
        return this.safe('назначение на рейс', async () => {
            const o = await this.prisma.order.findUnique({ where: { id: orderId }, select: { driverId: true, orderNumber: true } });
            if (!o?.driverId || o.driverId === previousDriverId) return;
            const route = await this.route(orderId);
            await this.send([o.driverId], {
                title: 'Новый рейс',
                body: `Заявка ${o.orderNumber}${route ? `: ${route}` : ''}.`,
                data: { type: 'ORDER_ASSIGNED', orderId, url: '/(tabs)/orders' },
            });
        });
    }
}
