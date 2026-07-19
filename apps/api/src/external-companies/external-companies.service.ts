import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExternalCompaniesService {
    constructor(private prisma: PrismaService) { }

    /**
     * Получить список внешних компаний, созданных текущей компанией.
     * Если в настройках компании включено «менеджеры видят только своих
     * контрагентов», LOGISTICIAN получает лишь контрагентов, где он
     * ответственный менеджер (или ответственный не назначен).
     */
    async getExternalCompanies(companyId: string, userId?: string, role?: string) {
        const where: any = {
            isExternal: true,
            createdByCompanyId: companyId,
        };

        if (role === 'LOGISTICIAN' && userId) {
            const owner = await this.prisma.company.findUnique({
                where: { id: companyId },
                select: { managersSeeOwnPartnersOnly: true },
            });
            if (owner?.managersSeeOwnPartnersOnly) {
                where.OR = [
                    { responsibleManagerId: userId },
                    { responsibleManagerId: null },
                ];
            }
        }

        return this.prisma.company.findMany({
            where,
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
                responsibleManagerId: true,
                responsibleManager: { select: { id: true, firstName: true, lastName: true } },
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
    }, creatorUserId?: string) {
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
                // Кто вбил контрагента — тот и ответственный по умолчанию (как в УЛ)
                responsibleManagerId: creatorUserId || null,
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
        responsibleManagerId?: string | null;
    }) {
        const company = await this.prisma.company.findUnique({
            where: { id: externalId },
        });
        if (!company) throw new NotFoundException('Компания не найдена');
        if (!company.isExternal || company.createdByCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }

        // Ответственным можно назначить только офисного сотрудника своей компании
        if (data.responsibleManagerId) {
            const target = await this.prisma.user.findFirst({
                where: {
                    id: data.responsibleManagerId,
                    companyId,
                    role: { in: ['COMPANY_ADMIN', 'FORWARDER', 'LOGISTICIAN', 'ACCOUNTANT'] as any },
                },
                select: { id: true },
            });
            if (!target) throw new ForbiddenException('Ответственным может быть только сотрудник вашей компании');
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
