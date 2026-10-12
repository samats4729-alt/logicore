import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { kzCurrentMonth } from '../common/utils/business-date';
import { LngLat, estimateRoadKm, pointOf, roadDistanceKm } from './route-distance';
import { Settlement, SettlementRates, fromCustomerPrice, fromDriverTotal, fuelEstimate } from './settlement-calc';

/** Комиссия LogiCore по умолчанию, % — меняется в админке (ключ платформы). */
export const PLATFORM_FEE_KEY = 'exchange_platform_fee_pct';
const PLATFORM_FEE_DEFAULT = 5;

/** Настройки парка по умолчанию — как в калькуляции шефа (2026). */
export const PARK_DEFAULTS = {
    commissionPct: 5, opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5,
    fuelPerKm: 100, applyDeduction: true, deductionMrp: 30, mrp: 4325,
};

/** Что нужно, чтобы посчитать рейс конкретному водителю: ставки, топливо, вычет. */
export interface SettlementContext {
    rates: SettlementRates;
    fuelPerKm: number;
    distanceKm: number | null;
    fuel: number;
    taxMonth: string;
    deductionApplied: boolean;
}

/** Расчёт и то, из чего он получился, — замораживается в отклике и в рейсе. */
export type SettlementCalc = Settlement & Omit<SettlementContext, 'deductionApplied'>;

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
 * расстояние маршрута, месяц дохода и был ли уже вычет в этом месяце.
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

    /** Ставки парка вместе с комиссией LogiCore. */
    async parkSettings(parkId: string) {
        const row = await this.prisma.parkPayoutRates.findUnique({ where: { parkCompanyId: parkId } });
        const p = row ? {
            commissionPct: num(row.commissionPct), opvPct: num(row.opvPct), vosmsPct: num(row.vosmsPct),
            ipnPct: num(row.ipnPct), soPct: num(row.soPct), fuelPerKm: num(row.fuelPerKm),
            applyDeduction: row.applyDeduction, deductionMrp: row.deductionMrp, mrp: row.mrp,
        } : PARK_DEFAULTS;
        const rates: SettlementRates = {
            opvPct: p.opvPct, vosmsPct: p.vosmsPct, ipnPct: p.ipnPct, soPct: p.soPct,
            platformPct: await this.platformPct(), parkPct: p.commissionPct,
            deductionMrp: p.deductionMrp, mrp: p.mrp,
        };
        return { rates, fuelPerKm: p.fuelPerKm, applyDeduction: p.applyDeduction };
    }

    /** Ставки парка водителя и месяцы, в которых вычет уже был, — один раз на ленту. */
    async driverBase(driver: { id: string; parkCompanyId: string }) {
        const settings = await this.parkSettings(driver.parkCompanyId);
        const used = await this.prisma.exchangeTripSettlement.findMany({
            where: { driverId: driver.id, deductionApplied: true },
            select: { taxMonth: true, orderId: true },
        });
        return { ...settings, usedMonths: used };
    }

    /**
     * Контекст расчёта по строке заявки: расстояние (посчитано при выставлении,
     * иначе — оценка по прямой), месяц дохода (месяц первой погрузки, без даты —
     * текущий) и положен ли вычет (в этом месяце его у водителя ещё не было).
     */
    contextFromRow(base: Awaited<ReturnType<ExchangeSettlementService['driverBase']>>, row: RouteRow): SettlementContext {
        const points = row.routePoints.map((p) => pointOf(p.location)).filter((p): p is LngLat => !!p);
        const distanceKm = row.exchangeDistanceKm ?? estimateRoadKm(points);
        const pickup = row.routePoints.find((p) => p.pointType !== 'DELIVERY' && p.expectedDate);
        const taxMonth = kzCurrentMonth(pickup?.expectedDate ?? new Date());
        const deductionApplied = base.applyDeduction && !base.usedMonths.some((u) => u.taxMonth === taxMonth && u.orderId !== row.id);
        return { rates: base.rates, fuelPerKm: base.fuelPerKm, distanceKm, fuel: fuelEstimate(distanceKm, base.fuelPerKm), taxMonth, deductionApplied };
    }

    /** Контекст для одной заявки — отклик и выбор исполнителя. */
    async context(driver: { id: string; parkCompanyId: string }, orderId: string): Promise<SettlementContext> {
        const row = await this.prisma.order.findUnique({ where: { id: orderId }, select: ROUTE_SELECT });
        if (!row) throw new BadRequestException('Заявка не найдена');
        return this.contextFromRow(await this.driverBase(driver), row);
    }

    /** Расстояние по дорогам — при выставлении на биржу; не вышло — по прямой. */
    async measure(orderId: string): Promise<number | null> {
        const row = await this.prisma.order.findUnique({ where: { id: orderId }, select: ROUTE_SELECT });
        if (!row) return null;
        const km = await roadDistanceKm(row.routePoints.map((p) => pointOf(p.location)).filter((p): p is LngLat => !!p));
        await this.prisma.order.update({ where: { id: orderId }, data: { exchangeDistanceKm: km } });
        return km;
    }

    /** Водитель назвал сумму на руки → полный расчёт. Ошибку суммы — словами. */
    byDriverTotal(ctx: SettlementContext, driverTotal: number): SettlementCalc {
        try {
            const s = fromDriverTotal(driverTotal, ctx.fuel, ctx.rates, ctx.deductionApplied);
            return { ...s, rates: ctx.rates, fuelPerKm: ctx.fuelPerKm, distanceKm: ctx.distanceKm, taxMonth: ctx.taxMonth };
        } catch (e) {
            throw new BadRequestException((e as Error).message);
        }
    }

    /** Цена компании → полный расчёт; цена меньше топлива — водителю показать нечего. */
    byCustomerPrice(ctx: SettlementContext, customerPrice: number): SettlementCalc | null {
        try {
            const s = fromCustomerPrice(customerPrice, ctx.fuel, ctx.rates, ctx.deductionApplied);
            return { ...s, rates: ctx.rates, fuelPerKm: ctx.fuelPerKm, distanceKm: ctx.distanceKm, taxMonth: ctx.taxMonth };
        } catch {
            return null;
        }
    }

    /** Зафиксировать расчёт рейса — когда компания выбрала водителя. */
    fixData(orderId: string, driver: { id: string; parkCompanyId: string }, c: SettlementCalc): Prisma.ExchangeTripSettlementUncheckedCreateInput {
        return {
            orderId, driverId: driver.id, parkCompanyId: driver.parkCompanyId, taxMonth: c.taxMonth,
            distanceKm: c.distanceKm, fuelPerKm: c.fuelPerKm, fuelEstimate: c.fuel,
            driverTotal: c.driverTotal, workNet: c.workNet, gross: c.gross, opv: c.opv, vosms: c.vosms, ipn: c.ipn,
            so: c.so, parkCost: c.parkCost, platformFee: c.platformFee, parkFee: c.parkFee, customerPrice: c.customerPrice,
            deductionApplied: c.deductionApplied, deductionAmount: c.deductionAmount,
            rates: c.rates as unknown as Prisma.InputJsonValue,
        };
    }
}
