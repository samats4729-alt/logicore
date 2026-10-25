import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Что видно о компании, с которой ещё не работаешь: имя, БИН, кто она.
 *
 * Поиск и запросы на сотрудничество отдавали всю строку компании — с
 * банковским счётом, путями к файлам печати и подписи и кодом приглашения
 * парка, по которому водитель прикрепляется к парку. Её видела любая
 * компания платформы, набравшая пару букв названия (владелец, 25.10.2026:
 * сохранять разграничение прав между компаниями). Реквизиты открываются,
 * когда сотрудничество принято, — там они нужны для счетов и договоров.
 */
const PUBLIC_COMPANY_SELECT = {
    id: true, name: true, bin: true, type: true,
    isCustomer: true, isCarrier: true, isPark: true,
} as const;

@Injectable()
export class PartnersService {
    constructor(private prisma: PrismaService) { }

    // List my partners (accepted)
    async getMyPartners(companyId: string) {
        return this.prisma.partnership.findMany({
            where: {
                OR: [
                    { requesterId: companyId },
                    { recipientId: companyId },
                ],
                status: 'ACCEPTED',
            },
            include: {
                requester: true,
                recipient: true,
            },
        });
    }

    // Search companies to invite (exclude myself and already connected)
    async searchCompanies(myCompanyId: string, query: string, page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        // Build where clause
        const where: any = {
            id: { not: myCompanyId },
            isActive: true,
            isExternal: false,
        };

        if (query) {
            where.name = { contains: query, mode: 'insensitive' };
        }

        // Find companies
        const companies = await this.prisma.company.findMany({
            where,
            select: PUBLIC_COMPANY_SELECT,
            skip,
            take: limit,
            orderBy: { name: 'asc' },
        });

        // Check existing partnerships
        const existingPartnerships = await this.prisma.partnership.findMany({
            where: {
                OR: [
                    { requesterId: myCompanyId, recipientId: { in: companies.map((c: any) => c.id) } },
                    { recipientId: myCompanyId, requesterId: { in: companies.map((c: any) => c.id) } },
                ],
            },
        });

        return companies.map((company: any) => {
            const partnership = existingPartnerships.find((p: any) =>
                (p.requesterId === myCompanyId && p.recipientId === company.id) ||
                (p.recipientId === myCompanyId && p.requesterId === company.id)
            );

            return {
                ...company,
                partnershipStatus: partnership ? partnership.status : null,
                partnershipId: partnership ? partnership.id : null,
            };
        });
    }

    // Get incoming requests
    async getIncomingRequests(companyId: string) {
        return this.prisma.partnership.findMany({
            where: {
                recipientId: companyId,
                status: 'PENDING',
            },
            include: {
                requester: { select: PUBLIC_COMPANY_SELECT },
            },
        });
    }

    // Get outgoing requests (sent)
    async getOutgoingRequests(companyId: string) {
        return this.prisma.partnership.findMany({
            where: {
                requesterId: companyId,
                status: 'PENDING',
            },
            include: {
                recipient: { select: PUBLIC_COMPANY_SELECT },
            },
        });
    }

    // Send Invite
    async invite(requesterId: string, recipientId: string) {
        if (requesterId === recipientId) throw new BadRequestException('Cannot invite yourself');

        const existing = await this.prisma.partnership.findFirst({
            where: {
                OR: [
                    { requesterId, recipientId },
                    { requesterId: recipientId, recipientId: requesterId },
                ],
            },
        });

        if (existing) {
            if (existing.status === 'REJECTED') {
                // Maybe allow re-invite? For now, throw error.
                throw new BadRequestException('Partnership was previously rejected');
            }
            if (existing.status === 'ACCEPTED') {
                throw new BadRequestException('Already partners');
            }
            throw new BadRequestException('Invitation already pending');
        }

        return this.prisma.partnership.create({
            data: {
                requesterId,
                recipientId,
                status: 'PENDING',
            },
        });
    }

    // Accept Invite
    async accept(partnershipId: string, companyId: string) {
        const partnership = await this.prisma.partnership.findUnique({ where: { id: partnershipId } });
        if (!partnership) throw new NotFoundException('Request not found');

        if (partnership.recipientId !== companyId) {
            throw new BadRequestException('Not authorized to accept this request');
        }

        return this.prisma.partnership.update({
            where: { id: partnershipId },
            data: { status: 'ACCEPTED' },
        });
    }

    // Reject Invite
    async reject(partnershipId: string, companyId: string) {
        const partnership = await this.prisma.partnership.findUnique({ where: { id: partnershipId } });
        if (!partnership) throw new NotFoundException('Request not found');

        if (partnership.recipientId !== companyId) {
            throw new BadRequestException('Not authorized to reject this request');
        }

        // Determine if we just delete it or mark as rejected. 
        // Usually mark as rejected or delete. Let's mark as rejected.
        return this.prisma.partnership.update({
            where: { id: partnershipId },
            data: { status: 'REJECTED' },
        });
    }
}
