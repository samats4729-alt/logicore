import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async create(data: {
        phone: string;
        email?: string;
        password?: string;
        firstName: string;
        lastName: string;
        middleName?: string;
        role: UserRole;
        vehiclePlate?: string;
        vehicleModel?: string;
        companyId?: string;
    }) {
        const passwordHash = data.password
            ? await bcrypt.hash(data.password, 10)
            : null;

        return this.prisma.user.create({
            data: {
                phone: data.phone,
                email: data.email,
                passwordHash,
                firstName: data.firstName,
                lastName: data.lastName,
                middleName: data.middleName,
                role: data.role,
                vehiclePlate: data.vehiclePlate,
                vehicleModel: data.vehicleModel,
                companyId: data.companyId,
            },
        });
    }

    async findAll(filters?: { role?: UserRole; isActive?: boolean }) {
        return this.prisma.user.findMany({
            where: {
                role: filters?.role,
                isActive: filters?.isActive,
            },
            include: { company: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findById(id: string) {
        return this.prisma.user.findUnique({
            where: { id },
            include: { company: true },
        });
    }

    async findByPhone(phone: string) {
        return this.prisma.user.findUnique({
            where: { phone },
        });
    }

    async findDrivers() {
        return this.prisma.user.findMany({
            where: { role: 'DRIVER', isActive: true },
            orderBy: { lastName: 'asc' },
        });
    }

    async update(id: string, data: Partial<{
        firstName: string;
        lastName: string;
        middleName: string;
        email: string;
        vehiclePlate: string;
        vehicleModel: string;
        isActive: boolean;
    }>) {
        return this.prisma.user.update({
            where: { id },
            data,
        });
    }

    async deactivate(id: string) {
        return this.prisma.user.update({
            where: { id },
            data: { isActive: false },
        });
    }

    async resetDeviceBinding(userId: string) {
        // Удаляем все сессии пользователя
        await this.prisma.session.deleteMany({
            where: { userId },
        });
    }
}
