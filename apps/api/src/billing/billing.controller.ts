import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import { BillingService } from './billing.service';
import { AuditService } from '../audit/audit.service';

@ApiTags('billing')
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BillingController {
    constructor(private billingService: BillingService, private auditService: AuditService) { }

    // ==================== Кабинет компании ====================

    @Get('status')
    @ApiOperation({ summary: 'Статус подписки своей компании (баннер/пейволл)' })
    async getStatus(@Request() req: any) {
        return this.billingService.getCompanyStatus(req.user.companyId);
    }

    @Get('plans')
    @ApiOperation({ summary: 'Активные тарифные планы' })
    async getPlans() {
        return this.billingService.getActivePlans();
    }

    @Post('requests')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Запросить счёт на подписку' })
    async createRequest(@Request() req: any, @Body() body: { months: number; comment?: string }) {
        const request = await this.billingService.createRequest(req.user.companyId, req.user, body);
        await this.auditService.log({
            companyId: req.user.companyId, user: req.user, action: 'CREATE', entity: 'subscription',
            entityId: request.id,
            entityLabel: `Запрос на подписку: ${request.months} мес`,
            details: { months: request.months, amount: request.amount },
        });
        return request;
    }

    // ==================== Админ платформы ====================

    @Get('admin/settings')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Настройки биллинга' })
    async getSettings() {
        return this.billingService.getSettings();
    }

    @Put('admin/settings')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Цена тарифа, сроки и рубильник оплаты' })
    async updateSettings(@Request() req: any, @Body() body: {
        enabled?: boolean;
        trialDays?: number;
        graceDays?: number;
        priceMonthly?: number;
    }) {
        const result = await this.billingService.updateSettings(body);
        await this.auditService.log({
            user: req.user, action: 'SETTINGS', entity: 'billing',
            entityLabel: result.enabled ? 'Оплата включена' : 'Оплата выключена',
            details: {
                enabled: result.enabled,
                trialDays: result.trialDays,
                graceDays: result.graceDays,
                priceMonthly: body.priceMonthly ?? null,
                graceGranted: result.graceGranted,
            },
        });
        return result;
    }

    @Get('admin/tariff')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Текущая цена основного тарифа' })
    async getTariff() {
        return this.billingService.getTariff();
    }

    @Get('admin/requests')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Запросы компаний на подписку' })
    async listRequests() {
        return this.billingService.listRequests();
    }

    @Post('admin/requests/:id/approve')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Оплата получена: продлить подписку и закрыть запрос' })
    async approveRequest(@Param('id') id: string, @Request() req: any, @Body() body: { note?: string }) {
        const result = await this.billingService.approveRequest(id, body?.note);
        await this.auditService.log({
            companyId: result.companyId, user: req.user, action: 'UPDATE', entity: 'subscription',
            entityId: result.id,
            entityLabel: `Подписка продлена на ${result.months} мес по запросу`,
            details: { months: result.months, amount: result.amount, note: body?.note ?? null },
        });
        return result;
    }

    @Post('admin/requests/:id/reject')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Отказать по запросу на подписку' })
    async rejectRequest(@Param('id') id: string, @Request() req: any, @Body() body: { note?: string }) {
        const result = await this.billingService.rejectRequest(id, body?.note);
        await this.auditService.log({
            companyId: result.companyId, user: req.user, action: 'UPDATE', entity: 'subscription',
            entityId: result.id, entityLabel: 'Отказ по запросу на подписку',
            details: { months: result.months, note: body?.note ?? null },
        });
        return result;
    }

    @Get('admin/plans')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Все тарифные планы' })
    async getAllPlans() {
        return this.billingService.getAllPlans();
    }

    @Post('admin/plans')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Создать тарифный план' })
    async createPlan(@Body() body: {
        name: string;
        description?: string;
        priceMonthly: number;
        maxUsers?: number | null;
        maxOrdersPerMonth?: number | null;
        features?: string[];
        isActive?: boolean;
        sortOrder?: number;
    }) {
        return this.billingService.createPlan(body);
    }

    @Put('admin/plans/:id')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Обновить тарифный план' })
    async updatePlan(@Param('id') id: string, @Body() body: any) {
        return this.billingService.updatePlan(id, body);
    }

    @Delete('admin/plans/:id')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Удалить (или деактивировать) тарифный план' })
    async deletePlan(@Param('id') id: string) {
        return this.billingService.deletePlan(id);
    }

    @Get('admin/subscriptions')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Компании и их подписки' })
    async getSubscriptions() {
        return this.billingService.getSubscriptionsOverview();
    }

    @Put('admin/subscriptions/:companyId')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Назначить/продлить подписку компании (после оплаты счёта)' })
    async updateSubscription(
        @Param('companyId') companyId: string,
        @Request() req: any,
        @Body() body: {
            planId?: string | null;
            status?: SubscriptionStatus;
            months?: number;
            trialEndsAt?: string | null;
            periodEnd?: string | null;
            note?: string | null;
        },
    ) {
        const result = await this.billingService.updateCompanySubscription(companyId, body);
        await this.auditService.log({
            companyId, user: req.user, action: 'UPDATE', entity: 'subscription',
            entityId: (result as any)?.id, entityLabel: 'Подписка компании изменена',
            details: { status: body.status ?? null, months: body.months ?? null, planId: body.planId ?? null, note: body.note ?? null },
        });
        return result;
    }
}
