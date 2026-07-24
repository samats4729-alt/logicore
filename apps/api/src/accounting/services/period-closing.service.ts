import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PeriodClosingService {
    constructor(private prisma: PrismaService) { }

    async checkPeriodNotClosed(companyId: string, date: Date | string) {
        // UTC, а не локальное время процесса: даты операций хранятся в UTC, и на
        // границе месяца локальная TZ сервера могла отнести операцию к «соседнему»
        // месяцу — операция либо обходила закрытие периода, либо блокировалась
        // ошибочно (особенно заметно для KZ, UTC+5/+6, вечером последнего дня месяца).
        const d = new Date(date);
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth() + 1;

        const closed = await this.prisma.closedPeriod.findUnique({
            where: {
                companyId_year_month: {
                    companyId,
                    year,
                    month,
                },
            },
        });

        if (closed) {
            throw new BadRequestException(`Период за ${month.toString().padStart(2, '0')}/${year} закрыт для финансовых операций.`);
        }
    }

    async getClosedPeriods(companyId: string) {
        return this.prisma.closedPeriod.findMany({
            where: { companyId },
            orderBy: [{ year: 'desc' }, { month: 'desc' }],
            include: {
                closedBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });
    }

    async closePeriod(companyId: string, userId: string, year: number, month: number) {
        if (month < 1 || month > 12) {
            throw new BadRequestException('Неверный месяц');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (!user || (user.role !== 'COMPANY_ADMIN' && user.role !== 'ACCOUNTANT')) {
            throw new ForbiddenException('У вас нет прав для закрытия периода');
        }

        try {
            return await this.prisma.closedPeriod.create({
                data: {
                    companyId,
                    year,
                    month,
                    closedById: userId,
                },
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new BadRequestException('Этот период уже закрыт');
            }
            throw error;
        }
    }

    async openPeriod(companyId: string, userId: string, year: number, month: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (!user || (user.role !== 'COMPANY_ADMIN' && user.role !== 'ACCOUNTANT')) {
            throw new ForbiddenException('У вас нет прав для открытия периода');
        }

        const period = await this.prisma.closedPeriod.findUnique({
            where: {
                companyId_year_month: {
                    companyId,
                    year,
                    month,
                },
            },
        });

        if (!period) {
            throw new NotFoundException('Закрытый период не найден');
        }

        await this.prisma.closedPeriod.delete({
            where: {
                id: period.id,
            },
        });

        return { success: true };
    }
}
