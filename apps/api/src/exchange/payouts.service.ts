import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DriverPayoutStatus, OrderStatus, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeDriversService } from './drivers.service';
import { PayoutAmounts, PayoutRates, calcPayout, normalizeIban, sumPayouts } from './payout-calc';
import { SettlementRates, actualPayout, money } from './settlement-calc';
import { ExchangeFuelService } from './fuel.service';
import { ExchangeSettlementService, PARK_DEFAULTS } from './settlement.service';

/** Настройки парка: ставки и расчёт «на руки» (топливо на км, вычет). */
type ParkRatesInput = PayoutRates & { fuelPerKm?: number; applyDeduction?: boolean; deductionMrp?: number; mrp?: number };

const DEFAULT_RATES: PayoutRates = { commissionPct: 5, opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5 };

const TRIP_SELECT = {
    id: true, orderNumber: true, driverCost: true, completedAt: true,
    /** Рейс по расчёту «на руки» (12.10.2026) — выплата считается от него, а не от цены. */
    exchangeSettlement: { select: { driverTotal: true, deductionApplied: true, rates: true } },
    routePoints: {
        select: { pointType: true, location: { select: { city: true, cityRecord: { select: { name: true } } } } },
        orderBy: { sequence: 'asc' as const },
    },
} satisfies Prisma.OrderSelect;

type TripRow = Prisma.OrderGetPayload<{ select: typeof TRIP_SELECT }>;

function route(r: TripRow): string {
    const city = (p?: { location: { city: string | null; cityRecord: { name: string } | null } }) =>
        p ? p.location.cityRecord?.name || p.location.city || '—' : '—';
    const pickup = r.routePoints.find((p) => p.pointType !== 'DELIVERY');
    const delivery = [...r.routePoints].reverse().find((p) => p.pointType === 'DELIVERY');
    return `${city(pickup)} → ${city(delivery)}`;
}

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

/**
 * Строка выплаты: удержания и сколько перечислить. По расчёту «на руки»
 * ещё итог по договорённости и топливо; у прежнего расчёта этих полей нет,
 * а перечисляется net.
 */
export interface PayoutLine extends PayoutAmounts {
    driverTotal: number | null;
    fuelIssued: number | null;
    fuelReceipts: number | null;
    toPay: number;
}

type AmountsRow = {
    gross: Prisma.Decimal; commission: Prisma.Decimal; opv: Prisma.Decimal; vosms: Prisma.Decimal; ipn: Prisma.Decimal;
    net: Prisma.Decimal; so: Prisma.Decimal; toPay: Prisma.Decimal | null; fuelIssued: Prisma.Decimal | null;
    driverTotal?: Prisma.Decimal | null; fuelReceipts?: Prisma.Decimal | null;
};

/**
 * Суммы выплаты из базы — числами. `net` наружу — сколько перечислить:
 * так его и показывало приложение («к выплате»); доход за работу на руки —
 * `workNet`.
 */
function amountsOf(row: AmountsRow) {
    const toPay = row.toPay != null ? num(row.toPay) : num(row.net);
    return {
        gross: num(row.gross), commission: num(row.commission), opv: num(row.opv), vosms: num(row.vosms), ipn: num(row.ipn),
        so: num(row.so), workNet: num(row.net), net: toPay, toPay,
        driverTotal: row.driverTotal != null ? num(row.driverTotal) : null,
        fuelIssued: row.fuelIssued != null ? num(row.fuelIssued) : null,
        fuelReceipts: row.fuelReceipts != null ? num(row.fuelReceipts) : null,
    };
}

/** Итог выплаты по строкам. */
function sumLines(lines: PayoutLine[]) {
    const base = sumPayouts(lines);
    const anyFuel = lines.some((l) => l.fuelIssued != null);
    return {
        ...base,
        fuelIssued: anyFuel ? money(lines.reduce((s, l) => s + (l.fuelIssued ?? 0), 0)) : null,
        toPay: money(lines.reduce((s, l) => s + l.toPay, 0)),
    };
}

const STATUS_TEXT: Record<DriverPayoutStatus, string> = {
    REQUESTED: 'Запрошена', EXPORTED: 'Реестр выгружен', PAID: 'Выплачено', REJECTED: 'Отклонена',
};

