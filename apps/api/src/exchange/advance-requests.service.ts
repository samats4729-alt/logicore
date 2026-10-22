import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { money } from './settlement-calc';
import { parseAmount } from './fuel.service';

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

export const ADVANCE_KINDS = ['FUEL', 'ADVANCE'] as const;
export type AdvanceKind = (typeof ADVANCE_KINDS)[number];
export const ADVANCE_DECISIONS = ['APPROVE', 'CHECK', 'REUPLOAD', 'REJECT'] as const;
export type AdvanceDecision = (typeof ADVANCE_DECISIONS)[number];

/** Ждут парка: новые, на доп. проверке, на перезагрузке документов. */
const OPEN = ['REQUESTED', 'CHECK', 'REUPLOAD'];
/** Сколько можно попросить до конца рейса, если парк не задал своё (Q17). */
export const DEFAULT_ADVANCE_LIMIT_PCT = 50;
const KIND_TITLE: Record<AdvanceKind, string> = { FUEL: 'Топливо по запросу водителя', ADVANCE: 'Аванс по запросу водителя' };

const REQUEST_SELECT = {
    id: true, kind: true, amount: true, comment: true, status: true, parkNote: true,
    issuedAmount: true, decidedAt: true, createdAt: true, updatedAt: true, orderId: true,
    order: { select: { orderNumber: true } },
    driver: { select: { id: true, lastName: true, firstName: true, phone: true } },
} satisfies Prisma.DriverAdvanceRequestSelect;

type RequestRow = Prisma.DriverAdvanceRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

const view = (r: RequestRow) => ({
    id: r.id,
    kind: r.kind as AdvanceKind,
    amount: num(r.amount),
    comment: r.comment,
    status: r.status,
    parkNote: r.parkNote,
    issuedAmount: r.issuedAmount == null ? null : num(r.issuedAmount),
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    orderId: r.orderId,
    orderNumber: r.order.orderNumber,
    driver: { id: r.driver.id, name: [r.driver.lastName, r.driver.firstName].filter(Boolean).join(' ') || 'Водитель', phone: r.driver.phone },
});

/**
 * Запросы водителя парка на топливо и аванс (задачи шефа, Q17).
 *
 * Раньше попросить можно было только всю сумму «на руки» и только после
 * рейса, а парк такой просьбы не видел вовсе. Теперь водитель в рейсе
 * просит часть заранее — не больше доли от суммы за рейс, которую задал
 * парк (по умолчанию 50 %), за вычетом того, что уже дали на топливо и
 * что уже ждёт решения.
 *
 * Бухгалтер парка смотрит рейс, накладную и подтверждение получателя и
 * решает: выдать, отправить на доп. проверку, попросить перезагрузить
 * документы или отказать. Выданное ложится в «дали на топливо» по рейсу и
 * вычитается из выплаты в конце — как деньги на заправке.
 */
@Injectable()
export class ExchangeAdvanceRequestsService {
    constructor(private readonly prisma: PrismaService) {}

    private async limitPct(parkId: string) {
        const row = await this.prisma.parkPayoutRates.findUnique({ where: { parkCompanyId: parkId }, select: { advanceLimitPct: true } });
        return row?.advanceLimitPct ?? DEFAULT_ADVANCE_LIMIT_PCT;
    }

    /**
     * Сколько ещё можно попросить по рейсу. `except` — запрос, который сейчас
     * решают: его сумма не должна мешать самой себе.
     */
    async available(order: { id: string; partnerId: string | null }, except?: string) {
        const settlement = await this.prisma.exchangeTripSettlement.findUnique({ where: { orderId: order.id }, select: { driverTotal: true } });
        if (!settlement || !order.partnerId) return null;
        const pct = await this.limitPct(order.partnerId);
        const [issued, open] = await Promise.all([
            this.prisma.exchangeFuelIssue.aggregate({ where: { orderId: order.id }, _sum: { amount: true } }),
            this.prisma.driverAdvanceRequest.aggregate({
                where: { orderId: order.id, status: { in: OPEN }, ...(except ? { id: { not: except } } : {}) },
                _sum: { amount: true },
            }),
        ]);
        const tripTotal = num(settlement.driverTotal);
        const cap = money((tripTotal * pct) / 100);
        return {
            pct,
            tripTotal,
            cap,
            issued: num(issued._sum.amount),
            pending: num(open._sum.amount),
            available: money(Math.max(0, cap - num(issued._sum.amount) - num(open._sum.amount))),
        };
    }

