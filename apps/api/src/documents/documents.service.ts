import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentType } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class DocumentsService {
    constructor(private prisma: PrismaService) { }

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
    }) {
        return this.prisma.document.create({ data });
    }

    /**
     * Загрузка файла документа
     */
    async uploadFile(orderId: string, userId: string, type: DocumentType, file: Express.Multer.File) {
        if (!file) throw new NotFoundException('Файл не найден');
        
        const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const ext = path.extname(file.originalname);
        const filename = `doc_${orderId}_${Date.now()}${ext}`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, file.buffer);

        const relativePath = `uploads/documents/${filename}`;

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
    async findByOrder(orderId: string) {
        return this.prisma.document.findMany({
            where: { orderId },
            include: { uploadedBy: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Получение документа по ID
     */
    async findById(id: string) {
        const doc = await this.prisma.document.findUnique({
            where: { id },
            include: { order: true, uploadedBy: true },
        });

        if (!doc) {
            throw new NotFoundException('Документ не найден');
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
                pickupLocation: true,
                deliveryPoints: { include: { location: true } },
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
            pickupLocation: order.pickupLocation,
            deliveryPoints: order.deliveryPoints.map((p: any) => p.location),
        };
    }
}
