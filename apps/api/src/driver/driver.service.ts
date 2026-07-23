import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { randomBytes } from 'crypto';
import { OrderStatus, DocumentType } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

// Простой линейный сценарий для водителя: текущий статус → следующее действие
const DRIVER_FLOW: { from: OrderStatus[]; to: OrderStatus; label: string }[] = [
    { from: [OrderStatus.ASSIGNED, OrderStatus.PENDING], to: OrderStatus.EN_ROUTE_PICKUP, label: 'Выехал на погрузку' },
    { from: [OrderStatus.EN_ROUTE_PICKUP], to: OrderStatus.AT_PICKUP, label: 'Приехал на погрузку' },
    { from: [OrderStatus.AT_PICKUP, OrderStatus.LOADING], to: OrderStatus.IN_TRANSIT, label: 'Загрузился, еду' },
    { from: [OrderStatus.IN_TRANSIT], to: OrderStatus.AT_DELIVERY, label: 'Приехал на выгрузку' },
    { from: [OrderStatus.AT_DELIVERY, OrderStatus.UNLOADING], to: OrderStatus.COMPLETED, label: 'Выгрузился — завершить' },
];

@Injectable()
export class DriverService {
    constructor(private prisma: PrismaService, private s3: S3Service) { }

    // ==================== ГЕНЕРАЦИЯ ССЫЛКИ (для платформы) ====================

