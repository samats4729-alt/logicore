import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentProofStatus, Prisma } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { SharedReportLinkService } from '../accounting/services/shared-report-link.service';
import { counterpartyIsPayer } from '../common/utils/settlement';
import { toNumOrNull } from '../common/utils/money';
import { SubmitPaymentProofDto } from './dto/submit-payment-proof.dto';

/** Чем можно подтвердить оплату: скан, фотография, выписка. */
export const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp',
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Чеки об оплате, присланные контрагентом по ссылке на отчёт.
 *
 * Главное правило: чек — это ЗАЯВЛЕНИЕ стороны, а не факт прихода денег.
 * Он не создаёт платёж, не гасит долг и не меняет состояние оплаты рейса.
 * Иначе любой, у кого оказалась ссылка, закрывал бы свою задолженность
 * картинкой. Чек ложится в очередь «на проверке», деньги проводит
 * бухгалтер после сверки с банком.
 */
@Injectable()
export class PaymentProofService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
        private readonly shareLinks: SharedReportLinkService,
    ) {}

    /** Контрагент присылает чек по ссылке на отчёт. */
    async submitFromSharedReport(
        token: string,
        dto: SubmitPaymentProofDto,
        file: Express.Multer.File,
    ) {
        const link = await this.shareLinks.resolve(token);
        const { companyId, counterpartyId } = link;

        if (!file) throw new BadRequestException('Приложите файл чека');
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            throw new BadRequestException('Подойдёт PDF или изображение (JPG, PNG, HEIC, WebP)');
        }
        if (file.size > MAX_FILE_SIZE) {
            throw new BadRequestException('Файл больше 10 МБ');
        }
        if (!dto.orderId) throw new BadRequestException('Укажите, по какой сделке платёж');

        const order = await this.prisma.order.findUnique({
            where: { id: dto.orderId },
            select: {
                id: true,
                orderNumber: true,
                customerCompanyId: true,
                forwarderId: true,
                partnerId: true,
                subForwarderId: true,
            },
        });
        if (!order) throw new NotFoundException('Сделка не найдена');

        // Чек прикладывают к своему долгу. Сделки, где платим мы, и чужие
        // сделки сюда не относятся — иначе по ссылке можно было бы
        // засорять чужие взаиморасчёты.
        if (!counterpartyIsPayer(order, companyId, counterpartyId)) {
            throw new BadRequestException(
                `По сделке №${order.orderNumber} платёж идёт не от вас`,
            );
        }

        const claimedAmount = this.parseAmount(dto.claimedAmount);
        const claimedDate = this.parseDate(dto.claimedDate);

        const ext = path.extname(file.originalname) || '';
        const key = `uploads/payment-proofs/proof_${order.id}_${Date.now()}${ext}`;
        await this.storeFile(key, file);

        const proof = await this.prisma.orderPaymentProof.create({
            data: {
                orderId: order.id,
                companyId,
                counterpartyId,
                sharedReportLinkId: link.id,
                fileName: file.originalname,
                fileUrl: key,
                fileSize: file.size,
                mimeType: file.mimetype,
                claimedAmount,
                claimedDate,
                note: dto.note?.trim() || null,
                // Статус выставляем здесь, а не из запроса: отправитель не
                // может прислать себе уже подтверждённый чек.
                status: PaymentProofStatus.PENDING,
            },
            select: { id: true, status: true, createdAt: true },
        });

        return {
            id: proof.id,
            status: proof.status,
            orderNumber: order.orderNumber,
            message: 'Чек отправлен на проверку',
        };
    }

    /** Чеки по рейсам компании. По умолчанию — те, что ждут проверки. */
    async list(companyId: string, filters: { status?: PaymentProofStatus; orderId?: string } = {}) {
        const proofs = await this.prisma.orderPaymentProof.findMany({
            where: {
                companyId,
                ...(filters.status ? { status: filters.status } : {}),
                ...(filters.orderId ? { orderId: filters.orderId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: {
                id: true,
                status: true,
                fileName: true,
                fileSize: true,
                mimeType: true,
                claimedAmount: true,
                claimedDate: true,
                note: true,
                rejectionReason: true,
                reviewedAt: true,
                createdAt: true,
                order: { select: { id: true, orderNumber: true } },
                counterparty: { select: { id: true, name: true } },
                reviewedBy: { select: { firstName: true, lastName: true } },
            },
        });

        return proofs.map((proof) => ({
            ...proof,
            claimedAmount: toNumOrNull(proof.claimedAmount),
        }));
    }

    /** Сколько чеков ждёт проверки — для счётчика в интерфейсе. */
    pendingCount(companyId: string) {
        return this.prisma.orderPaymentProof.count({
            where: { companyId, status: PaymentProofStatus.PENDING },
        });
    }

    /**
     * Бухгалтер подтверждает чек.
     *
     * Подтверждение НЕ создаёт платёж: деньги в системе появляются только
     * через обычное проведение платежа, где сумму вводит человек. Здесь
     * фиксируется лишь то, что документ признан подлинным.
     */
    async accept(companyId: string, userId: string, id: string) {
        const proof = await this.mine(companyId, id);
        this.assertPending(proof.status);

        return this.prisma.orderPaymentProof.update({
            where: { id },
            data: {
                status: PaymentProofStatus.ACCEPTED,
                reviewedById: userId,
                reviewedAt: new Date(),
                rejectionReason: null,
            },
            select: { id: true, status: true, reviewedAt: true },
        });
    }

    /** Бухгалтер отклоняет чек: не та сумма, чужой платёж, нечитаемый файл. */
    async reject(companyId: string, userId: string, id: string, reason?: string) {
        const proof = await this.mine(companyId, id);
        this.assertPending(proof.status);

        return this.prisma.orderPaymentProof.update({
            where: { id },
            data: {
                status: PaymentProofStatus.REJECTED,
                reviewedById: userId,
                reviewedAt: new Date(),
                rejectionReason: reason?.trim() || null,
            },
            select: { id: true, status: true, reviewedAt: true },
        });
    }

    /** Файл чека для просмотра сотрудником своей организации. */
    async file(companyId: string, id: string) {
        const proof = await this.mine(companyId, id);
        return {
            fileUrl: proof.fileUrl,
            fileName: proof.fileName,
            mimeType: proof.mimeType,
        };
    }

    /** Чек принадлежит нашей организации — иначе его не видно и не тронуть. */
    private async mine(companyId: string, id: string) {
        const proof = await this.prisma.orderPaymentProof.findUnique({
            where: { id },
            select: { id: true, companyId: true, status: true, fileUrl: true, fileName: true, mimeType: true },
        });
        if (!proof) throw new NotFoundException('Чек не найден');
        if (proof.companyId !== companyId) {
            throw new ForbiddenException('Чек прислан другой организации');
        }
        return proof;
    }

    /** Повторно решать по уже рассмотренному чеку нельзя. */
    private assertPending(status: PaymentProofStatus) {
        if (status !== PaymentProofStatus.PENDING) {
            throw new BadRequestException('По этому чеку решение уже принято');
        }
    }

    private async storeFile(key: string, file: Express.Multer.File) {
        if (this.s3.isS3Enabled()) {
            await this.s3.uploadFile(key, file.buffer, file.mimetype);
            return;
        }
        const dir = path.join(process.cwd(), path.dirname(key));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(process.cwd(), key), file.buffer);
    }

    /** Сумма со слов отправителя: не число — просто не сохраняем. */
    private parseAmount(raw?: string): Prisma.Decimal | null {
        if (raw === undefined || raw === null || `${raw}`.trim() === '') return null;
        const normalized = `${raw}`.replace(/\s/g, '').replace(',', '.');
        if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
            throw new BadRequestException('Сумма указана неверно');
        }
        const value = new Prisma.Decimal(normalized);
        if (value.lte(0)) throw new BadRequestException('Сумма должна быть больше нуля');
        return value;
    }

    private parseDate(raw?: string): Date | null {
        if (!raw) return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            throw new BadRequestException('Дата указана неверно');
        }
        const date = new Date(`${raw}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime())) {
            throw new BadRequestException('Дата указана неверно');
        }
        return date;
    }
}
