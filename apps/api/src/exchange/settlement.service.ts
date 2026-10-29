import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { kzCurrentMonth } from '../common/utils/business-date';
import { LngLat, estimateRoadKm, pointOf, roadDistanceKm } from './route-distance';
import { Settlement, SettlementRates, TaxPosition, fromBase, fromCustomerPrice, fromOnHand, fuelEstimate, fuelPerKmOf, money, monthlyDeduction, withPosition } from './settlement-calc';

/** Доля LogiCore по умолчанию, % от суммы с налогами — меняется в админке (ключ платформы). */
export const PLATFORM_FEE_KEY = 'exchange_platform_fee_pct';
const PLATFORM_FEE_DEFAULT = 5;

/**
 * Настройки парка по умолчанию — схема шефа (16.10.2026): комиссия 10 % со всей
 * суммы (в ней доля LogiCore 5 %), топливо 30 л на 100 км по 350 ₸ (лето),
 * ИПН 10 % и 15 % выше 8 500 МРП в год. НДС 16 % — только у плательщиков НДС.
 */
export const PARK_DEFAULTS = {
    commissionPct: 10, opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5,
    applyDeduction: true, deductionMrp: 30, mrp: 4325,
    vatPayer: false, vatPct: 16,
    fuelConsumption: 30, fuelPriceSummer: 350, fuelPriceWinter: null as number | null, fuelSeason: 'SUMMER',
    ipnHighPct: 15, ipnThresholdMrp: 8500,
};

/** Что нужно, чтобы посчитать рейс конкретному водителю: ставки, топливо, вычет, годовой доход. */
export interface SettlementContext {
    rates: SettlementRates;
    fuelPerKm: number;
    distanceKm: number | null;
    fuel: number;
    taxMonth: string;
    position: TaxPosition;
    /** Бухгалтер парка ещё не подтвердил расчёт — суммы предварительные. */
    preliminary: boolean;
}

/** Расчёт и то, из чего он получился, — замораживается в отклике и в рейсе. */
export type SettlementCalc = Settlement & Omit<SettlementContext, 'position'>;

/** Строки расчёта водителя без ИП, которые парк видит в заявке. */
export interface ParkOrderLines {
    /** Топливо + оплата за работу. */
    base: number;
    fuel: number;
    gross: number;
    opv: number;
    driverTotal: number;
    vosms: number;
    so: number;
    ipn: number;
    commission: number;
    platformFee: number;
    parkFee: number;
    vat: number;
    customerPrice: number;
    deductionAmount: number;
}

/**
 * Расчёт водителя без ИП в заявке парка: TRIP — рейс с биржи, расчёт
 * зафиксирован при выборе водителя; OWN — своя заявка парка, посчитано из
 * цены для заказчика. `calc` нет — в `reason` словами, чего не хватает.
 */
export interface ParkOrderCalc {
    source: 'TRIP' | 'OWN';
    /** 1 — рейс по прежней схеме (до 16.10.2026): «на руки» вместе с топливом. */
    scheme: 1 | 2;
    driverName: string | null;
    distanceKm: number | null;
    preliminary: boolean;
    rates: { opvPct: number; vosmsPct: number; soPct: number; ipnPct: number; parkPct: number; platformPct: number; vatPct: number };
    calc: ParkOrderLines | null;
    reason: string | null;
}

const ratesView = (r: SettlementRates): ParkOrderCalc['rates'] => ({
    opvPct: r.opvPct, vosmsPct: r.vosmsPct, soPct: r.soPct, ipnPct: r.ipnPct,
    parkPct: r.parkPct, platformPct: r.platformPct, vatPct: r.vatPct ?? 0,
});

export const ROUTE_SELECT = {
    id: true,
    exchangeDistanceKm: true,
    routePoints: {
        select: {
            pointType: true,
            expectedDate: true,
            location: { select: { latitude: true, longitude: true, cityRecord: { select: { latitude: true, longitude: true } } } },
        },
        orderBy: { sequence: 'asc' as const },
    },
} satisfies Prisma.OrderSelect;

type RouteRow = Prisma.OrderGetPayload<{ select: typeof ROUTE_SELECT }>;

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

/**
 * Расчёт рейса водителя парка — связка формул с данными: настройки парка,
 * расстояние маршрута, месяц дохода, заявление водителя на вычет и его
 * доход в этом парке с начала года.
 */
@Injectable()
export class ExchangeSettlementService {
    constructor(private readonly prisma: PrismaService) {}

    async platformPct(): Promise<number> {
        const row = await this.prisma.platformSetting.findUnique({ where: { key: PLATFORM_FEE_KEY } });
        const v = row ? Number(row.value) : NaN;
        return Number.isFinite(v) && v >= 0 && v <= 100 ? v : PLATFORM_FEE_DEFAULT;
    }

