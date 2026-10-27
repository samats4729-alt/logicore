import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { kzStartOfMonth } from '../common/utils/business-date';
import { ExchangeDriversService } from './drivers.service';

/** Рейс идёт: водитель назначен и ещё не довёз. */
const ACTIVE: OrderStatus[] = [
    OrderStatus.ASSIGNED, OrderStatus.EN_ROUTE_PICKUP, OrderStatus.AT_PICKUP, OrderStatus.LOADING,
    OrderStatus.IN_TRANSIT, OrderStatus.AT_DELIVERY, OrderStatus.UNLOADING, OrderStatus.PROBLEM,
];

/** Буквы кода без похожих друг на друга: 0/O, 1/I/L — код диктуют по телефону. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode(): string {
    return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

const TRIP_SELECT = {
    id: true, orderNumber: true, status: true, driverCost: true, createdAt: true, completedAt: true,
    assignedDriverName: true, assignedDriverPlate: true,
    // Расчёт «на руки»: итог водителю, топливо по оценке, доля парка и LogiCore.
    exchangeSettlement: {
        select: {
            scheme: true, driverTotal: true, fuelEstimate: true, parkFee: true, platformFee: true,
            gross: true, opv: true, vosms: true, so: true, ipn: true, preliminary: true,
        },
    },
    // Чеки на топливо: сколько есть и сколько ждут решения. Отклонённые — не в счёт.
    exchangeFuelReceipts: { where: { status: { not: 'REJECTED' } }, select: { status: true } },
    forwarder: { select: { name: true } },
    subForwarder: { select: { name: true } },
    customerCompany: { select: { name: true } },
    routePoints: {
        select: { pointType: true, expectedDate: true, location: { select: { city: true, cityRecord: { select: { name: true } } } } },
        orderBy: { sequence: 'asc' as const },
    },
} satisfies Prisma.OrderSelect;

export type ParkTripFilter = 'active' | 'done' | 'all';

/**
 * Кабинет парка: сколько водителей ждут проверки и работают, какие рейсы
 * идут, сколько заработали за месяц, и приглашение водителя кодом.
 *
 * Рейсы парка — заявки, где парк записан перевозчиком: так заявка
 * оформляется, когда компания выбирает на бирже водителя без ИП. Парк видит
 * то, что положено перевозчику: кто везёт, маршрут, статус и сумму за рейс,
 * но не цену заказчика.
 */
