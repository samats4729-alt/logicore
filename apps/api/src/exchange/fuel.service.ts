import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { assertAllowedUpload } from '../documents/allowed-files';
import { removeExchangeFile, safeExtension, storeExchangeFile } from './exchange-files';
import { money } from './settlement-calc';
import { FuelDecisionDto, FuelIssueDto } from './dto/fuel.dto';

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

const ORDER_FUEL_SELECT = {
    id: true, orderNumber: true, driverId: true, partnerId: true, status: true,
    partner: { select: { name: true, bin: true, phone: true } },
    exchangeSettlement: { select: { driverTotal: true, fuelEstimate: true, distanceKm: true, driverId: true } },
    exchangeFuelIssues: { select: { id: true, amount: true, method: true, note: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
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
        const issued = money(row.exchangeFuelIssues.reduce((sum, i) => sum + num(i.amount), 0));
        const accepted = money(row.exchangeFuelReceipts.filter((r) => r.status === 'ACCEPTED').reduce((sum, r) => sum + num(r.amount), 0));
        const pending = money(row.exchangeFuelReceipts.filter((r) => r.status === 'PENDING').reduce((sum, r) => sum + num(r.amount), 0));
        const driverTotal = s ? num(s.driverTotal) : null;
        return {
            orderId: row.id,
            orderNumber: row.orderNumber,
            park: row.partner ? { name: row.partner.name, bin: row.partner.bin, phone: row.partner.phone } : null,
            driverTotal,
            fuelEstimate: s ? num(s.fuelEstimate) : null,
            distanceKm: s?.distanceKm ?? null,
            issued: {
                total: issued,
                items: row.exchangeFuelIssues.map((i) => ({ id: i.id, amount: num(i.amount), method: i.method, note: i.note, createdAt: i.createdAt })),
            },
            receipts: {
                accepted,
                pending,
                items: row.exchangeFuelReceipts.map((r) => ({
                    id: r.id, amount: num(r.amount), status: r.status, rejectReason: r.rejectReason, createdAt: r.createdAt,
                })),
            },
            /** Перечислить водителю в конце: итог минус всё, что парк дал на топливо. */
            toPay: driverTotal != null ? money(driverTotal - issued) : null,
            /** Дали на топливо, а чека нет — эта часть облагается как оплата водителю. */
            withoutReceipt: money(Math.max(0, issued - accepted)),
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

    async addIssue(parkId: string, userId: string, orderId: string, dto: FuelIssueDto) {
        const row = await this.row({ id: orderId, partnerId: parkId });
        this.assertOpen(row);
        await this.prisma.exchangeFuelIssue.create({
            data: { orderId, parkCompanyId: parkId, method: dto.method, amount: parseAmount(dto.amount), note: dto.note?.trim() || null, createdById: userId },
        });
        return this.forPark(parkId, orderId);
    }

    async removeIssue(parkId: string, issueId: string) {
        const issue = await this.prisma.exchangeFuelIssue.findFirst({ where: { id: issueId, parkCompanyId: parkId }, select: { id: true, orderId: true } });
        if (!issue) throw new NotFoundException('Запись не найдена');
        this.assertOpen(await this.row({ id: issue.orderId, partnerId: parkId }));
        await this.prisma.exchangeFuelIssue.delete({ where: { id: issue.id } });
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