    async setPlatformPct(value: number): Promise<number> {
        if (!Number.isFinite(value) || value < 0 || value > 100) throw new BadRequestException('Комиссия LogiCore — от 0 до 100 %');
        await this.prisma.platformSetting.upsert({
            where: { key: PLATFORM_FEE_KEY },
            create: { key: PLATFORM_FEE_KEY, value: String(value) },
            update: { value: String(value) },
        });
        return value;
    }

    /** Ставки парка вместе с долей LogiCore; топливо на км — из расхода и цены литра сезона. */
    /** Ставки и топливо парка; без парка (`null`) — стандартные, как у нового парка. */
    async parkSettings(parkId: string | null) {
        const row = parkId ? await this.prisma.parkPayoutRates.findUnique({ where: { parkCompanyId: parkId } }) : null;
        const p = row ? {
            commissionPct: num(row.commissionPct), opvPct: num(row.opvPct), vosmsPct: num(row.vosmsPct),
            ipnPct: num(row.ipnPct), soPct: num(row.soPct),
            applyDeduction: row.applyDeduction, deductionMrp: row.deductionMrp, mrp: row.mrp,
            vatPayer: row.vatPayer, vatPct: num(row.vatPct),
            fuelConsumption: num(row.fuelConsumption), fuelPriceSummer: num(row.fuelPriceSummer),
            fuelPriceWinter: row.fuelPriceWinter != null ? num(row.fuelPriceWinter) : null, fuelSeason: row.fuelSeason,
            ipnHighPct: num(row.ipnHighPct), ipnThresholdMrp: row.ipnThresholdMrp,
        } : PARK_DEFAULTS;
        const rates: SettlementRates = {
            opvPct: p.opvPct, vosmsPct: p.vosmsPct, ipnPct: p.ipnPct, soPct: p.soPct,
            platformPct: await this.platformPct(), parkPct: p.commissionPct,
            deductionMrp: p.deductionMrp, mrp: p.mrp,
            vatPct: p.vatPayer ? p.vatPct : 0,
            ipnHighPct: p.ipnHighPct, ipnThresholdMrp: p.ipnThresholdMrp,
        };
        const fuelPerKm = fuelPerKmOf(p.fuelConsumption, p.fuelPriceSummer, p.fuelPriceWinter, p.fuelSeason);
        // Расход на 100 км — чтобы показать водителю лимит топлива и в литрах.
        return { rates, fuelPerKm, fuelConsumption: p.fuelConsumption, applyDeduction: p.applyDeduction, preliminary: !row?.ratesConfirmedAt };
    }

    /**
     * Ставки парка водителя, его заявление на вычет и рейсы в этом парке —
     * один раз на ленту. В счёт идут только рейсы, которые он и везёт:
     * отменённые и переданные другому — нет.
     */
    async driverBase(driver: { id: string; parkCompanyId: string }) {
        const settings = await this.parkSettings(driver.parkCompanyId);
        const [me, rows] = await Promise.all([
            this.prisma.exchangeDriver.findUnique({ where: { id: driver.id }, select: { deductionRequested: true } }),
            this.prisma.exchangeTripSettlement.findMany({
                where: { driverId: driver.id, parkCompanyId: driver.parkCompanyId, order: { status: { not: OrderStatus.CANCELLED } } },
                select: {
                    taxMonth: true, orderId: true, deductionAmount: true, deductionApplied: true, ipnBase: true,
                    order: { select: { driverId: true } }, driver: { select: { userId: true } },
                },
            }),
        ]);
        const trips = rows
            .filter((r) => !r.order.driverId || r.order.driverId === r.driver.userId)
            .map((r) => ({ taxMonth: r.taxMonth, orderId: r.orderId, deduction: r.deductionApplied ? num(r.deductionAmount) : 0, ipnBase: num(r.ipnBase) }));
        return { ...settings, deductionRequested: !!me?.deductionRequested, trips };
    }

    /**
     * Налоговое положение водителя для рейса orderId (его самого не считаем —
     * его и пересчитываем): остаток вычета в месяце — только если водитель
     * написал заявление и парк вычет не выключил; доход с начала года.
     */
    position(base: Awaited<ReturnType<ExchangeSettlementService['driverBase']>>, taxMonth: string, orderId: string): TaxPosition {
        const others = base.trips.filter((t) => t.orderId !== orderId);
        const year = taxMonth.slice(0, 4);
        const spent = others.filter((t) => t.taxMonth === taxMonth).reduce((sum, t) => money(sum + t.deduction), 0);
        const deductionLeft = base.applyDeduction && base.deductionRequested ? Math.max(0, money(monthlyDeduction(base.rates) - spent)) : 0;
        const yearIpnBase = others.filter((t) => t.taxMonth.startsWith(year)).reduce((sum, t) => money(sum + t.ipnBase), 0);
        return { deductionLeft, yearIpnBase };
    }

