import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { assertAllowedUpload } from '../documents/allowed-files';
import { removeExchangeFile, safeExtension, storeExchangeFile } from './exchange-files';
import { litersFor, money, payoutOf } from './settlement-calc';
import { PARK_DEFAULTS } from './settlement.service';
import { FuelDecisionDto, FuelIssueDto } from './dto/fuel.dto';

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

/**
 * Записи запросов, которыми деньги выданы: APPROVED — по запросу водителя,
 * ISSUED — парк выдал предоплату сам, без запроса (шеф, 27.10.2026).
 */
export const GIVEN_STATUSES = ['APPROVED', 'ISSUED'];
/** Связь выдачи с записью запроса — по ней видно вид (топливо/предоплата) и кто начал. */
export type IssueLink = { fuelIssueId: string | null; kind: string; status: string };

const ORDER_FUEL_SELECT = {
    id: true, orderNumber: true, driverId: true, partnerId: true, status: true,
    partner: { select: { name: true, bin: true, phone: true, parkPayoutRates: { select: { fuelConsumption: true } } } },
    exchangeSettlement: { select: { scheme: true, driverTotal: true, workNet: true, fuelEstimate: true, distanceKm: true, driverId: true } },
    exchangeFuelIssues: { select: { id: true, amount: true, method: true, note: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
    // Выданная предоплата лежит среди выданного по рейсу — узнаём её по записи запроса.
    advanceRequests: { where: { status: { in: GIVEN_STATUSES }, fuelIssueId: { not: null } }, select: { fuelIssueId: true, kind: true, status: true } },
    exchangeFuelReceipts: {
        select: { id: true, amount: true, status: true, rejectReason: true, createdAt: true, decidedAt: true },
        orderBy: { createdAt: 'asc' as const },
    },
    driverPayoutItem: { select: { id: true } },
} satisfies Prisma.OrderSelect;

type FuelRow = Prisma.OrderGetPayload<{ select: typeof ORDER_FUEL_SELECT }>;

/** Сумма из формы: «120 000», «120000,50» → число; иначе — понятная ошибка. */
export function parseAmount(raw: string | number | undefined | null): number {
    const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) throw new BadRequestException('Впишите сумму из чека числом, больше нуля');
    if (value > 10_000_000) throw new BadRequestException('Сумма слишком большая — проверьте, нет ли лишних цифр');
    return money(value);
}

/**
 * Выданное по рейсу — на топливо и предоплата (шеф, 27.10.2026). Обе суммы
 * вычитаются из выплаты, но топливо сводится чеками, а предоплата — часть
 * суммы на руки, чека на неё не бывает. Предоплата — выдача, связанная с
 * записью вида ADVANCE; всё остальное — топливо. `byRequest` — выдачи по
 * запросу водителя; остальные парк выдал сам.
 */
export function splitIssues<T extends { id: string; amount: Prisma.Decimal | number }>(issues: T[], links: IssueLink[]) {
    const given = links.filter((l): l is IssueLink & { fuelIssueId: string } => !!l.fuelIssueId && GIVEN_STATUSES.includes(l.status));
    const advance = new Set(given.filter((l) => l.kind === 'ADVANCE').map((l) => l.fuelIssueId));
    const byRequest = new Set(given.filter((l) => l.status === 'APPROVED').map((l) => l.fuelIssueId));
    const fuel = issues.filter((i) => !advance.has(i.id));
    const advances = issues.filter((i) => advance.has(i.id));
    const total = (list: T[]) => money(list.reduce((sum, i) => sum + num(i.amount), 0));
    return { fuel, advances, fuelTotal: total(fuel), advanceTotal: total(advances), advance, byRequest };
}

type IssueRow = { id: string; amount: Prisma.Decimal | number; method: string; note: string | null; createdAt: Date };

/** Выдачи по рейсу одним списком: что (топливо/предоплата), сколько, как, когда, по запросу или парк сам. */
export function givenItems(issues: IssueRow[], links: IssueLink[]) {
    const s = splitIssues(issues, links);
    return issues.map((i) => ({
        id: i.id, amount: num(i.amount), method: i.method, note: i.note, createdAt: i.createdAt,
        kind: (s.advance.has(i.id) ? 'ADVANCE' : 'FUEL') as 'FUEL' | 'ADVANCE',
        byRequest: s.byRequest.has(i.id),
    }));
}

/**
 * Топливо рейса водителя парка (решение владельца 12.10.2026).
 *
 * Водитель доезжает до заправки и звонит менеджеру парка; тот оплачивает
 * сам или переводит водителю — и отмечает это здесь («выдано»). Чек
 * пробивают на БИН парка; водитель фотографирует его в приложении, парк
 * принимает. Итог водителю — как договорились: в конце ему перечисляют
 * итог минус всё, что парк дал на топливо. Налог — с оплаты за работу, то
 * есть итога минус принятые чеки: деньги на топливо без чека облагаются.
 */
@Injectable()
export class ExchangeFuelService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
    ) {}

    /** Сводка — одна для водителя и для парка; парку — с отметками, кто что внёс. */
    private view(row: FuelRow) {
        const s = row.exchangeSettlement;
        const given = splitIssues(row.exchangeFuelIssues, row.advanceRequests);
        // В выплату идёт всё выданное заранее; «без чека» и «за свои» — только по топливу.
        const issuedAll = money(given.fuelTotal + given.advanceTotal);
        const issued = given.fuelTotal;
        const accepted = money(row.exchangeFuelReceipts.filter((r) => r.status === 'ACCEPTED').reduce((sum, r) => sum + num(r.amount), 0));
        const pending = money(row.exchangeFuelReceipts.filter((r) => r.status === 'PENDING').reduce((sum, r) => sum + num(r.amount), 0));
        const driverTotal = s ? num(s.driverTotal) : null;
        const item = (i: FuelRow['exchangeFuelIssues'][number]) => ({
            id: i.id, amount: num(i.amount), method: i.method, note: i.note, createdAt: i.createdAt, byRequest: given.byRequest.has(i.id),
        });
        const consumption = row.partner?.parkPayoutRates ? num(row.partner.parkPayoutRates.fuelConsumption) : PARK_DEFAULTS.fuelConsumption;
        return {
            orderId: row.id,
            orderNumber: row.orderNumber,
            park: row.partner ? { name: row.partner.name, bin: row.partner.bin, phone: row.partner.phone } : null,
            driverTotal,
            /** Топливо по километражу — лимит на заправку по рейсу (шеф, 27.10.2026). */
            fuelEstimate: s ? num(s.fuelEstimate) : null,
            /** Тот же лимит в литрах — по расходу парка на 100 км. */
            fuelLiters: s ? litersFor(s.distanceKm, consumption) : null,
            distanceKm: s?.distanceKm ?? null,
            issued: { total: issued, items: given.fuel.map(item) },
            /** Предоплата из суммы на руки: вычитается из выплаты, чека на неё нет. */
            advances: { total: given.advanceTotal, items: given.advances.map(item) },
            receipts: {
                accepted,
                pending,
                items: row.exchangeFuelReceipts.map((r) => ({
                    id: r.id, amount: num(r.amount), status: r.status, rejectReason: r.rejectReason, createdAt: r.createdAt,
                })),
            },
            /**
             * Схема расчёта: 2 — шефа (16.10.2026): на руки без топлива, топливо
             * сводится чеками (дали без чека — вычитается, заправился за свои —
             * возвращается); 1 — прежняя: итог с топливом минус выданное.
             */
            scheme: s?.scheme ?? null,
            /** Перечислить водителю в конце. */
            toPay: s == null ? null : s.scheme === 2 ? payoutOf(num(s.workNet), issuedAll, accepted).toPay : money(num(s.driverTotal) - issuedAll),
            /** Дали на топливо, а чека нет: по схеме шефа — вычитается из выплаты, по прежней — облагается. */
            withoutReceipt: money(Math.max(0, issued - accepted)),
            /** Чеков больше, чем дали: водитель заправлялся за свои — парк возвращает (схема шефа). */
            ownMoney: s?.scheme === 2 ? money(Math.max(0, accepted - issued)) : 0,
            /** Выплату запросили — топливо по рейсу больше не меняется. */
            locked: !!row.driverPayoutItem,
        };
    }

    private async row(where: Prisma.OrderWhereInput) {
        const row = await this.prisma.order.findFirst({ where, select: ORDER_FUEL_SELECT });
        if (!row) throw new NotFoundException('Рейс не найден');
        return row;
    }

    private assertOpen(row: FuelRow) {
        if (!row.exchangeSettlement) throw new BadRequestException('Топливо ведётся по рейсам с расчётом «на руки» — у этого рейса его нет');
        if (row.driverPayoutItem) throw new BadRequestException('Выплата по рейсу уже запрошена — топливо больше не меняется');
    }

    // ==================== водитель ====================

    private async driverOf(userId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({ where: { userId }, select: { id: true, kind: true, parkCompanyId: true } });
        if (!driver || driver.kind !== 'PARK' || !driver.parkCompanyId) throw new ForbiddenException('Топливо через парк — для водителей парка');
        return driver as typeof driver & { parkCompanyId: string };
    }

    /** Свой рейс через свой парк. */
    private async driverTrip(userId: string, orderId: string) {
        const driver = await this.driverOf(userId);
        return { driver, row: await this.row({ id: orderId, driverId: userId, partnerId: driver.parkCompanyId }) };
    }

    async forDriver(userId: string, orderId: string) {
        return this.view((await this.driverTrip(userId, orderId)).row);
    }

    async addReceipt(userId: string, orderId: string, rawAmount: string, file: Express.Multer.File) {
        const amount = parseAmount(rawAmount);
        assertAllowedUpload(file);
        const { driver, row } = await this.driverTrip(userId, orderId);
        this.assertOpen(row);
        const fileKey = `uploads/exchange-fuel/${orderId}/${randomUUID()}${safeExtension(file.originalname)}`;
        await storeExchangeFile(this.s3, fileKey, file);
        await this.prisma.exchangeFuelReceipt.create({
            data: {
                orderId, driverId: driver.id, parkCompanyId: driver.parkCompanyId, amount,
                fileKey, fileName: (file.originalname || 'чек.jpg').slice(0, 200), mimeType: file.mimetype,
            },
        });
        return this.forDriver(userId, orderId);
    }

    /** Убрать свой чек, пока парк его не рассмотрел, — сфотографировал не тот. */
    async removeReceipt(userId: string, receiptId: string) {
        const driver = await this.driverOf(userId);
        const receipt = await this.prisma.exchangeFuelReceipt.findFirst({ where: { id: receiptId, driverId: driver.id }, select: { id: true, orderId: true, status: true, fileKey: true } });
        if (!receipt) throw new NotFoundException('Чек не найден');
        if (receipt.status !== 'PENDING') throw new BadRequestException('Парк уже рассмотрел этот чек — убрать его нельзя');
        await this.prisma.exchangeFuelReceipt.delete({ where: { id: receipt.id } });
        await removeExchangeFile(this.s3, receipt.fileKey);
        return this.forDriver(userId, receipt.orderId);
    }

    async driverReceiptFile(userId: string, receiptId: string) {
        const driver = await this.driverOf(userId);
        const receipt = await this.prisma.exchangeFuelReceipt.findFirst({ where: { id: receiptId, driverId: driver.id }, select: { fileKey: true, fileName: true, mimeType: true } });
        if (!receipt) throw new NotFoundException('Чек не найден');
        return receipt;
    }

    // ==================== парк ====================

    async forPark(parkId: string, orderId: string) {
        return this.view(await this.row({ id: orderId, partnerId: parkId }));
    }

    /**
     * Парк выдал по рейсу сам, без запроса водителя (шеф, 27.10.2026): топливо
     * (оплатил на заправке или перевёл) или предоплату (перевёл водителю).
     * Предоплату записываем и в запросы — со статусом ISSUED: по ней выдача
     * считается предоплатой, а не топливом, и водитель видит, что её выдал
     * парк. Больше суммы на руки по рейсу предоплатой не выдать — иначе к
     * выплате уйдёт в минус.
     */
    async addIssue(parkId: string, userId: string, orderId: string, dto: FuelIssueDto) {
        const row = await this.row({ id: orderId, partnerId: parkId });
        this.assertOpen(row);
        const amount = parseAmount(dto.amount);
        const note = dto.note?.trim() || null;
        if (dto.kind !== 'ADVANCE') {
            await this.prisma.exchangeFuelIssue.create({ data: { orderId, parkCompanyId: parkId, method: dto.method, amount, note, createdById: userId } });
            return this.forPark(parkId, orderId);
        }
        const s = row.exchangeSettlement!;
        const left = money(num(s.driverTotal) - splitIssues(row.exchangeFuelIssues, row.advanceRequests).advanceTotal);
        if (amount > left) {
            throw new BadRequestException(left > 0 ? `Предоплата — не больше ${left.toLocaleString('ru-RU')} ₸ (остаток суммы на руки)` : 'Сумма на руки по рейсу уже выдана предоплатой');
        }
        await this.prisma.$transaction(async (tx) => {
            const issue = await tx.exchangeFuelIssue.create({
                data: { orderId, parkCompanyId: parkId, method: 'TO_DRIVER', amount, note, createdById: userId },
                select: { id: true },
            });
            await tx.driverAdvanceRequest.create({
                data: {
                    parkCompanyId: parkId, driverId: s.driverId, orderId, kind: 'ADVANCE', amount, status: 'ISSUED',
                    issuedAmount: amount, fuelIssueId: issue.id, parkNote: note, decidedById: userId, decidedAt: new Date(),
                },
            });
        });
        return this.forPark(parkId, orderId);
    }

    async removeIssue(parkId: string, issueId: string) {
        const issue = await this.prisma.exchangeFuelIssue.findFirst({ where: { id: issueId, parkCompanyId: parkId }, select: { id: true, orderId: true } });
        if (!issue) throw new NotFoundException('Запись не найдена');
        this.assertOpen(await this.row({ id: issue.orderId, partnerId: parkId }));
        // Предоплата, которую парк выдал сам, — запись о ней уходит вместе с выдачей.
        await this.prisma.$transaction([
            this.prisma.driverAdvanceRequest.deleteMany({ where: { fuelIssueId: issue.id, status: 'ISSUED' } }),
            this.prisma.exchangeFuelIssue.delete({ where: { id: issue.id } }),
        ]);
        return this.forPark(parkId, issue.orderId);
    }

    async decideReceipt(parkId: string, userId: string, receiptId: string, dto: FuelDecisionDto) {
        const receipt = await this.prisma.exchangeFuelReceipt.findFirst({ where: { id: receiptId, parkCompanyId: parkId }, select: { id: true, orderId: true } });
        if (!receipt) throw new NotFoundException('Чек не найден');
        this.assertOpen(await this.row({ id: receipt.orderId, partnerId: parkId }));
        if (!dto.accept && !dto.reason?.trim()) throw new BadRequestException('Напишите, почему чек не подходит, — водитель увидит причину');
        await this.prisma.exchangeFuelReceipt.update({
            where: { id: receipt.id },
            data: {
                status: dto.accept ? 'ACCEPTED' : 'REJECTED',
                rejectReason: dto.accept ? null : dto.reason!.trim(),
                ...(dto.accept && dto.amount ? { amount: parseAmount(dto.amount) } : {}),
                decidedById: userId,
                decidedAt: new Date(),
            },
        });
        return this.forPark(parkId, receipt.orderId);
    }

    async parkReceiptFile(parkId: string, receiptId: string) {
        const receipt = await this.prisma.exchangeFuelReceipt.findFirst({ where: { id: receiptId, parkCompanyId: parkId }, select: { fileKey: true, fileName: true, mimeType: true } });
        if (!receipt) throw new NotFoundException('Чек не найден');
        return receipt;
    }

    /** Итоги по топливу рейсов — для выплаты: выдано и принято по чекам. */
    async totals(orderIds: string[]): Promise<Map<string, { issued: number; receipts: number }>> {
        const map = new Map<string, { issued: number; receipts: number }>();
        if (!orderIds.length) return map;
        const [issues, receipts] = await Promise.all([
            this.prisma.exchangeFuelIssue.groupBy({ by: ['orderId'], where: { orderId: { in: orderIds } }, _sum: { amount: true } }),
            this.prisma.exchangeFuelReceipt.groupBy({ by: ['orderId'], where: { orderId: { in: orderIds }, status: 'ACCEPTED' }, _sum: { amount: true } }),
        ]);
        for (const id of orderIds) map.set(id, { issued: 0, receipts: 0 });
        for (const i of issues) map.get(i.orderId)!.issued = num(i._sum.amount);
        for (const r of receipts) map.get(r.orderId)!.receipts = num(r._sum.amount);
        return map;
    }
}
