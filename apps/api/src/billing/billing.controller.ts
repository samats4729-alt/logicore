import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import { BillingService } from './billing.service';

@ApiTags('billing')
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BillingController {
    constructor(private billingService: BillingService) { }

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

    // ==================== Админ платформы ====================

    @Get('admin/settings')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Настройки биллинга' })
    async getSettings() {
        return this.billingService.getSettings();
    }

    @Put('admin/settings')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Включить/выключить биллинг, пробный период' })
    async updateSettings(@Body() body: { enabled?: boolean; trialDays?: number }) {
        return this.billingService.updateSettings(body);
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
        @Body() body: {
            planId?: string | null;
            status?: SubscriptionStatus;
            months?: number;
            trialEndsAt?: string | null;
            periodEnd?: string | null;
            note?: string | null;
        },
    ) {
        return this.billingService.updateCompanySubscription(companyId, body);
    }
}