    /**
     * Контекст расчёта по строке заявки: расстояние (посчитано при выставлении,
     * иначе — оценка по прямой), месяц дохода (месяц первой погрузки, без даты —
     * текущий) и налоговое положение водителя.
     */
    contextFromRow(base: Awaited<ReturnType<ExchangeSettlementService['driverBase']>>, row: RouteRow): SettlementContext {
        const points = row.routePoints.map((p) => pointOf(p.location)).filter((p): p is LngLat => !!p);
        const distanceKm = row.exchangeDistanceKm ?? estimateRoadKm(points);
        const pickup = row.routePoints.find((p) => p.pointType !== 'DELIVERY' && p.expectedDate);
        const taxMonth = kzCurrentMonth(pickup?.expectedDate ?? new Date());
        return {
            rates: base.rates, fuelPerKm: base.fuelPerKm, distanceKm, fuel: fuelEstimate(distanceKm, base.fuelPerKm),
            taxMonth, position: this.position(base, taxMonth, row.id), preliminary: base.preliminary,
        };
    }

    /** Контекст для одной заявки — отклик и выбор исполнителя. */
    async context(driver: { id: string; parkCompanyId: string }, orderId: string): Promise<SettlementContext> {
        const row = await this.prisma.order.findUnique({ where: { id: orderId }, select: ROUTE_SELECT });
        if (!row) throw new BadRequestException('Заявка не найдена');
        return this.contextFromRow(await this.driverBase(driver), row);
    }

    /**
     * Расстояние по дорогам для выставления на биржу; не вышло — по прямой.
     * Ничего не записывает: выставление пишет его вместе с заявкой.
     */
    async roadKm(orderId: string): Promise<number | null> {
        const row = await this.prisma.order.findUnique({ where: { id: orderId }, select: ROUTE_SELECT });
        if (!row) return null;
        return roadDistanceKm(row.routePoints.map((p) => pointOf(p.location)).filter((p): p is LngLat => !!p));
    }

    /** Сумма заказчика на бирже → полный расчёт. Ошибку суммы — словами. */
    byBase(ctx: SettlementContext, base: number): SettlementCalc {
        try {
            return this.withContext(fromBase(base, ctx.fuel, ctx.rates, ctx.position), ctx);
        } catch (e) {
            throw new BadRequestException((e as Error).message);
        }
    }

    /** То же для ленты: сумма не больше топлива — водителю показать нечего. */
    tryBase(ctx: SettlementContext, base: number): SettlementCalc | null {
        try {
            return this.byBase(ctx, base);
        } catch {
            return null;
        }
    }

    /** Водитель назвал, сколько хочет на руки (без топлива) → полный расчёт. */
    byOnHand(ctx: SettlementContext, onHand: number): SettlementCalc {
        try {
            return this.withContext(fromOnHand(onHand, ctx.fuel, ctx.rates, ctx.position), ctx);
        } catch (e) {
            throw new BadRequestException((e as Error).message);
        }
    }

    /**
     * Расчёт отклика на момент выбора исполнителя: вычет и годовой доход — как
     * у водителя сейчас; цена компании и сумма водителю — как в отклике.
     * Отклик по прежней схеме (до 16.10.2026) фиксируется как был.
     */
    atAccept(offered: SettlementCalc, ctx: SettlementContext): SettlementCalc {
        if ((offered as { scheme?: number }).scheme !== 2) return { ...offered, preliminary: ctx.preliminary };
        return { ...offered, ...withPosition(offered, offered.rates, ctx.position), preliminary: ctx.preliminary };
    }

    private withContext(s: Settlement, ctx: SettlementContext): SettlementCalc {
        return { ...s, rates: ctx.rates, fuelPerKm: ctx.fuelPerKm, distanceKm: ctx.distanceKm, taxMonth: ctx.taxMonth, preliminary: ctx.preliminary };
    }

