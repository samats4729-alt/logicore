import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollService } from './payroll.service';
import { money } from '../common/utils/money';

function getMonthsRange(fromStr: string, toStr: string): string[] {
    try {
        const start = new Date(fromStr + '-02');
        const end = new Date(toStr + '-02');
        const result: string[] = [];
        const current = new Date(start);
        while (current <= end) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            result.push(`${y}-${m}`);
            current.setMonth(current.getMonth() + 1);
        }
        return result;
    } catch {
        return [];
    }
}

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly payrollService: PayrollService,
    ) {}

    // ==================== ADMIN ENDPOINTS ====================

    @Get('schemes')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async getSchemes(@Request() req: any) {
        const companyId = req.user.companyId;
        const schemes = await this.prisma.payrollScheme.findMany({
            where: { companyId },
            orderBy: { userId: 'asc' },
        });

        const userIds = schemes.map(s => s.userId).filter((id): id is string => !!id);
        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        return schemes.map(s => ({
            ...s,
            user: s.userId ? userMap.get(s.userId) : null,
        }));
    }

    @Put('schemes')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async upsertGeneralScheme(@Request() req: any, @Body() dto: any) {
        const companyId = req.user.companyId;
        const existing = await this.prisma.payrollScheme.findFirst({
            where: { companyId, userId: null },
        });
        if (existing) {
            return this.prisma.payrollScheme.update({
                where: { id: existing.id },
                data: {
                    type: dto.type,
                    fixedAmount: Number(dto.fixedAmount || 0),
                    percentValue: Number(dto.percentValue || 0),
                    percentBase: dto.percentBase || 'MARGIN',
                    accrualStatus: dto.accrualStatus || 'COMPLETED',
                    isActive: dto.isActive !== undefined ? !!dto.isActive : true,
                },
            });
        } else {
            return this.prisma.payrollScheme.create({
                data: {
                    companyId,
                    userId: null,
                    type: dto.type,
                    fixedAmount: Number(dto.fixedAmount || 0),
                    percentValue: Number(dto.percentValue || 0),
                    percentBase: dto.percentBase || 'MARGIN',
                    accrualStatus: dto.accrualStatus || 'COMPLETED',
                    isActive: dto.isActive !== undefined ? !!dto.isActive : true,
                },
            });
        }
    }

    @Put('schemes/user/:userId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async upsertPersonalScheme(@Param('userId') userId: string, @Request() req: any, @Body() dto: any) {
        const companyId = req.user.companyId;
        const user = await this.prisma.user.findFirst({
            where: {
                id: userId,
                OR: [
                    { companyId },
                    { userCompanyRelations: { some: { companyId } } }
                ]
            },
        });
        if (!user) {
            throw new BadRequestException('Пользователь не найден в вашей компании');
        }

        const existing = await this.prisma.payrollScheme.findFirst({
            where: { companyId, userId },
        });
        if (existing) {
            return this.prisma.payrollScheme.update({
                where: { id: existing.id },
                data: {
                    type: dto.type,
                    fixedAmount: Number(dto.fixedAmount || 0),
                    percentValue: Number(dto.percentValue || 0),
                    percentBase: dto.percentBase || 'MARGIN',
                    accrualStatus: dto.accrualStatus || 'COMPLETED',
                    isActive: dto.isActive !== undefined ? !!dto.isActive : true,
                },
            });
        } else {
            return this.prisma.payrollScheme.create({
                data: {
                    companyId,
                    userId,
                    type: dto.type,
                    fixedAmount: Number(dto.fixedAmount || 0),
                    percentValue: Number(dto.percentValue || 0),
                    percentBase: dto.percentBase || 'MARGIN',
                    accrualStatus: dto.accrualStatus || 'COMPLETED',
                    isActive: dto.isActive !== undefined ? !!dto.isActive : true,
                },
            });
        }
    }

    @Delete('schemes/user/:userId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async deletePersonalScheme(@Param('userId') userId: string, @Request() req: any) {
        const companyId = req.user.companyId;
        const existing = await this.prisma.payrollScheme.findFirst({
            where: { companyId, userId },
        });
        if (!existing) {
            throw new NotFoundException('Персональная схема не найдена');
        }
        return this.prisma.payrollScheme.delete({
            where: { id: existing.id },
        });
    }

    @Get('kpi-rules')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async getKpiRules(@Request() req: any) {
        const rules = await this.prisma.payrollKpiRule.findMany({
            where: { companyId: req.user.companyId },
            orderBy: { createdAt: 'desc' },
        });

        const userIds = rules.map(r => r.userId).filter((id): id is string => !!id);
        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        return rules.map(r => ({
            ...r,
            user: r.userId ? userMap.get(r.userId) : null,
        }));
    }

    @Post('kpi-rules')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async createKpiRule(@Request() req: any, @Body() dto: any) {
        const companyId = req.user.companyId;
        if (dto.userId) {
            const user = await this.prisma.user.findFirst({
                where: {
                    id: dto.userId,
                    OR: [
                        { companyId },
                        { userCompanyRelations: { some: { companyId } } }
                    ]
                },
            });
            if (!user) {
                throw new BadRequestException('Пользователь не найден в вашей компании');
            }
        }
        return this.prisma.payrollKpiRule.create({
            data: {
                companyId,
                userId: dto.userId || null,
                metric: dto.metric || 'COMPLETED_ORDERS_MONTH',
                threshold: Number(dto.threshold),
                bonusAmount: Number(dto.bonusAmount),
                isActive: dto.isActive !== undefined ? !!dto.isActive : true,
            },
        });
    }

    @Delete('kpi-rules/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async deleteKpiRule(@Param('id') id: string, @Request() req: any) {
        const rule = await this.prisma.payrollKpiRule.findFirst({
            where: { id, companyId: req.user.companyId },
        });
        if (!rule) {
            throw new NotFoundException('Правило KPI не найдено');
        }
        return this.prisma.payrollKpiRule.delete({
            where: { id },
        });
    }

    @Get('report')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    async getReport(
        @Query('from') from: string,
        @Query('to') to: string,
        @Request() req: any,
    ) {
        const companyId = req.user.companyId;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const fromMonth = from || currentMonth;
        const toMonth = to || currentMonth;

        const months = getMonthsRange(fromMonth, toMonth);
        if (months.length === 0) {
            throw new BadRequestException('Некорректный формат периода');
        }

        const users = await this.prisma.user.findMany({
            where: {
                OR: [
                    { companyId },
                    { userCompanyRelations: { some: { companyId } } }
                ],
                role: { notIn: [UserRole.DRIVER, UserRole.RECIPIENT] },
            },
            select: { id: true, firstName: true, lastName: true, role: true },
        });

        const rows = [];
        let totalSalary = 0;
        let totalPercent = 0;
        let totalKpi = 0;
        let grandTotal = 0;

        for (const user of users) {
            // Lazy calculation of SALARY and KPI
            await this.payrollService.ensureMonthlyAccruals(companyId, user.id, months);

            const accruals = await this.prisma.payrollAccrual.findMany({
                where: {
                    userId: user.id,
                    periodMonth: { in: months },
                },
            });

            const salary = money(accruals.filter(a => a.kind === 'SALARY').reduce((sum, a) => sum + a.amount, 0));
            const percentTotal = money(accruals.filter(a => a.kind === 'PERCENT').reduce((sum, a) => sum + a.amount, 0));
            const kpiTotal = money(accruals.filter(a => a.kind === 'KPI').reduce((sum, a) => sum + a.amount, 0));
            const total = money(salary + percentTotal + kpiTotal);

            // Completed orders count in range
            const start = new Date(months[0] + '-01T00:00:00.000Z');
            const end = new Date(months[months.length - 1] + '-01T00:00:00.000Z');
            end.setMonth(end.getMonth() + 1);

            const ordersCount = await this.prisma.order.count({
                where: {
                    responsibleManagerId: user.id,
                    status: 'COMPLETED',
                    completedAt: {
                        gte: start,
                        lt: end,
                    },
                },
            });

            rows.push({
                userId: user.id,
                name: `${user.lastName || ''} ${user.firstName || ''}`.trim() || 'Сотрудник',
                role: user.role,
                salary,
                percentTotal,
                kpiTotal,
                total,
                ordersCount,
            });

            totalSalary += salary;
            totalPercent += percentTotal;
            totalKpi += kpiTotal;
            grandTotal += total;
        }

        return {
            report: rows,
            totals: {
                salary: money(totalSalary),
                percentTotal: money(totalPercent),
                kpiTotal: money(totalKpi),
                total: money(grandTotal),
            },
        };
    }

    // ==================== MANAGER ENDPOINTS ====================

    @Get('my/summary')
    async getMySummary(@Request() req: any) {
        const userId = req.user.id || req.user.sub;
        const companyId = req.user.companyId;
        const currentMonth = new Date().toISOString().slice(0, 7);

        if (!companyId) {
            return { total: 0, salary: 0, percentTotal: 0, kpiTotal: 0, ordersCount: 0 };
        }

        await this.payrollService.ensureMonthlyAccruals(companyId, userId, [currentMonth]);

        const accruals = await this.prisma.payrollAccrual.findMany({
            where: {
                userId,
                periodMonth: currentMonth,
            },
        });

        const salary = money(accruals.filter(a => a.kind === 'SALARY').reduce((sum, a) => sum + a.amount, 0));
        const percentTotal = money(accruals.filter(a => a.kind === 'PERCENT').reduce((sum, a) => sum + a.amount, 0));
        const kpiTotal = money(accruals.filter(a => a.kind === 'KPI').reduce((sum, a) => sum + a.amount, 0));

        const start = new Date(currentMonth + '-01T00:00:00.000Z');
        const end = new Date(start);
        end.setMonth(start.getMonth() + 1);

        const ordersCount = await this.prisma.order.count({
            where: {
                responsibleManagerId: userId,
                status: 'COMPLETED',
                completedAt: {
                    gte: start,
                    lt: end,
                },
            },
        });

        const total = money(salary + percentTotal + kpiTotal);

        // Check if there is any scheme configured to decide visibility of the metric
        const scheme = await this.payrollService.getSchemeFor(companyId, userId);
        const hasScheme = !!scheme;

        return {
            total,
            salary,
            percentTotal,
            kpiTotal,
            ordersCount,
            hasScheme,
        };
    }

    @Get('my')
    async getMyReport(
        @Query('from') from: string,
        @Query('to') to: string,
        @Request() req: any,
    ) {
        const userId = req.user.id || req.user.sub;
        const companyId = req.user.companyId;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const fromMonth = from || currentMonth;
        const toMonth = to || currentMonth;

        const months = getMonthsRange(fromMonth, toMonth);
        if (months.length === 0) {
            throw new BadRequestException('Некорректный формат периода');
        }

        if (!companyId) {
            return { accruals: [], totals: { salary: 0, percentTotal: 0, kpiTotal: 0, total: 0 } };
        }

        await this.payrollService.ensureMonthlyAccruals(companyId, userId, months);

        const accruals = await this.prisma.payrollAccrual.findMany({
            where: {
                userId,
                periodMonth: { in: months },
            },
            orderBy: { createdAt: 'desc' },
        });

        const orderIds = accruals.map(a => a.orderId).filter((id): id is string => !!id);
        const orders = await this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true, createdAt: true, completedAt: true },
        });
        const orderMap = new Map(orders.map(o => [o.id, o]));

        const salary = money(accruals.filter(a => a.kind === 'SALARY').reduce((sum, a) => sum + a.amount, 0));
        const percentTotal = money(accruals.filter(a => a.kind === 'PERCENT').reduce((sum, a) => sum + a.amount, 0));
        const kpiTotal = money(accruals.filter(a => a.kind === 'KPI').reduce((sum, a) => sum + a.amount, 0));
        const total = money(salary + percentTotal + kpiTotal);

        const mappedAccruals = accruals.map(a => {
            const ord = a.orderId ? orderMap.get(a.orderId) : null;
            const snapshot = a.schemeSnapshot as any;
            return {
                id: a.id,
                kind: a.kind,
                amount: a.amount,
                periodMonth: a.periodMonth,
                baseAmount: a.baseAmount,
                percentValue: snapshot?.percentValue ?? null,
                percentBase: snapshot?.percentBase ?? null,
                createdAt: a.createdAt,
                order: ord ? {
                    id: ord.id,
                    orderNumber: ord.orderNumber,
                    date: ord.completedAt || ord.createdAt,
                } : null,
            };
        });

        return {
            accruals: mappedAccruals,
            totals: {
                salary,
                percentTotal,
                kpiTotal,
                total,
            },
        };
    }
}
