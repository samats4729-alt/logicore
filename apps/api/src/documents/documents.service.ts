import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentType } from '@prisma/client';
import { S3Service } from '../s3/s3.service';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class DocumentsService {
    constructor(private prisma: PrismaService, private s3Service: S3Service) { }

    /**
     * Сохранение информации о загруженном документе
     */
    async create(data: {
        type: DocumentType;
        fileName: string;
        fileUrl: string;
        fileSize: number;
        mimeType: string;
        orderId?: string;
        uploadedById: string;
    }, user?: { sub: string; role: string; companyId?: string }) {
        // Проверка: если документ привязан к заявке, компания должна быть участником
        if (data.orderId && user && user.role !== 'ADMIN') {
            await this.checkOrderAccess(data.orderId, user.companyId);
        }
        return this.prisma.document.create({ data });
    }

    /** Проверка, что компания — участник заявки */
    private async checkOrderAccess(orderId: string, companyId?: string) {
        if (!companyId) throw new ForbiddenException('Нет доступа к заявке');
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { customerCompanyId: companyId },
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { responsibleManager: { companyId } },
                ],
            },
            select: { id: true },
        });
        if (!order) {
            throw new ForbiddenException('Нет доступа к заявке');
        }
    }

    /**
     * Загрузка файла документа
     */
    async uploadFile(orderId: string, userId: string, type: DocumentType, file: Express.Multer.File, user?: { sub: string; role: string; companyId?: string }) {
        if (!file) throw new NotFoundException('Файл не найден');

        // Проверка доступа к заявке
        if (user && user.role !== 'ADMIN') {
            await this.checkOrderAccess(orderId, user.companyId);
        }
        
        const ext = path.extname(file.originalname);
        const filename = `doc_${orderId}_${Date.now()}${ext}`;
        const relativePath = `uploads/documents/${filename}`;

        if (this.s3Service.isS3Enabled()) {
            await this.s3Service.uploadFile(relativePath, file.buffer, file.mimetype);
        } else {
            const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const filepath = path.join(uploadsDir, filename);
            fs.writeFileSync(filepath, file.buffer);
        }

        return this.prisma.document.create({
            data: {
                type,
                fileName: file.originalname,
                fileUrl: relativePath,
                fileSize: file.size,
                mimeType: file.mimetype,
                orderId,
                uploadedById: userId,
            }
        });
    }

    /**
     * Получение документов заявки
     */
    async findByOrder(orderId: string, user?: { sub: string; role: string; companyId?: string }) {
        // Проверка доступа к заявке
        if (user && user.role !== 'ADMIN') {
            await this.checkOrderAccess(orderId, user.companyId);
        }
        return this.prisma.document.findMany({
            where: { orderId },
            include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Получение документа по ID
     */
    async findById(id: string, user?: { sub: string; role: string; companyId?: string }) {
        const doc = await this.prisma.document.findUnique({
            where: { id },
            include: {
                order: {
                    select: {
                        id: true,
                        customerCompanyId: true,
                        forwarderId: true,
                        partnerId: true,
                        responsibleManager: { select: { companyId: true } },
                    },
                },
                uploadedBy: { select: { id: true, firstName: true, lastName: true, companyId: true } },
            },
        });

        if (!doc) {
            throw new NotFoundException('Документ не найден');
        }

        // Проверка доступа
        if (user && user.role !== 'ADMIN') {
            if (doc.order) {
                // Документ привязан к заявке — проверяем участие компании
                const isParticipant = doc.order.customerCompanyId === user.companyId
                    || doc.order.forwarderId === user.companyId
                    || doc.order.partnerId === user.companyId
                    || doc.order.responsibleManager?.companyId === user.companyId;
                if (!isParticipant) {
                    throw new ForbiddenException('Нет доступа к документу');
                }
            } else {
                // Документ без заявки — проверяем, что загрузивший принадлежит той же компании
                if (doc.uploadedBy?.companyId !== user.companyId) {
                    throw new ForbiddenException('Нет доступа к документу');
                }
            }
        }

        return doc;
    }

    /**
     * Верификация документа админом
     */
    async verify(id: string) {
        return this.prisma.document.update({
            where: { id },
            data: {
                isVerified: true,
                verifiedAt: new Date(),
            },
        });
    }

    /**
     * Генерация доверенности (возвращает данные для PDF)
     */
    async generatePowerOfAttorney(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                driver: true,
                customer: { include: { company: true } },
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
            },
        });

        if (!order || !order.driver) {
            throw new NotFoundException('Заявка или водитель не найдены');
        }

        // Данные для генерации PDF
        return {
            orderNumber: order.orderNumber,
            date: new Date(),
            driver: {
                fullName: `${order.driver.lastName} ${order.driver.firstName} ${order.driver.middleName || ''}`.trim(),
                phone: order.driver.phone,
                vehiclePlate: order.driver.vehiclePlate,
                vehicleModel: order.driver.vehicleModel,
            },
            customer: order.customer,
            cargo: {
                description: order.cargoDescription,
                weight: order.cargoWeight,
                volume: order.cargoVolume,
            },
            routePoints: order.routePoints,
        };
    }
}