    // ==================== водитель ====================

    private async driverOf(userId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({ where: { userId }, select: { id: true, kind: true, parkCompanyId: true, status: true } });
        if (!driver || driver.kind !== 'PARK' || !driver.parkCompanyId) {
            throw new ForbiddenException('Топливо и аванс через приложение — для водителей парка');
        }
        if (driver.status === 'BLOCKED') throw new ForbiddenException('Вы заблокированы на бирже');
        return driver as typeof driver & { parkCompanyId: string };
    }

    private async driverTrip(userId: string, orderId: string) {
        const driver = await this.driverOf(userId);
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, driverId: userId, partnerId: driver.parkCompanyId },
            select: { id: true, partnerId: true, status: true, driverPayoutItem: { select: { id: true } } },
        });
        if (!order) throw new NotFoundException('Рейс не найден');
        return { driver, order };
    }

    async forDriver(userId: string, orderId: string) {
        const { order } = await this.driverTrip(userId, orderId);
        const rows = await this.prisma.driverAdvanceRequest.findMany({ where: { orderId }, select: REQUEST_SELECT, orderBy: { createdAt: 'desc' } });
        return { limit: await this.available(order), requests: rows.map(view) };
    }

    async request(userId: string, orderId: string, dto: { kind: string; amount: string | number; comment?: string | null }) {
        const { driver, order } = await this.driverTrip(userId, orderId);
        if (!ADVANCE_KINDS.includes(dto.kind as AdvanceKind)) throw new BadRequestException('Выберите: на топливо или аванс');
        if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
            throw new BadRequestException('Рейс закрыт — за него теперь запрашивают выплату, а не аванс');
        }
        if (order.driverPayoutItem) throw new BadRequestException('Выплата по рейсу уже запрошена');
        // По одному: парку проще решить один запрос, чем разбираться в очереди.
        const open = await this.prisma.driverAdvanceRequest.count({ where: { orderId, status: { in: OPEN } } });
        if (open) throw new BadRequestException('Пока парк решает прошлый запрос по рейсу, новый не отправить. Прошлый можно отозвать');
        const limit = await this.available(order);
        if (!limit) throw new BadRequestException('По этому рейсу нет расчёта суммы водителю — аванс посчитать не из чего');
        const amount = parseAmount(dto.amount);
        if (amount > limit.available) {
            throw new BadRequestException(
                limit.available > 0
                    ? `Можно попросить не больше ${limit.available.toLocaleString('ru-RU')} ₸: это ${limit.pct} % от суммы за рейс за вычетом уже выданного и ждущего решения`
                    : `Сейчас попросить нельзя: ${limit.pct} % от суммы за рейс уже выданы или ждут решения парка`,
            );
        }
        const created = await this.prisma.driverAdvanceRequest.create({
            data: {
                parkCompanyId: driver.parkCompanyId, driverId: driver.id, orderId,
                kind: dto.kind, amount, comment: dto.comment?.trim() || null,
            },
            select: { id: true },
        });
        return { id: created.id, ...(await this.forDriver(userId, orderId)) };
    }

    private async ownRequest(userId: string, id: string) {
        const driver = await this.driverOf(userId);
        const row = await this.prisma.driverAdvanceRequest.findFirst({ where: { id, driverId: driver.id }, select: { id: true, status: true, orderId: true } });
        if (!row) throw new NotFoundException('Запрос не найден');
        return row;
    }

    /** Перезагрузил документы — снова к парку. */
    async resubmit(userId: string, id: string) {
        const row = await this.ownRequest(userId, id);
        if (row.status !== 'REUPLOAD') throw new BadRequestException('Парк не просил перезагрузить документы по этому запросу');
        await this.prisma.driverAdvanceRequest.update({ where: { id }, data: { status: 'REQUESTED' } });
        return this.forDriver(userId, row.orderId);
    }

    async cancel(userId: string, id: string) {
        const row = await this.ownRequest(userId, id);
        if (!OPEN.includes(row.status)) throw new BadRequestException('Запрос уже решён — отозвать нельзя');
        await this.prisma.driverAdvanceRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
        return this.forDriver(userId, row.orderId);
    }

    // ==================== парк ====================

    async forPark(parkId: string, scope: 'open' | 'all' = 'open') {
        const rows = await this.prisma.driverAdvanceRequest.findMany({
            where: { parkCompanyId: parkId, ...(scope === 'open' ? { status: { in: OPEN } } : {}) },
            select: REQUEST_SELECT,
            orderBy: { createdAt: 'desc' },
            take: 300,
        });
        return rows.map(view);
    }

    async openCount(parkId: string) {
        return this.prisma.driverAdvanceRequest.count({ where: { parkCompanyId: parkId, status: 'REQUESTED' } });
    }

    async decide(parkId: string, userId: string, id: string, dto: { action: string; note?: string | null; amount?: string | number | null; method?: string | null }) {
        if (!ADVANCE_DECISIONS.includes(dto.action as AdvanceDecision)) throw new BadRequestException('Неизвестное решение');
        const row = await this.prisma.driverAdvanceRequest.findFirst({
            where: { id, parkCompanyId: parkId },
            select: { id: true, status: true, kind: true, amount: true, orderId: true, order: { select: { id: true, partnerId: true, driverPayoutItem: { select: { id: true } } } } },
        });
        if (!row) throw new NotFoundException('Запрос не найден');
        if (!OPEN.includes(row.status)) throw new BadRequestException('Запрос уже решён');
        const note = dto.note?.trim() || null;
        const decided = { decidedById: userId, decidedAt: new Date() };

        if (dto.action === 'APPROVE') {
            if (row.order.driverPayoutItem) throw new BadRequestException('Выплата по рейсу уже запрошена — выдать заранее больше нельзя');
            const amount = dto.amount != null && dto.amount !== '' ? parseAmount(dto.amount) : num(row.amount);
            const limit = await this.available(row.order, row.id);
            if (limit && amount > limit.available) {
                throw new BadRequestException(`Больше ${limit.available.toLocaleString('ru-RU')} ₸ выдать нельзя: это ${limit.pct} % от суммы за рейс за вычетом уже выданного`);
            }
            const method = dto.method === 'STATION' ? 'STATION' : 'TO_DRIVER';
            await this.prisma.$transaction(async (tx) => {
                const issue = await tx.exchangeFuelIssue.create({
                    data: {
                        orderId: row.orderId, parkCompanyId: parkId, method, amount,
                        note: [KIND_TITLE[row.kind as AdvanceKind], note].filter(Boolean).join('. '), createdById: userId,
                    },
                    select: { id: true },
                });
                await tx.driverAdvanceRequest.update({
                    where: { id }, data: { status: 'APPROVED', issuedAmount: amount, fuelIssueId: issue.id, parkNote: note, ...decided },
                });
            });
        } else {
            if ((dto.action === 'REUPLOAD' || dto.action === 'REJECT') && !note) {
                throw new BadRequestException(dto.action === 'REUPLOAD'
                    ? 'Напишите, какие документы перезагрузить, — водитель увидит это в приложении'
                    : 'Напишите причину отказа — водитель увидит её в приложении');
            }
            const status = dto.action === 'CHECK' ? 'CHECK' : dto.action === 'REUPLOAD' ? 'REUPLOAD' : 'REJECTED';
            await this.prisma.driverAdvanceRequest.update({ where: { id }, data: { status, parkNote: note, ...decided } });
        }
        const updated = await this.prisma.driverAdvanceRequest.findUniqueOrThrow({ where: { id }, select: REQUEST_SELECT });
        return view(updated);
    }
}