/**
 * Деньги водителей парка.
 *
 * Водитель видит, сколько заработал за довезённые рейсы и сколько
 * удержано, и запрашивает выплату. Парк выгружает реестр в 1С, бухгалтер
 * платит из 1С и отмечает «выплачено». С банками и госорганами система не
 * связывается — так решил владелец. Рейс оплачивается один раз: строка
 * выплаты на рейс единственная.
 */
@Injectable()
export class ExchangePayoutsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly drivers: ExchangeDriversService,
        private readonly fuel: ExchangeFuelService,
        private readonly settlement: ExchangeSettlementService,
    ) {}

    /**
     * Строки выплаты по рейсам. Рейс по расчёту «на руки»: итог по
     * договорённости минус всё, что парк дал на топливо; налоги — с итога
     * минус принятые чеки, досчитаны сверху (их платит парк). Рейс по
     * прежнему расчёту — от цены, с комиссией парка из неё.
     */
    private async linesOf(trips: TripRow[], rates: PayoutRates): Promise<(PayoutLine & { orderId: string; itemRates: PayoutRates })[]> {
        const fuel = await this.fuel.totals(trips.filter((t) => t.exchangeSettlement).map((t) => t.id));
        return trips.map((t) => {
            const s = t.exchangeSettlement;
            if (!s) return { orderId: t.id, ...calcPayout(num(t.driverCost), rates), driverTotal: null, fuelIssued: null, fuelReceipts: null, toPay: 0, itemRates: rates };
            const r = s.rates as unknown as SettlementRates;
            const f = fuel.get(t.id) ?? { issued: 0, receipts: 0 };
            const a = actualPayout(num(s.driverTotal), f.issued, f.receipts, r, s.deductionApplied);
            return {
                orderId: t.id,
                gross: a.gross, commission: 0, opv: a.opv, vosms: a.vosms, ipn: a.ipn, net: a.workNet, so: a.so,
                driverTotal: a.driverTotal, fuelIssued: a.fuelIssued, fuelReceipts: a.fuelReceipts, toPay: a.toPay,
                itemRates: { commissionPct: r.parkPct, opvPct: r.opvPct, vosmsPct: r.vosmsPct, ipnPct: r.ipnPct, soPct: r.soPct },
            };
        }).map((l) => (l.driverTotal == null ? { ...l, toPay: l.net } : l));
    }

    // ==================== ставки ====================

    async rates(parkId: string): Promise<PayoutRates> {
        const row = await this.prisma.parkPayoutRates.findUnique({ where: { parkCompanyId: parkId } });
        if (!row) return DEFAULT_RATES;
        return { commissionPct: num(row.commissionPct), opvPct: num(row.opvPct), vosmsPct: num(row.vosmsPct), ipnPct: num(row.ipnPct), soPct: num(row.soPct) };
    }

    async parkRates(parkId: string) {
        await this.drivers.assertPark(parkId);
        const row = await this.prisma.parkPayoutRates.findUnique({ where: { parkCompanyId: parkId } });
        return {
            ...(await this.rates(parkId)),
            // Расчёт «на руки»: топливо на км, вычет по ИПН; комиссия LogiCore — для сведения.
            fuelPerKm: row ? num(row.fuelPerKm) : PARK_DEFAULTS.fuelPerKm,
            applyDeduction: row ? row.applyDeduction : PARK_DEFAULTS.applyDeduction,
            deductionMrp: row ? row.deductionMrp : PARK_DEFAULTS.deductionMrp,
            mrp: row ? row.mrp : PARK_DEFAULTS.mrp,
            platformPct: await this.settlement.platformPct(),
            updatedAt: row?.updatedAt ?? null,
            isDefault: !row,
        };
    }

    async setRates(parkId: string, userId: string, dto: ParkRatesInput) {
        await this.drivers.assertPark(parkId);
        const { fuelPerKm, applyDeduction, deductionMrp, mrp, ...percents } = dto;
        for (const [k, v] of Object.entries(percents)) {
            if (typeof v !== 'number' || v < 0 || v > 100) throw new BadRequestException(`Ставка ${k} — от 0 до 100 %`);
        }
        const extra = {
            ...(fuelPerKm != null ? { fuelPerKm } : {}),
            ...(applyDeduction != null ? { applyDeduction } : {}),
            ...(deductionMrp != null ? { deductionMrp } : {}),
            ...(mrp != null ? { mrp } : {}),
        };
        await this.prisma.parkPayoutRates.upsert({
            where: { parkCompanyId: parkId },
            create: { parkCompanyId: parkId, ...percents, ...extra, updatedById: userId },
            update: { ...percents, ...extra, updatedById: userId },
        });
        return this.parkRates(parkId);
    }

    // ==================== водитель ====================

    /** Водитель парка — у водителя с ИП выплат через платформу нет: он сам себе перевозчик. */
    private async parkDriver(userId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({
            where: { userId },
            select: { id: true, userId: true, kind: true, parkCompanyId: true, payoutIban: true, payoutBank: true, park: { select: { name: true } } },
        });
        if (!driver) throw new ForbiddenException('Сначала заполните анкету водителя');
        if (driver.kind !== 'PARK' || !driver.parkCompanyId) {
            throw new ForbiddenException('Выплаты через приложение — для водителей парка. С ИП вам платит заказчик напрямую.');
        }
        return driver as typeof driver & { parkCompanyId: string };
    }

    /** Довезённые рейсы водителя через его парк, за которые ещё не просили выплату. */
    private unpaidTrips(driver: { userId: string; parkCompanyId: string }) {
        return this.prisma.order.findMany({
            where: {
                driverId: driver.userId,
                partnerId: driver.parkCompanyId,
                status: OrderStatus.COMPLETED,
                driverCost: { not: null },
                driverPayoutItem: null,
            },
            select: TRIP_SELECT,
            orderBy: { completedAt: 'desc' },
        });
    }

    /** «Заработок» в приложении: к выплате, удержания, счёт, история выплат. */
    async earnings(userId: string) {
        const driver = await this.parkDriver(userId);
        const rates = await this.rates(driver.parkCompanyId);
        const rows = await this.unpaidTrips(driver);
        const lines = await this.linesOf(rows, rates);
        const trips = rows.map((t, i) => {
            const { orderId: _o, itemRates: _r, ...l } = lines[i];
            // `net` наружу — сколько перечислить (так его показывает приложение).
            return { orderId: t.id, orderNumber: t.orderNumber, route: route(t), completedAt: t.completedAt, ...l, workNet: l.net, net: l.toPay };
        });
        const payouts = await this.prisma.driverPayout.findMany({
            where: { driverId: driver.id },
            orderBy: { requestedAt: 'desc' },
            take: 30,
            select: {
                id: true, status: true, gross: true, commission: true, opv: true, vosms: true, ipn: true, net: true, so: true,
                toPay: true, fuelIssued: true,
                requestedAt: true, exportedAt: true, paidAt: true, rejectReason: true, _count: { select: { items: true } },
            },
        });
        return {
            parkName: driver.park?.name ?? null,
            rates,
            iban: driver.payoutIban,
            bank: driver.payoutBank,
            available: (() => { const t = sumLines(lines); return { ...t, workNet: t.net, net: t.toPay }; })(),
            trips,
            payouts: payouts.map((p) => ({
                id: p.id, status: p.status, ...amountsOf(p), trips: p._count.items,
                requestedAt: p.requestedAt, exportedAt: p.exportedAt, paidAt: p.paidAt, rejectReason: p.rejectReason,
            })),
        };
    }

    async setAccount(userId: string, dto: { iban: string; bank?: string }) {
        const driver = await this.parkDriver(userId);
        const iban = normalizeIban(dto.iban);
        if (!iban) throw new BadRequestException('IBAN — 20 знаков, начинается с KZ. Посмотрите его в приложении банка');
        await this.prisma.exchangeDriver.update({
            where: { id: driver.id },
            data: { payoutIban: iban, payoutBank: dto.bank?.trim() || null },
        });
        return { iban, bank: dto.bank?.trim() || null };
    }

    /** Запросить выплату за все довезённые и ещё не оплаченные рейсы. */
    async request(userId: string) {
        const driver = await this.parkDriver(userId);
        if (!driver.payoutIban) throw new BadRequestException('Укажите счёт для выплаты (IBAN) — на него парк переведёт деньги');
        const open = await this.prisma.driverPayout.count({ where: { driverId: driver.id, status: { in: ['REQUESTED', 'EXPORTED'] } } });
        if (open) throw new BadRequestException('Прошлая выплата ещё не завершена — дождитесь, пока парк её проведёт');

        const rates = await this.rates(driver.parkCompanyId);
        const trips = await this.unpaidTrips(driver);
        if (!trips.length) throw new BadRequestException('Пока нечего выплачивать — выплата появится за довезённые рейсы');

        const lines = await this.linesOf(trips, rates);
        const total = sumLines(lines);
        try {
            const payout = await this.prisma.driverPayout.create({
                data: {
                    parkCompanyId: driver.parkCompanyId,
                    driverId: driver.id,
                    ...total,
                    iban: driver.payoutIban,
                    bank: driver.payoutBank,
                    items: { create: lines.map(({ itemRates, ...l }) => ({ ...l, ...itemRates })) },
                },
                select: { id: true, net: true, toPay: true },
            });
            return { id: payout.id, net: payout.toPay != null ? num(payout.toPay) : num(payout.net), trips: lines.length };
        } catch (e) {
            // Два нажатия разом: второй запрос упирается в «рейс оплачивается один раз».
            if ((e as { code?: string }).code === 'P2002') throw new BadRequestException('Выплата за эти рейсы уже запрошена');
            throw e;
        }
    }

    // ==================== парк ====================

    async parkPayouts(parkId: string, status?: DriverPayoutStatus | 'all') {
        await this.drivers.assertPark(parkId);
        const rows = await this.prisma.driverPayout.findMany({
            where: { parkCompanyId: parkId, ...(status && status !== 'all' ? { status } : {}) },
            orderBy: { requestedAt: 'desc' },
            take: 300,
            select: {
                id: true, status: true, gross: true, commission: true, opv: true, vosms: true, ipn: true, net: true, so: true,
                toPay: true, fuelIssued: true,
                iban: true, bank: true, requestedAt: true, exportedAt: true, paidAt: true, rejectReason: true,
                driver: { select: { id: true, lastName: true, firstName: true, middleName: true, iin: true, phone: true } },
                _count: { select: { items: true } },
            },
        });
        return rows.map((p) => ({
            id: p.id, status: p.status, ...amountsOf(p), trips: p._count.items,
            iban: p.iban, bank: p.bank, requestedAt: p.requestedAt, exportedAt: p.exportedAt, paidAt: p.paidAt, rejectReason: p.rejectReason,
            driver: {
                id: p.driver.id,
                name: [p.driver.lastName, p.driver.firstName, p.driver.middleName].filter(Boolean).join(' ') || 'Водитель',
                iin: p.driver.iin, phone: p.driver.phone,
            },
        }));
    }

    async parkPayout(parkId: string, id: string) {
        await this.drivers.assertPark(parkId);
        const p = await this.prisma.driverPayout.findFirst({
            where: { id, parkCompanyId: parkId },
            include: {
                driver: { select: { lastName: true, firstName: true, middleName: true, iin: true, phone: true } },
                items: { include: { order: { select: TRIP_SELECT } } },
            },
        });
        if (!p) throw new NotFoundException('Выплата не найдена');
        return {
            id: p.id, status: p.status, ...amountsOf(p), iban: p.iban, bank: p.bank,
            requestedAt: p.requestedAt, exportedAt: p.exportedAt, paidAt: p.paidAt, rejectReason: p.rejectReason,
            driver: { name: [p.driver.lastName, p.driver.firstName, p.driver.middleName].filter(Boolean).join(' '), iin: p.driver.iin, phone: p.driver.phone },
            items: p.items.map((i) => ({
                orderNumber: i.order.orderNumber, route: route(i.order), completedAt: i.order.completedAt, ...amountsOf(i),
                rates: { commissionPct: num(i.commissionPct), opvPct: num(i.opvPct), vosmsPct: num(i.vosmsPct), ipnPct: num(i.ipnPct), soPct: num(i.soPct) },
            })),
        };
    }

    /**
     * Реестр выплат для 1С — таблица: кому, ИИН, счёт, начислено, удержано,
     * к выплате; второй лист — по рейсам. Выгруженные — «в 1С»: бухгалтер
     * платит из 1С. Повторная выгрузка тех же выплат разрешена.
     */
    async exportFor1C(parkId: string, ids: string[]) {
        await this.drivers.assertPark(parkId);
        if (!ids.length) throw new BadRequestException('Отметьте выплаты для выгрузки');
        const payouts = await this.prisma.driverPayout.findMany({
            where: { id: { in: ids }, parkCompanyId: parkId, status: { in: ['REQUESTED', 'EXPORTED'] } },
            include: {
                driver: { select: { lastName: true, firstName: true, middleName: true, iin: true } },
                items: { include: { order: { select: TRIP_SELECT } } },
            },
            orderBy: { requestedAt: 'asc' },
        });
        if (!payouts.length) throw new BadRequestException('Среди отмеченных нет выплат к выгрузке — выплаченные и отклонённые не выгружаются');

        const name = (d: { lastName: string | null; firstName: string | null; middleName: string | null }) =>
            [d.lastName, d.firstName, d.middleName].filter(Boolean).join(' ');
        const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
        // «К перечислению» — сколько отправить на счёт сейчас: по расчёту «на
        // руки» это итог минус уже выданное на топливо, у прежних — на руки.
        const registry = payouts.map((p, i) => ({
            '№': i + 1,
            'ФИО': name(p.driver),
            'ИИН': p.driver.iin ?? '',
            'IBAN': p.iban ?? '',
            'Банк': p.bank ?? '',
            'Рейсов': p.items.length,
            'Начислено': num(p.gross),
            'Комиссия парка': num(p.commission),
            'ОПВ': num(p.opv),
            'ВОСМС': num(p.vosms),
            'ИПН': num(p.ipn),
            'На руки за работу': num(p.net),
            'Выдано на топливо': num(p.fuelIssued),
            'К перечислению': amountsOf(p).toPay,
            'СО (за счёт парка)': num(p.so),
            'Дата запроса': date(p.requestedAt),
            'Код выплаты': p.id,
        }));
        const trips = payouts.flatMap((p) => p.items.map((it) => ({
            'ФИО': name(p.driver),
            'ИИН': p.driver.iin ?? '',
            'Заявка': it.order.orderNumber,
            'Маршрут': route(it.order),
            'Довезён': date(it.order.completedAt),
            'Итог водителю (договорились)': it.driverTotal != null ? num(it.driverTotal) : '',
            'Топливо по чекам': it.fuelReceipts != null ? num(it.fuelReceipts) : '',
            'Начислено': num(it.gross),
            'Комиссия парка': num(it.commission),
            'ОПВ': num(it.opv),
            'ВОСМС': num(it.vosms),
            'ИПН': num(it.ipn),
            'На руки за работу': num(it.net),
            'Выдано на топливо': num(it.fuelIssued),
            'К перечислению': amountsOf(it).toPay,
            'Код выплаты': p.id,
        })));

        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(registry), 'Реестр выплат');
        XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(trips), 'По рейсам');
        const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

        await this.prisma.driverPayout.updateMany({
            where: { id: { in: payouts.map((p) => p.id) }, status: 'REQUESTED' },
            data: { status: 'EXPORTED', exportedAt: new Date() },
        });
        return { buffer, count: payouts.length };
    }

    async markPaid(parkId: string, id: string, userId: string) {
        await this.drivers.assertPark(parkId);
        const { count } = await this.prisma.driverPayout.updateMany({
            where: { id, parkCompanyId: parkId, status: { in: ['REQUESTED', 'EXPORTED'] } },
            data: { status: 'PAID', paidAt: new Date(), decidedById: userId },
        });
        if (!count) throw new BadRequestException('Выплата уже проведена или отклонена');
        return { ok: true };
    }

    /** Отклонить — с причиной; рейсы снова доступны к выплате. */
    async reject(parkId: string, id: string, userId: string, reason: string) {
        await this.drivers.assertPark(parkId);
        await this.prisma.$transaction(async (tx) => {
            const { count } = await tx.driverPayout.updateMany({
                where: { id, parkCompanyId: parkId, status: { in: ['REQUESTED', 'EXPORTED'] } },
                data: { status: 'REJECTED', rejectReason: reason.trim(), decidedById: userId },
            });
            if (!count) throw new BadRequestException('Выплата уже проведена или отклонена');
            await tx.driverPayoutItem.deleteMany({ where: { payoutId: id } });
        });
        return { ok: true };
    }

    /** Для сводки кабинета: сколько выплат ждут и на какую сумму. */
    async pendingSummary(parkId: string) {
        const rows = await this.prisma.driverPayout.findMany({
            where: { parkCompanyId: parkId, status: { in: ['REQUESTED', 'EXPORTED'] } },
            select: { net: true, toPay: true },
        });
        // Сколько перечислить: по расчёту «на руки» — toPay, у прежних — net.
        return { count: rows.length, net: money(rows.reduce((s, r) => s + (r.toPay != null ? num(r.toPay) : num(r.net)), 0)) };
    }

    static statusText(status: DriverPayoutStatus) {
        return STATUS_TEXT[status];
    }
}
