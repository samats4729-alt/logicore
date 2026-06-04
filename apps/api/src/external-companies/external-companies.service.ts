import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExternalCompaniesService {
    constructor(private prisma: PrismaService) { }

    /**
     * Получить список внешних компаний, созданных текущей компанией
     */
    async getExternalCompanies(companyId: string) {
        return this.prisma.company.findMany({
            where: {
                isExternal: true,
                createdByCompanyId: companyId,
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                bin: true,
                phone: true,
                email: true,
                type: true,
                isCustomer: true,
                isCarrier: true,
                address: true,
                directorName: true,
                isActive: true,
                createdAt: true,
            },
        });
    }

    /**
     * Создать внешнюю компанию
     */
    async createExternalCompany(companyId: string, data: {
        name: string;
        bin?: string;
        phone?: string;
        email?: string;
        type: 'CUSTOMER' | 'FORWARDER';
        isCustomer?: boolean;
        isCarrier?: boolean;
        address?: string;
        directorName?: string;
    }) {
        const isCustomer = data.isCustomer !== undefined ? data.isCustomer : (data.type === 'CUSTOMER');
        const isCarrier = data.isCarrier !== undefined ? data.isCarrier : (data.type === 'FORWARDER');

        return this.prisma.company.create({
            data: {
                name: data.name,
                bin: data.bin,
                phone: data.phone,
                email: data.email,
                type: data.type,
                isCustomer,
                isCarrier,
                address: data.address,
                directorName: data.directorName,
                isExternal: true,
                isOurCompany: false,
                createdByCompanyId: companyId,
            },
        });
    }

    /**
     * Обновить внешнюю компанию
     */
    async updateExternalCompany(companyId: string, externalId: string, data: {
        name?: string;
        bin?: string;
        phone?: string;
        email?: string;
        address?: string;
        directorName?: string;
        isCustomer?: boolean;
        isCarrier?: boolean;
    }) {
        const company = await this.prisma.company.findUnique({
            where: { id: externalId },
        });
        if (!company) throw new NotFoundException('Компания не найдена');
        if (!company.isExternal || company.createdByCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }

        return this.prisma.company.update({
            where: { id: externalId },
            data,
        });
    }

    /**
     * Удалить внешнюю компанию
     */
    async deleteExternalCompany(companyId: string, externalId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: externalId },
        });
        if (!company) throw new NotFoundException('Компания не найдена');
        if (!company.isExternal || company.createdByCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }

        return this.prisma.company.delete({
            where: { id: externalId },
        });
    }
}