@Injectable()
export class ExchangeParkService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly drivers: ExchangeDriversService,
    ) {}

    async overview(companyId: string) {
        await this.drivers.assertPark(companyId);
        const monthStart = kzStartOfMonth();
        const [pending, approved, activeTrips, monthTrips] = await Promise.all([
            this.prisma.exchangeDriver.count({ where: { parkCompanyId: companyId, status: 'PENDING' } }),
            this.prisma.exchangeDriver.count({ where: { parkCompanyId: companyId, status: 'APPROVED' } }),
            this.prisma.order.count({ where: { partnerId: companyId, status: { in: ACTIVE } } }),
            this.prisma.order.aggregate({
                where: { partnerId: companyId, status: OrderStatus.COMPLETED, completedAt: { gte: monthStart } },
                _count: true,
                _sum: { driverCost: true },
            }),
        ]);
        return {
            pendingDrivers: pending,
            approvedDrivers: approved,
            activeTrips,
            monthTrips: monthTrips._count,
            monthSum: Number(monthTrips._sum.driverCost ?? 0),
            inviteCode: await this.inviteCode(companyId),
            pendingPayouts: await this.payoutsPending(companyId),
        };
    }

    async trips(companyId: string, filter: ParkTripFilter = 'active') {
        await this.drivers.assertPark(companyId);
        const status = filter === 'active' ? { in: ACTIVE }
            : filter === 'done' ? { in: [OrderStatus.COMPLETED] }
                : undefined;
        const rows = await this.prisma.order.findMany({
            where: { partnerId: companyId, ...(status ? { status } : {}) },
            select: TRIP_SELECT,
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
        const city = (p?: { location: { city: string | null; cityRecord: { name: string } | null } }) =>
            p ? p.location.cityRecord?.name || p.location.city || '—' : '—';
        return rows.map((r) => {
            const pickup = r.routePoints.find((p) => p.pointType !== 'DELIVERY');
            const delivery = [...r.routePoints].reverse().find((p) => p.pointType === 'DELIVERY');
            return {
                id: r.id,
                orderNumber: r.orderNumber,
                status: r.status,
                price: r.driverCost != null ? Number(r.driverCost) : null,
                driverName: r.assignedDriverName,
                vehiclePlate: r.assignedDriverPlate,
                from: city(pickup),
                to: city(delivery),
                loadingDate: pickup?.expectedDate ?? null,
                customerName: r.subForwarder?.name || r.forwarder?.name || r.customerCompany?.name || null,
                /** Расчёт «на руки» — у рейсов после 12.10.2026; у прежних — пусто. */
                settlement: r.exchangeSettlement ? {
                    driverTotal: Number(r.exchangeSettlement.driverTotal),
                    fuelEstimate: Number(r.exchangeSettlement.fuelEstimate),
                    parkFee: Number(r.exchangeSettlement.parkFee),
                    platformFee: Number(r.exchangeSettlement.platformFee),
                    /** Разбивка по налогам (шеф, 16.10.2026: «сколько ИПН, ОПВ, ОСМС, соцотчисления»). */
                    scheme: r.exchangeSettlement.scheme,
                    gross: Number(r.exchangeSettlement.gross),
                    opv: Number(r.exchangeSettlement.opv),
                    vosms: Number(r.exchangeSettlement.vosms),
                    so: Number(r.exchangeSettlement.so),
                    ipn: Number(r.exchangeSettlement.ipn),
                    preliminary: r.exchangeSettlement.preliminary,
                } : null,
                /** Чеков на топливо ждут решения парка. */
                fuelReceiptsPending: r.exchangeFuelReceipts.filter((f) => f.status === 'PENDING').length,
                /** Чеков на топливо по рейсу (принятых и ждущих): 0 — чеков пока не было (шеф, 27.10.2026). */
                fuelReceipts: r.exchangeFuelReceipts.length,
                createdAt: r.createdAt,
                completedAt: r.completedAt,
            };
        });
    }

    /** Выплаты, которые ждут парка: запрошены или выгружены в 1С, но не проведены. */
    private async payoutsPending(companyId: string) {
        const rows = await this.prisma.driverPayout.findMany({
            where: { parkCompanyId: companyId, status: { in: ['REQUESTED', 'EXPORTED'] } },
            select: { net: true, toPay: true },
        });
        // Сколько перечислить: по расчёту «на руки» — toPay, у прежних — net.
        const sum = rows.reduce((s, r) => s + Number(r.toPay ?? r.net), 0);
        return { count: rows.length, net: Math.round(sum * 100) / 100 };
    }

    /** Код приглашения парка; нет — заводим. */
    async inviteCode(companyId: string): Promise<string> {
        const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { parkInviteCode: true } });
        if (company?.parkInviteCode) return company.parkInviteCode;
        return this.regenerateCode(companyId);
    }

    /** Новый код — старый перестаёт работать (например, ссылка ушла не тем людям). */
    async regenerateCode(companyId: string): Promise<string> {
        await this.drivers.assertPark(companyId);
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const code = newInviteCode();
            try {
                await this.prisma.company.update({ where: { id: companyId }, data: { parkInviteCode: code } });
                return code;
            } catch (e) {
                // Совпал с кодом другого парка — пробуем ещё раз.
                if ((e as { code?: string }).code !== 'P2002') throw e;
            }
        }
        throw new Error('Не удалось завести код приглашения');
    }

    /** Чей это код — для страницы приглашения, без входа. */
    async inviteInfo(code: string) {
        const park = await this.prisma.company.findFirst({
            where: { parkInviteCode: code.trim().toUpperCase(), isPark: true, isActive: true, exchangeAccess: true },
            select: { name: true },
        });
        if (!park) throw new NotFoundException('Приглашение не найдено — попросите у парка новую ссылку');
        return { parkName: park.name, code: code.trim().toUpperCase() };
    }
}
