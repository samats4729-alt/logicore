import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, UserRole } from '@prisma/client';

@Injectable()
export class PeriodClosingService {
    constructor(private prisma: PrismaService) { }

    private async assertCanManagePeriod(companyId: string, userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });

        if (!user) {
            throw new ForbiddenException('У вас нет прав для управления периодом');
        }

        // Платформенный администратор может обслуживать любую компанию. Для
        // остальных пользователей источником прав является роль именно в
        // выбранной компании, а не общая роль из записи User.
        if (user.role === UserRole.ADMIN) {
            return;
        }

        const relation = await this.prisma.userCompanyRelation.findUnique({
            where: {
                userId_companyId: {
                    userId,
                    companyId,
                },
            },
            select: { role: true },
        });

        if (
            !relation
            || (relation.role !== UserRole.COMPANY_ADMIN && relation.role !== UserRole.ACCOUNTANT)
        ) {
            throw new ForbiddenException('У вас нет прав для управления периодом');
        }
    }

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

        await this.assertCanManagePeriod(companyId, userId);

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
        if (month < 1 || month > 12) {
            throw new BadRequestException('Неверный месяц');
        }

        await this.assertCanManagePeriod(companyId, userId);

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
