import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { money } from './settlement-calc';
import { parseAmount, splitIssues } from './fuel.service';

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

export const ADVANCE_KINDS = ['FUEL', 'ADVANCE'] as const;
export type AdvanceKind = (typeof ADVANCE_KINDS)[number];
export const ADVANCE_DECISIONS = ['APPROVE', 'CHECK', 'REUPLOAD', 'REJECT'] as const;
export type AdvanceDecision = (typeof ADVANCE_DECISIONS)[number];

/** Ждут парка: новые, на доп. проверке, на перезагрузке документов. */
const OPEN = ['REQUESTED', 'CHECK', 'REUPLOAD'];
/** Сколько можно попросить до конца рейса, если парк не задал своё (Q17). */
export const DEFAULT_ADVANCE_LIMIT_PCT = 50;
const KIND_TITLE: Record<AdvanceKind, string> = { FUEL: 'Топливо по запросу водителя', ADVANCE: 'Предоплата по запросу водителя' };

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
 * просит заранее, и топливо с предоплатой — отдельно (шеф, 27.10.2026):
 * - на топливо — в пределах топлива по километражу рейса, за вычетом того,
 *   что парк уже дал на топливо;
 * - предоплату — из суммы на руки, не больше доли, которую задал парк
 *   (по умолчанию 50 %), за вычетом уже выданной предоплаты.
 * Ждущие решения запросы тоже вычитаются — каждый из своего лимита.
 *
 * Бухгалтер парка смотрит рейс, накладную и подтверждение получателя и
 * решает: выдать, отправить на доп. проверку, попросить перезагрузить
 * документы или отказать. Выданное записывается в выданное по рейсу и
 * вычитается из выплаты в конце; топливо при этом сводится чеками, а
 * предоплата — нет: она часть суммы на руки.
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
        const settlement = await this.prisma.exchangeTripSettlement.findUnique({ where: { orderId: order.id }, select: { driverTotal: true, fuelEstimate: true } });
        if (!settlement || !order.partnerId) return null;
        const pct = await this.limitPct(order.partnerId);
        const [issues, advances, open] = await Promise.all([
            this.prisma.exchangeFuelIssue.findMany({ where: { orderId: order.id }, select: { id: true, amount: true } }),
            this.prisma.driverAdvanceRequest.findMany({ where: { orderId: order.id, kind: 'ADVANCE', status: 'APPROVED' }, select: { fuelIssueId: true } }),
            this.prisma.driverAdvanceRequest.findMany({
                where: { orderId: order.id, status: { in: OPEN }, ...(except ? { id: { not: except } } : {}) },
                select: { kind: true, amount: true },
            }),
        ]);
        const given = splitIssues(issues, advances.map((a) => a.fuelIssueId));
        const pending = (kind: AdvanceKind) => money(open.filter((r) => r.kind === kind).reduce((sum, r) => sum + num(r.amount), 0));
        const part = (cap: number, issued: number, waiting: number) => ({ cap, issued, pending: waiting, available: money(Math.max(0, cap - issued - waiting)) });
        const onHand = num(settlement.driverTotal);
        return {
            pct,
            onHand,
            fuel: part(num(settlement.fuelEstimate), given.fuelTotal, pending('FUEL')),
            advance: part(money((onHand * pct) / 100), given.advanceTotal, pending('ADVANCE')),
        };
    }

    /** Отказ по сумме — словами водителя: какой лимит и почему столько. */
    private overLimit(kind: AdvanceKind, limit: NonNullable<Awaited<ReturnType<ExchangeAdvanceRequestsService['available']>>>, who: 'driver' | 'park') {
        const tg = (v: number) => `${v.toLocaleString('ru-RU')} ₸`;
        if (kind === 'FUEL') {
            if (!limit.fuel.cap) return 'Топливо по этому рейсу не посчитано — о деньгах на топливо договоритесь с парком по телефону';
            return limit.fuel.available > 0
                ? `${who === 'park' ? 'Выдать' : 'Попросить'} на топливо можно не больше ${tg(limit.fuel.available)}: лимит по километражу — ${tg(limit.fuel.cap)}, за вычетом уже выданного на топливо${who === 'driver' ? ' и ждущего решения' : ''}`
                : `Лимит на топливо по рейсу — ${tg(limit.fuel.cap)} — уже выдан${who === 'driver' ? ' или ждёт решения парка' : ''}`;
        }
        return limit.advance.available > 0
            ? `${who === 'park' ? 'Выдать' : 'Попросить'} предоплату можно не больше ${tg(limit.advance.available)}: это ${limit.pct} % от суммы на руки за вычетом уже выданной предоплаты${who === 'driver' ? ' и ждущей решения' : ''}`
            : `Сейчас предоплату не получить: ${limit.pct} % от суммы на руки уже выданы${who === 'driver' ? ' или ждут решения парка' : ''}`;
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
        if (!ADVANCE_KINDS.includes(dto.kind as AdvanceKind)) throw new BadRequestException('Выберите: на топливо или предоплата');
        const kind = dto.kind as AdvanceKind;
        if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
            throw new BadRequestException('Рейс закрыт — за него теперь запрашивают выплату, а не аванс');
        }
        if (order.driverPayoutItem) throw new BadRequestException('Выплата по рейсу уже запрошена');
        // По одному запросу каждого вида: на топливо и предоплату можно
        // попросить разом, но парку проще решить один, чем разбирать очередь.
        const open = await this.prisma.driverAdvanceRequest.count({ where: { orderId, kind, status: { in: OPEN } } });
        if (open) {
            throw new BadRequestException(`Пока парк решает прошлый запрос ${kind === 'FUEL' ? 'на топливо' : 'на предоплату'}, новый не отправить. Прошлый можно отозвать`);
        }
        const limit = await this.available(order);
        if (!limit) throw new BadRequestException('По этому рейсу нет расчёта суммы водителю — аванс посчитать не из чего');
        const amount = parseAmount(dto.amount);
        if (amount > (kind === 'FUEL' ? limit.fuel : limit.advance).available) throw new BadRequestException(this.overLimit(kind, limit, 'driver'));
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
            const kind = row.kind as AdvanceKind;
            const limit = await this.available(row.order, row.id);
            if (limit && amount > (kind === 'FUEL' ? limit.fuel : limit.advance).available) {
                throw new BadRequestException(this.overLimit(kind, limit, 'park'));
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
