import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehouseService {
    constructor(private prisma: PrismaService) { }

    /**
     * Получение очереди машин на складе
     */
    async getQueue(locationId: string) {
        return this.prisma.warehouseQueueItem.findMany({
            where: {
                order: {
                    pickupLocationId: locationId,
                },
                completedAt: null,
            },
            include: {
                order: {
                    include: {
                        driver: true,
                        customer: true,
                    },
                },
                gate: true,
            },
            orderBy: { arrivedAt: 'asc' },
        });
    }

    /**
     * Получение очереди для компании (все склады)
     */
    async getCompanyQueue(companyId: string) {
        return this.prisma.warehouseQueueItem.findMany({
            where: {
                order: {
                    customerCompanyId: companyId,
                },
                completedAt: null,
            },
            include: {
                order: {
                    include: {
                        driver: true,
                        pickupLocation: true,
                    },
                },
                gate: true,
            },
            orderBy: [{ order: { pickupLocationId: 'asc' } }, { arrivedAt: 'asc' }],
        });
    }

    /**
     * Водитель прибыл на склад
     */
    async driverArrived(orderId: string) {
        return this.prisma.warehouseQueueItem.create({
            data: {
                orderId,
                arrivedAt: new Date(),
            },
        });
    }

    /**
     * Назначение ворот
     */
    async assignGate(queueItemId: string, gateId: string, instructions?: string) {
        return this.prisma.warehouseQueueItem.update({
            where: { id: queueItemId },
            data: {
                gateId,
                assignedAt: new Date(),
                instructions,
            },
            include: { gate: true },
        });
    }

    /**
     * Начало погрузки
     */
    async startLoading(queueItemId: string) {
        return this.prisma.warehouseQueueItem.update({
            where: { id: queueItemId },
            data: { startedAt: new Date() },
        });
    }

    /**
     * Завершение погрузки
     */
    async completeLoading(queueItemId: string) {
        const item = await this.prisma.warehouseQueueItem.update({
            where: { id: queueItemId },
            data: { completedAt: new Date() },
            include: { gate: true },
        });

        // Освобождаем ворота
        if (item.gate) {
            await this.prisma.warehouseGate.update({
                where: { id: item.gate.id },
                data: { isAvailable: true },
            });
        }

        return item;
    }

    /**
     * Получение или создание ворот склада
     */
    async getGates(locationId: string) {
        return this.prisma.warehouseGate.findMany({
            where: { locationId },
            orderBy: { gateNumber: 'asc' },
        });
    }

    async createGate(locationId: string, gateNumber: string) {
        return this.prisma.warehouseGate.create({
            data: { locationId, gateNumber },
        });
    }
}
