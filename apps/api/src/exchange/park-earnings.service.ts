import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Период отбора — по дню расчёта рейса (выбор водителя) или оплаты подписки. */
export interface EarningsPeriod {
    from?: string;
    to?: string;
}

function periodWhere(p: EarningsPeriod): { gte?: Date; lt?: Date } | undefined {
    const gte = p.from ? new Date(`${p.from}T00:00:00+05:00`) : undefined;
    const lt = p.to ? new Date(new Date(`${p.to}T00:00:00+05:00`).getTime() + 24 * 3600 * 1000) : undefined;
    if (!gte && !lt) return undefined;
    return { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) };
}

/**
 * Сколько LogiCore заработала на каждом парке (Q19, владелец 25.10.2026).
 *
 * Счета парку выставляют сотрудники вручную — система только считает и
 * показывает, по каждому парку: выполненные рейсы, сумму перевозок,
 * начисленную долю LogiCore, общий заработок платформы на парке и историю
 * по датам. Только для администрации платформы.
 *
 * Доля LogiCore берётся та, что записана в рейсе при выборе водителя
 * (`ExchangeTripSettlement.platformFee`), а не пересчитывается по
 * сегодняшней ставке: по утверждённой схеме (шеф, 16.10.2026) это 5 % из
 * 10 % комиссии со всей суммы рейса, и ставка могла меняться в админке.
 * «Начислено» — по довезённым рейсам; рейсы в работе показаны отдельно.
 * Заработок платформы — доля с рейсов плюс оплаченная подписка.
 */
@Injectable()
export class ExchangeParkEarningsService {
    constructor(private readonly prisma: PrismaService) {}

    async summary(period: EarningsPeriod = {}) {
        const createdAt = periodWhere(period);
        const [parks, trips, cardPaid, invoicePaid] = await Promise.all([
            this.prisma.company.findMany({ where: { isPark: true }, select: { id: true, name: true, bin: true }, orderBy: { name: 'asc' } }),
            this.prisma.exchangeTripSettlement.findMany({
                where: { ...(createdAt ? { createdAt } : {}) },
                select: { parkCompanyId: true, customerPrice: true, vat: true, platformFee: true, createdAt: true, order: { select: { status: true } } },
            }),
            this.prisma.subscriptionPayment.groupBy({
                by: ['companyId'],
                where: { status: 'SUCCESS', ...(createdAt ? { paidAt: createdAt } : {}) },
                _sum: { amount: true },
            }),
            this.prisma.subscriptionRequest.groupBy({
                by: ['companyId'],
                where: { status: 'APPROVED', ...(createdAt ? { decidedAt: createdAt } : {}) },
                _sum: { amount: true },
            }),
        ]);

        const subscription = new Map<string, number>();
        for (const row of [...cardPaid, ...invoicePaid]) {
            subscription.set(row.companyId, (subscription.get(row.companyId) ?? 0) + (row._sum.amount ?? 0));
        }

        const rows = parks.map((park) => {
            const own = trips.filter((t) => t.parkCompanyId === park.id);
            const done = own.filter((t) => t.order.status === OrderStatus.COMPLETED);
            const inWork = own.filter((t) => t.order.status !== OrderStatus.COMPLETED && t.order.status !== OrderStatus.CANCELLED);
            const commission = round2(done.reduce((s, t) => s + num(t.platformFee), 0));
            const subscriptionPaid = subscription.get(park.id) ?? 0;
            return {
                parkId: park.id,
                name: park.name,
                bin: park.bin,
                tripsCompleted: done.length,
                tripsInWork: inWork.length,
                /** Сумма перевозок — что заплатили за довезённые рейсы, с НДС, если он есть. */
                turnover: round2(done.reduce((s, t) => s + num(t.customerPrice), 0)),
                turnoverVat: round2(done.reduce((s, t) => s + num(t.vat), 0)),
                /** Доля LogiCore по довезённым рейсам. */
                commission,
                /** Ещё начислится, когда довезут рейсы в работе. */
                commissionInWork: round2(inWork.reduce((s, t) => s + num(t.platformFee), 0)),
                subscriptionPaid,
                /** Заработок платформы на парке: доля с рейсов и подписка. */
                platformTotal: round2(commission + subscriptionPaid),
                lastTripAt: own.reduce<Date | null>((last, t) => (!last || t.createdAt > last ? t.createdAt : last), null),
            };
        });

        const sum = (key: 'tripsCompleted' | 'tripsInWork' | 'turnover' | 'commission' | 'commissionInWork' | 'subscriptionPaid' | 'platformTotal') =>
            round2(rows.reduce((s, r) => s + r[key], 0));
        return {
            rows,
            totals: {
                tripsCompleted: sum('tripsCompleted'),
                tripsInWork: sum('tripsInWork'),
                turnover: sum('turnover'),
                commission: sum('commission'),
                commissionInWork: sum('commissionInWork'),
                subscriptionPaid: sum('subscriptionPaid'),
                platformTotal: sum('platformTotal'),
            },
        };
    }

