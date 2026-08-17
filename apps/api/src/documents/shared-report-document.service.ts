import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { SharedReportLinkService } from '../accounting/services/shared-report-link.service';
import { counterpartyIsExecutor, counterpartyIsPayer } from '../common/utils/settlement';

/** Что контрагент вправе приложить к расчётам. */
export const COUNTERPARTY_DOCUMENT_TYPES: DocumentType[] = [
    DocumentType.TTN,
    DocumentType.ACT,
    DocumentType.INVOICE,
    DocumentType.OTHER,
];

export const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp',
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Потолок на рейс: свой пакет документов, а не файлопомойка. */
export const MAX_DOCUMENTS_PER_ORDER = 30;

/** К скольким рейсам разом можно приложить один файл. */
const MAX_ORDERS_PER_UPLOAD = 200;

/**
 * Документы, которые контрагент прикладывает по ссылке на отчёт.
 *
 * Перевозчик выставляет счёт и вместе с ним шлёт пакет: свой счёт,
 * накладные, акт. Раньше приложить их было негде, и они уходили в почту
 * или мессенджер — то есть мимо платформы, и при споре о том, кто что
 * присылал, разбираться было нечем.
 *
 * Файл ложится в документы рейса — туда же, куда его положил бы наш
 * сотрудник. Автором записывается организация, а не человек: учётной
 * записи у отправителя нет, и подписывать чужой файл именем случайного
 * нашего сотрудника было бы враньём в документообороте.
 *
 * Удаления здесь нет намеренно. Накладная — доказательство в споре об
 * оплате, и сторона, которая её прислала, не должна уметь убрать её
 * задним числом. Ошиблись файлом — присылают правильный, оба остаются.
 */
@Injectable()
export class SharedReportDocumentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
        private readonly shareLinks: SharedReportLinkService,
    ) {}

    async uploadFromSharedReport(
        token: string,
        dto: { orderIds: string[]; type?: string },
        file: Express.Multer.File,
    ) {
        const link = await this.shareLinks.resolve(token);
        const { companyId, counterpartyId } = link;

        if (!file) throw new BadRequestException('Приложите файл');
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            throw new BadRequestException('Подойдёт PDF или изображение (JPG, PNG, HEIC, WebP)');
        }
        if (file.size > MAX_FILE_SIZE) {
            throw new BadRequestException('Файл больше 10 МБ');
        }

        const type = (dto.type || DocumentType.OTHER) as DocumentType;
        if (!COUNTERPARTY_DOCUMENT_TYPES.includes(type)) {
            throw new BadRequestException('Такой вид документа сюда не прикладывают');
        }

        const orderIds = [...new Set(dto.orderIds ?? [])].filter(Boolean);
        if (!orderIds.length) {
            throw new BadRequestException('Укажите, к каким сделкам относится документ');
        }
        if (orderIds.length > MAX_ORDERS_PER_UPLOAD) {
            throw new BadRequestException('Слишком много сделок в одной загрузке');
        }

        const orders = await this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: {
                id: true,
                orderNumber: true,
                customerCompanyId: true,
                forwarderId: true,
                partnerId: true,
                subForwarderId: true,
                _count: { select: { documents: true } },
            },
        });
        if (orders.length !== orderIds.length) {
            throw new BadRequestException('Некоторые сделки не найдены');
        }

        for (const order of orders) {
            // Обе стороны расчётов вправе приложить документ: перевозчик
            // шлёт накладную, заказчик — доверенность на получателя. Чужие
            // сделки не проходят ни в ту, ни в другую сторону.
            const ours = counterpartyIsExecutor(order, companyId, counterpartyId)
                || counterpartyIsPayer(order, companyId, counterpartyId);
            if (!ours) {
                throw new BadRequestException(
                    `Сделка №${order.orderNumber} не относится к взаиморасчётам с вами`,
                );
            }
            if (order._count.documents >= MAX_DOCUMENTS_PER_ORDER) {
                throw new BadRequestException(
                    `По сделке №${order.orderNumber} уже приложено ${MAX_DOCUMENTS_PER_ORDER} документов`,
                );
            }
        }

        // Файл кладётся один, записей — по числу рейсов: счёт на пять
        // рейсов относится ко всем пяти, и в каждом из них он должен быть
        // виден. Хранилище при этом не раздувается копиями.
        const ext = path.extname(file.originalname) || '';
        const key = `uploads/counterparty-documents/doc_${counterpartyId}_${Date.now()}${ext}`;
        await this.storeFile(key, file);

        await this.prisma.document.createMany({
            data: orders.map((order) => ({
                type,
                fileName: file.originalname,
                fileUrl: key,
                fileSize: file.size,
                mimeType: file.mimetype,
                orderId: order.id,
                companyId,
                uploadedById: null,
                uploadedByCounterpartyId: counterpartyId,
            })),
        });

        return {
            fileName: file.originalname,
            type,
            orders: orders.map((order) => ({ id: order.id, orderNumber: order.orderNumber })),
            message: orders.length === 1
                ? `Документ приложен к сделке №${orders[0].orderNumber}`
                : `Документ приложен к ${orders.length} сделкам`,
        };
    }

    /** Что этот контрагент уже прислал — чтобы не слал то же самое дважды. */
    async listFromSharedReport(token: string) {
        const link = await this.shareLinks.resolve(token);
        const documents = await this.prisma.document.findMany({
            where: {
                companyId: link.companyId,
                uploadedByCounterpartyId: link.counterpartyId,
                orderId: { not: null },
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: {
                id: true,
                type: true,
                fileName: true,
                fileSize: true,
                createdAt: true,
                orderId: true,
                order: { select: { orderNumber: true } },
            },
        });

        return documents.map((document) => ({
            id: document.id,
            type: document.type,
            fileName: document.fileName,
            fileSize: document.fileSize,
            createdAt: document.createdAt,
            orderId: document.orderId,
            orderNumber: document.order?.orderNumber ?? null,
        }));
    }

    /** Свой же файл — отдаём обратно тому, кто его прислал. */
    async readFromSharedReport(token: string, documentId: string) {
        const link = await this.shareLinks.resolve(token);
        const document = await this.prisma.document.findFirst({
            where: {
                id: documentId,
                companyId: link.companyId,
                uploadedByCounterpartyId: link.counterpartyId,
            },
            select: { fileUrl: true, fileName: true, mimeType: true },
        });
        if (!document) throw new NotFoundException('Документ не найден');

        if (this.s3.isS3Enabled()) {
            const { stream, mimeType } = await this.s3.downloadFile(document.fileUrl);
            return { stream, mimeType: mimeType || document.mimeType, fileName: document.fileName };
        }
        const absolute = path.join(process.cwd(), document.fileUrl);
        if (!fs.existsSync(absolute)) throw new NotFoundException('Файл не найден');
        return {
            stream: fs.createReadStream(absolute),
            mimeType: document.mimeType,
            fileName: document.fileName,
        };
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
}
