import { BadRequestException, Injectable } from '@nestjs/common';
import { DriverPayoutStatus, OrderStatus, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { kzCurrentMonth } from '../common/utils/business-date';
import { ExchangeDriversService } from './drivers.service';
import { ExchangeFuelService } from './fuel.service';
import { SettlementRates, actualPayout, money } from './settlement-calc';

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

const ROW_SELECT = {
    orderId: true, taxMonth: true, driverTotal: true, fuelEstimate: true, deductionAmount: true, rates: true,
    customerPrice: true, vat: true, parkFee: true, platformFee: true, preliminary: true, createdAt: true,
    driver: { select: { id: true, lastName: true, firstName: true, middleName: true, iin: true } },
    order: {
        select: {
            orderNumber: true, status: true, completedAt: true,
            routePoints: {
                select: { pointType: true, expectedDate: true, location: { select: { city: true, cityRecord: { select: { name: true } } } } },
                orderBy: { sequence: 'asc' as const },
            },
            driverPayoutItem: {
                select: {
                    gross: true, opv: true, vosms: true, ipn: true, so: true, net: true, toPay: true, fuelIssued: true, fuelReceipts: true,
                    payout: { select: { status: true, paidAt: true } },
                },
            },
            _count: { select: { exchangeFuelReceipts: { where: { status: 'PENDING' } } } },
        },
    },
} satisfies Prisma.ExchangeTripSettlementSelect;

type Row = Prisma.ExchangeTripSettlementGetPayload<{ select: typeof ROW_SELECT }>;

/** Что с деньгами рейса: от «везёт» до «выплачено». */
export type PayStatus = 'IN_TRIP' | 'TO_REQUEST' | DriverPayoutStatus;

const PAY_TEXT: Record<PayStatus, string> = {
    IN_TRIP: 'Рейс идёт',
    TO_REQUEST: 'Довезён, выплату не запрашивали',
    REQUESTED: 'Выплата запрошена',
    EXPORTED: 'В реестре 1С',
    PAID: 'Выплачено',
    REJECTED: 'Выплата отклонена',
};

export interface RegistryLine {
    orderId: string;
    orderNumber: string;
    route: string;
    loadingDate: Date | null;
    completedAt: Date | null;
    driver: { id: string; name: string; iin: string | null };
    /** Договорились: на руки с топливом. */
    driverTotal: number;
    fuelEstimate: number;
    fuelIssued: number;
    fuelReceipts: number;
    /** Начислено по ГПХ (вознаграждение до удержаний). */
    gross: number;
    opv: number;
    vosms: number;
    ipn: number;
    /** Удержано из дохода водителя: ОПВ + ВОСМС + ИПН. */
    withheld: number;
    /** СО — платит парк от себя. */
    so: number;
    /** В бюджет всего: удержанное + СО. */
    toBudget: number;
    deductionAmount: number;
    /** Сколько перечислить водителю: итог минус выданное на топливо. */
    toPay: number;
    /** Сколько фактически выплачено (бухгалтер отметил «выплачено»). */
    paid: number;
    payStatus: PayStatus;
    payStatusText: string;
    /** Суммы зафиксированы в выплате; до запроса — оценка по текущим чекам. */
    fixed: boolean;
    preliminary: boolean;
    fuelReceiptsPending: number;
    customerPrice: number;
    vat: number;
    parkFee: number;
    platformFee: number;
}

const TOTAL_KEYS = ['driverTotal', 'fuelIssued', 'fuelReceipts', 'gross', 'opv', 'vosms', 'ipn', 'withheld', 'so', 'toBudget', 'deductionAmount', 'toPay', 'paid', 'customerPrice', 'vat', 'parkFee', 'platformFee'] as const;
type Totals = Record<typeof TOTAL_KEYS[number], number>;

function sum(lines: RegistryLine[]): Totals {
    const t = Object.fromEntries(TOTAL_KEYS.map((k) => [k, 0])) as Totals;
    // Складываем в тиынах — без погрешности дробей.
    for (const l of lines) for (const k of TOTAL_KEYS) t[k] += Math.round(l[k] * 100);
    for (const k of TOTAL_KEYS) t[k] /= 100;
    return t;
}

function nameOf(d: { lastName: string | null; firstName: string | null; middleName: string | null }) {
    return [d.lastName, d.firstName, d.middleName].filter(Boolean).join(' ') || 'Водитель';
}

function routeOf(r: Row['order']): string {
    const city = (p?: { location: { city: string | null; cityRecord: { name: string } | null } }) =>
        p ? p.location.cityRecord?.name || p.location.city || '—' : '—';
    const pickup = r.routePoints.find((p) => p.pointType !== 'DELIVERY');
    const delivery = [...r.routePoints].reverse().find((p) => p.pointType === 'DELIVERY');
    return `${city(pickup)} → ${city(delivery)}`;
}

/**
 * Реестр бухгалтера парка за месяц (задача 15.10.2026): все рейсы водителей
 * без ИП с расчётом — начислено, удержано, в бюджет, выплачено, статусы
 * проверки и оплаты. Месяц — месяц дохода рейса (по погрузке), тот же, по
 * которому копится вычет. Только чтение: деньги никуда не уходят.
 */
@Injectable()
export class ExchangeParkRegistryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly drivers: ExchangeDriversService,
        private readonly fuel: ExchangeFuelService,
    ) {}

    async month(parkId: string, monthRaw?: string) {
        await this.drivers.assertPark(parkId);
        const month = monthRaw || kzCurrentMonth();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Месяц — в виде ГГГГ-ММ');
        const rows = await this.prisma.exchangeTripSettlement.findMany({
            where: { parkCompanyId: parkId, taxMonth: month, order: { status: { not: OrderStatus.CANCELLED } } },
            select: ROW_SELECT,
            orderBy: { createdAt: 'asc' },
        });
        const fuel = await this.fuel.totals(rows.map((r) => r.orderId));
        const confirmed = !!(await this.prisma.parkPayoutRates.findUnique({ where: { parkCompanyId: parkId }, select: { ratesConfirmedAt: true } }))?.ratesConfirmedAt;
        const lines = rows.map((r) => this.line(r, fuel.get(r.orderId) ?? { issued: 0, receipts: 0 }, confirmed));

        const byDriver = new Map<string, RegistryLine[]>();
        for (const l of lines) byDriver.set(l.driver.id, [...(byDriver.get(l.driver.id) ?? []), l]);
        const drivers = Array.from(byDriver.values()).map((ls) => ({ driver: ls[0].driver, trips: ls.length, ...sum(ls) }));

        return { month, preliminary: !confirmed || lines.some((l) => l.preliminary), lines, drivers, totals: { trips: lines.length, ...sum(lines) } };
    }

    private line(r: Row, f: { issued: number; receipts: number }, confirmed: boolean): RegistryLine {
        const item = r.order.driverPayoutItem;
        // Выплата запрошена — суммы из неё (их и выгружали в 1С); нет — оценка по текущим чекам.
        const live = item ? null : actualPayout(num(r.driverTotal), f.issued, f.receipts, r.rates as unknown as SettlementRates, num(r.deductionAmount));
        const a = item ? {
            gross: num(item.gross), opv: num(item.opv), vosms: num(item.vosms), ipn: num(item.ipn), so: num(item.so),
            toPay: item.toPay != null ? num(item.toPay) : num(item.net),
            fuelIssued: num(item.fuelIssued), fuelReceipts: num(item.fuelReceipts),
        } : { gross: live!.gross, opv: live!.opv, vosms: live!.vosms, ipn: live!.ipn, so: live!.so, toPay: live!.toPay, fuelIssued: live!.fuelIssued, fuelReceipts: live!.fuelReceipts };
        const withheld = money(a.opv + a.vosms + a.ipn);
        const payStatus: PayStatus = item ? item.payout.status
            : r.order.status === OrderStatus.COMPLETED ? 'TO_REQUEST' : 'IN_TRIP';
        const pickup = r.order.routePoints.find((p) => p.pointType !== 'DELIVERY');
        return {
            orderId: r.orderId,
            orderNumber: r.order.orderNumber,
            route: routeOf(r.order),
            loadingDate: pickup?.expectedDate ?? null,
            completedAt: r.order.completedAt,
            driver: { id: r.driver.id, name: nameOf(r.driver), iin: r.driver.iin },
            driverTotal: num(r.driverTotal),
            fuelEstimate: num(r.fuelEstimate),
            fuelIssued: a.fuelIssued,
            fuelReceipts: a.fuelReceipts,
            gross: a.gross, opv: a.opv, vosms: a.vosms, ipn: a.ipn, withheld, so: a.so,
            toBudget: money(withheld + a.so),
            deductionAmount: num(r.deductionAmount),
            toPay: a.toPay,
            paid: item?.payout.status === 'PAID' ? a.toPay : 0,
            payStatus,
            payStatusText: PAY_TEXT[payStatus],
            fixed: !!item,
            preliminary: !confirmed || r.preliminary,
            fuelReceiptsPending: r.order._count.exchangeFuelReceipts,
            customerPrice: num(r.customerPrice),
            vat: num(r.vat),
            parkFee: num(r.parkFee),
            platformFee: num(r.platformFee),
        };
    }

    /** Тот же реестр в Excel: по рейсам и итоги по водителям. */
    async export(parkId: string, monthRaw?: string) {
        const r = await this.month(parkId, monthRaw);
        const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
        const calc = (p: boolean) => (p ? 'предварительный' : 'подтверждён');
        const trips = r.lines.map((l, i) => ({
            '№': i + 1,
            'Заявка': l.orderNumber,
            'Маршрут': l.route,
            'Погрузка': date(l.loadingDate),
            'Довезён': date(l.completedAt),
            'ФИО': l.driver.name,
            'ИИН': l.driver.iin ?? '',
            'Договорились (на руки с топливом)': l.driverTotal,
            'Выдано на топливо': l.fuelIssued,
            'Топливо по чекам': l.fuelReceipts,
            'Начислено (ГПХ)': l.gross,
            'ОПВ': l.opv,
            'ВОСМС': l.vosms,
            'ИПН': l.ipn,
            'Удержано всего': l.withheld,
            'СО (за счёт парка)': l.so,
            'В бюджет всего': l.toBudget,
            'Вычет ИПН': l.deductionAmount,
            'К перечислению водителю': l.toPay,
            'Выплачено': l.paid,
            'Оплата': l.payStatusText,
            'Чеков ждут проверки': l.fuelReceiptsPending,
            'Расчёт': calc(l.preliminary),
            'Суммы': l.fixed ? 'из выплаты' : 'оценка по текущим чекам',
            'Цена для компании': l.customerPrice,
            'НДС': l.vat,
            'Комиссия парка': l.parkFee,
            'Комиссия LogiCore': l.platformFee,
        }));
        const drivers = r.drivers.map((d) => ({
            'ФИО': d.driver.name,
            'ИИН': d.driver.iin ?? '',
            'Рейсов': d.trips,
            'Начислено (ГПХ)': d.gross,
            'ОПВ': d.opv,
            'ВОСМС': d.vosms,
            'ИПН': d.ipn,
            'Удержано всего': d.withheld,
            'СО (за счёт парка)': d.so,
            'В бюджет всего': d.toBudget,
            'Вычет ИПН за месяц': d.deductionAmount,
            'К перечислению': d.toPay,
            'Выплачено': d.paid,
        }));
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(trips), 'Рейсы');
        XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(drivers), 'По водителям');
        if (r.preliminary) {
            XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
                ['РАСЧЁТ ПРЕДВАРИТЕЛЬНЫЙ'],
                ['Бухгалтер парка ещё не подтвердил ставки и порядок расчёта, или рейсы посчитаны до подтверждения.'],
                ['Суммы налогов и взносов сверить до уплаты.'],
            ]), 'Внимание');
        }
        return { buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer, month: r.month, count: r.lines.length };
    }
}