    /** История по парку: рейсы с долей LogiCore и оплаты подписки — свежие сверху. */
    async history(parkId: string, period: EarningsPeriod = {}) {
        const park = await this.prisma.company.findFirst({ where: { id: parkId, isPark: true }, select: { id: true, name: true, bin: true } });
        if (!park) throw new NotFoundException('Парк не найден');
        const createdAt = periodWhere(period);
        const [trips, payments, requests] = await Promise.all([
            this.prisma.exchangeTripSettlement.findMany({
                where: { parkCompanyId: parkId, ...(createdAt ? { createdAt } : {}) },
                select: {
                    createdAt: true, customerPrice: true, vat: true, platformFee: true, rates: true,
                    order: { select: { id: true, orderNumber: true, status: true, completedAt: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 500,
            }),
            this.prisma.subscriptionPayment.findMany({
                where: { companyId: parkId, status: 'SUCCESS', ...(createdAt ? { paidAt: createdAt } : {}) },
                select: { id: true, paidAt: true, createdAt: true, amount: true, months: true },
            }),
            this.prisma.subscriptionRequest.findMany({
                where: { companyId: parkId, status: 'APPROVED', ...(createdAt ? { decidedAt: createdAt } : {}) },
                select: { id: true, decidedAt: true, createdAt: true, amount: true, months: true, decisionNote: true },
            }),
        ]);

        const items = [
            ...trips.map((t) => ({
                kind: 'TRIP' as const,
                at: t.order.completedAt ?? t.createdAt,
                orderId: t.order.id,
                orderNumber: t.order.orderNumber,
                status: t.order.status,
                amount: num(t.customerPrice),
                vat: num(t.vat),
                commission: num(t.platformFee),
                commissionPct: Number((t.rates as any)?.platformPct ?? 0) || null,
                /** Начислено — рейс довезён; иначе ещё не начислено. */
                accrued: t.order.status === OrderStatus.COMPLETED,
                note: null as string | null,
            })),
            ...payments.map((p) => ({
                kind: 'SUBSCRIPTION' as const, at: p.paidAt ?? p.createdAt, orderId: null, orderNumber: null, status: null,
                amount: p.amount, vat: 0, commission: 0, commissionPct: null, accrued: true, note: `Подписка картой на ${p.months} мес.`,
            })),
            ...requests.map((r) => ({
                kind: 'SUBSCRIPTION' as const, at: r.decidedAt ?? r.createdAt, orderId: null, orderNumber: null, status: null,
                amount: r.amount, vat: 0, commission: 0, commissionPct: null, accrued: true,
                note: `Подписка по счёту на ${r.months} мес.${r.decisionNote ? ` · ${r.decisionNote}` : ''}`,
            })),
        ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

        return { park, items };
    }
}