    /**
     * Расчёт водителя без ИП внутри заявки — для парка (владелец, 29.10.2026:
     * «перевозчик — их компания, водитель назначенный; все расчёты без ИП
     * должны быть в заявке, в финансах»).
     *
     * Рейс с биржи — расчёт, зафиксированный при выборе водителя. Своя заявка
     * парка с его водителем (через парк или штатным) — из цены для заказчика
     * по ставкам парка, как в калькуляторе; НДС — как в заявке, то есть как в
     * счёте заказчику. Остальным — null: парку здесь считать нечего, а чужой
     * расчёт — не его сведения.
     */
    async forParkOrder(companyId: string | null | undefined, orderId: string): Promise<ParkOrderCalc | null> {
        if (!companyId) return null;
        const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { isPark: true } });
        if (!company?.isPark) return null;
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                ...ROUTE_SELECT,
                forwarderId: true, driverId: true, assignedDriverName: true,
                customerPrice: true, customerPriceBase: true, currency: true, hasVat: true, vatRate: true,
                exchangeSettlement: true,
            },
        });
        if (!order) return null;

        const trip = order.exchangeSettlement;
        if (trip && trip.parkCompanyId === companyId) {
            const fuel = num(trip.fuelEstimate);
            const gross = num(trip.gross);
            return {
                source: 'TRIP',
                scheme: trip.scheme === 2 ? 2 : 1,
                driverName: order.assignedDriverName,
                distanceKm: trip.distanceKm,
                preliminary: trip.preliminary,
                rates: ratesView(trip.rates as unknown as SettlementRates),
                calc: {
                    base: trip.base != null ? num(trip.base) : money(fuel + gross),
                    fuel, gross, opv: num(trip.opv), driverTotal: num(trip.driverTotal),
                    vosms: num(trip.vosms), so: num(trip.so), ipn: num(trip.ipn),
                    commission: money(num(trip.platformFee) + num(trip.parkFee)),
                    platformFee: num(trip.platformFee), parkFee: num(trip.parkFee),
                    vat: num(trip.vat), customerPrice: num(trip.customerPrice),
                    deductionAmount: trip.deductionApplied ? num(trip.deductionAmount) : 0,
                },
                reason: null,
            };
        }

        if (order.forwarderId !== companyId || !order.driverId) return null;
        const [viaPark, staff] = await Promise.all([
            this.prisma.exchangeDriver.findFirst({ where: { userId: order.driverId, parkCompanyId: companyId, kind: 'PARK' }, select: { id: true } }),
            this.prisma.user.findFirst({ where: { id: order.driverId, companyId, role: UserRole.DRIVER }, select: { id: true } }),
        ]);
        if (!viaPark && !staff) return null;

        // Водитель через парк — с его заявлением на вычет и доходом за год;
        // штатный — без вычета: заявления в программе у него нет.
        const base = viaPark
            ? await this.driverBase({ id: viaPark.id, parkCompanyId: companyId })
            : { ...(await this.parkSettings(companyId)), deductionRequested: false, trips: [] };
        const ctx = this.contextFromRow(base, order);
        const rates = { ...ctx.rates, vatPct: order.hasVat ? num(order.vatRate) : 0 };
        const view = {
            source: 'OWN' as const, scheme: 2 as const, driverName: order.assignedDriverName,
            distanceKm: ctx.distanceKm, preliminary: ctx.preliminary, rates: ratesView(rates),
        };
        const price = order.currency === 'KZT' ? order.customerPrice : order.customerPriceBase;
        if (price == null || num(price) <= 0) {
            return { ...view, calc: null, reason: 'Укажите цену для заказчика — расчёт появится здесь' };
        }
        try {
            const s = fromCustomerPrice(num(price), ctx.fuel, rates, ctx.position);
            return {
                ...view,
                calc: {
                    base: s.base, fuel: s.fuel, gross: s.gross, opv: s.opv, driverTotal: s.driverTotal,
                    vosms: s.vosms, so: s.so, ipn: s.ipn, commission: s.commission,
                    platformFee: s.platformFee, parkFee: s.parkFee, vat: s.vat,
                    customerPrice: s.customerPrice, deductionAmount: s.deductionAmount,
                },
                reason: null,
            };
        } catch (e) {
            if (e instanceof RangeError) return { ...view, calc: null, reason: e.message };
            throw e;
        }
    }

    /** Зафиксировать расчёт рейса — когда компания выбрала водителя. */
    fixData(orderId: string, driver: { id: string; parkCompanyId: string }, c: SettlementCalc): Prisma.ExchangeTripSettlementUncheckedCreateInput {
        const scheme2 = (c as { scheme?: number }).scheme === 2;
        return {
            orderId, driverId: driver.id, parkCompanyId: driver.parkCompanyId, taxMonth: c.taxMonth,
            distanceKm: c.distanceKm, fuelPerKm: c.fuelPerKm, fuelEstimate: c.fuel,
            driverTotal: c.driverTotal, workNet: c.workNet, gross: c.gross, opv: c.opv, vosms: c.vosms, ipn: c.ipn,
            so: c.so, parkCost: c.parkCost, platformFee: c.platformFee, parkFee: c.parkFee, customerPrice: c.customerPrice,
            deductionApplied: c.deductionApplied, deductionAmount: c.deductionAmount,
            vat: c.vat ?? 0, preliminary: c.preliminary ?? true,
            scheme: scheme2 ? 2 : 1, base: scheme2 ? c.base : null, ipnBase: scheme2 ? c.ipnBase : 0,
            rates: c.rates as unknown as Prisma.InputJsonValue,
        };
    }
}
