import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { kzCurrentMonth } from '../common/utils/business-date';
import { LngLat, estimateRoadKm, pointOf, roadDistanceKm } from './route-distance';
import { Settlement, SettlementRates, TaxPosition, fromBase, fromOnHand, fuelEstimate, fuelPerKmOf, money, monthlyDeduction, withPosition } from './settlement-calc';

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