    async generateLink(orderId: string, companyId: string, regenerate = false) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, OR: [{ forwarderId: companyId }, { partnerId: companyId }, { subForwarderId: companyId }, { responsibleManager: { companyId } }] },
            select: { id: true, driverToken: true, driverId: true, assignedDriverName: true },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');
        if (!order.driverId && !order.assignedDriverName) {
            throw new BadRequestException('Сначала назначьте водителя на заявку');
        }
        let token = order.driverToken;
        if (!token || regenerate) {
            token = randomBytes(24).toString('base64url');
            await this.prisma.order.update({ where: { id: orderId }, data: { driverToken: token } });
        }
        return { token };
    }

    async revokeLink(orderId: string, companyId: string) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, OR: [{ forwarderId: companyId }, { partnerId: companyId }, { subForwarderId: companyId }, { responsibleManager: { companyId } }] },
            select: { id: true },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');
        await this.prisma.order.update({ where: { id: orderId }, data: { driverToken: null } });
        return { ok: true };
    }

    // ==================== ПУБЛИЧНАЯ ЧАСТЬ (для водителя) ====================

    private async findByToken(token: string) {
        const order = await this.prisma.order.findUnique({
            where: { driverToken: token },
            include: {
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
                forwarder: { select: { name: true, phone: true } },
                partner: { select: { name: true, phone: true } },
            },
        });
        if (!order) throw new NotFoundException('Ссылка недействительна');
        return order;
    }

    // Безопасный набор данных — БЕЗ сумм и финансов
    async getByToken(token: string) {
        const order = await this.findByToken(token);

        const points = (order.routePoints || []).map(p => ({
            type: p.pointType,
            city: p.location?.city || null,
            address: p.location?.address || '',
            name: p.location?.name || null,
            latitude: p.location?.latitude ?? null,
            longitude: p.location?.longitude ?? null,
            contactName: p.location?.contactName || null,
            contactPhone: p.location?.contactPhone || null,
            expectedDate: p.expectedDate,
        }));

        const nextAction = DRIVER_FLOW.find(f => f.from.includes(order.status as OrderStatus)) || null;
        const dispatcher = order.forwarder || order.partner || null;
        const ttnCount = await this.prisma.document.count({ where: { orderId: order.id, type: DocumentType.TTN } });

        return {
            orderNumber: order.orderNumber,
            status: order.status,
            cargoDescription: order.cargoDescription || null,
            cargoWeight: order.cargoWeight || null,
            cargoVolume: order.cargoVolume || null,
            palletCount: order.palletCount || null,
            requirements: order.requirements || null,
            driverName: order.assignedDriverName || null,
            vehiclePlate: order.assignedDriverPlate || null,
            points,
            nextAction: nextAction ? { to: nextAction.to, label: nextAction.label } : null,
            isFinished: order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED,
            isProblem: order.status === OrderStatus.PROBLEM,
            dispatcherName: dispatcher?.name || null,
            dispatcherPhone: dispatcher?.phone || null,
            ttnCount,
        };
    }

    async advanceStatus(token: string, targetStatus?: string) {
        const order = await this.findByToken(token);
        if (order.status === OrderStatus.CANCELLED) throw new BadRequestException('Заявка отменена');

        const step = DRIVER_FLOW.find(f => f.from.includes(order.status as OrderStatus));
        // Если пришли из статуса PROBLEM — возвращаемся в работу: берём первый шаг
        const flow = order.status === OrderStatus.PROBLEM
            ? DRIVER_FLOW.find(f => f.to === (targetStatus as OrderStatus)) || DRIVER_FLOW[0]
            : step;
        if (!flow) throw new BadRequestException('Дальнейших шагов нет');
        if (targetStatus && flow.to !== targetStatus && order.status !== OrderStatus.PROBLEM) {
            throw new BadRequestException('Неверный переход');
        }

        await this.prisma.order.update({ where: { id: order.id }, data: { status: flow.to } });
        if (order.driverId) {
            await this.prisma.orderChangeLog.create({
                data: { orderId: order.id, userId: order.driverId, action: 'driver_status', details: `Водитель: ${flow.label} → статус ${flow.to}` },
            });
        }
        return this.getByToken(token);
    }

    async recordLocation(token: string, data: { latitude: number; longitude: number; accuracy?: number; speed?: number; heading?: number }) {
        if (typeof data?.latitude !== 'number' || typeof data?.longitude !== 'number') {
            throw new BadRequestException('Нет координат');
        }
        const order = await this.prisma.order.findUnique({ where: { driverToken: token }, select: { id: true, driverId: true } });
        if (!order) throw new NotFoundException('Ссылка недействительна');

        await this.prisma.order.update({
            where: { id: order.id },
            data: {
                driverLat: data.latitude,
                driverLng: data.longitude,
                driverSpeed: data.speed ?? null,
                driverHeading: data.heading ?? null,
                driverLocationAt: new Date(),
            },
        });

        // Если водитель — пользователь, пишем и в общий трекинг (GpsPoint)
        if (order.driverId) {
            await this.prisma.gpsPoint.create({
                data: {
                    driverId: order.driverId,
                    orderId: order.id,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    accuracy: data.accuracy ?? null,
                    speed: data.speed ?? null,
                    heading: data.heading ?? null,
                    recordedAt: new Date(),
                },
            });
        }
        return { ok: true };
    }

    async uploadTtn(token: string, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Файл не найден');
        const order = await this.prisma.order.findUnique({
            where: { driverToken: token },
            select: { id: true, driverId: true, responsibleManagerId: true, customerId: true },
        });
        if (!order) throw new NotFoundException('Ссылка недействительна');

        const uploaderId = order.driverId || order.responsibleManagerId || order.customerId;
        if (!uploaderId) throw new BadRequestException('Невозможно определить отправителя');

        const ext = path.extname(file.originalname) || '.jpg';
        const filename = `ttn_${order.id}_${Date.now()}${ext}`;
        const relativePath = `uploads/documents/${filename}`;

        if (this.s3.isS3Enabled()) {
            await this.s3.uploadFile(relativePath, file.buffer, file.mimetype);
        } else {
            const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
        }

        const doc = await this.prisma.document.create({
            data: {
                type: DocumentType.TTN,
                fileName: file.originalname || 'ТТН.jpg',
                fileUrl: relativePath,
                fileSize: file.size,
                mimeType: file.mimetype,
                orderId: order.id,
                uploadedById: uploaderId,
            },
        });
        return { ok: true, documentId: doc.id };
    }

    async reportProblem(token: string, comment?: string) {
        const order = await this.findByToken(token);
        if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
            throw new BadRequestException('Заявка уже закрыта');
        }
        await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.PROBLEM } });
        if (order.driverId) {
            await this.prisma.orderChangeLog.create({
                data: { orderId: order.id, userId: order.driverId, action: 'driver_problem', details: `Водитель сообщил о проблеме${comment ? `: ${comment}` : ''}` },
            });
        }
        return this.getByToken(token);
    }
}
