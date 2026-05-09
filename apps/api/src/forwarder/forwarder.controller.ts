import { Controller, Get, Put, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ForwarderService } from './forwarder.service';
import { ForwarderDriversService } from './services/forwarder-drivers.service';
import { ForwarderTrackingService } from './services/forwarder-tracking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';

@ApiTags('forwarder')
@Controller('forwarder')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ForwarderController {
    constructor(
        private forwarderService: ForwarderService,
        private driversService: ForwarderDriversService,
        private trackingService: ForwarderTrackingService,
    ) { }

    @Get('orders')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить заявки, назначенные на экспедитора' })
    async getOrders(@Request() req: any) {
        return this.forwarderService.getForwarderOrders(req.user.companyId);
    }

    @Get('marketplace')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить список свободных заявок (Биржа)' })
    async getMarketplace(@Request() req: any) {
        return this.forwarderService.getMarketplaceOrders();
    }

    @Put('orders/:id/take')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Взять заявку в работу' })
    async takeOrder(@Param('id') id: string, @Request() req: any) {
        return this.forwarderService.takeOrder(id, req.user.companyId);
    }

    @Get('orders/:id')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить одну заявку' })
    async getOrder(@Param('id') id: string, @Request() req: any) {
        return this.forwarderService.getForwarderOrder(id, req.user.companyId);
    }

    @Put('orders/:id/accept')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Принять заявку в работу' })
    async acceptOrder(@Param('id') id: string, @Request() req: any) {
        return this.forwarderService.acceptOrder(id, req.user.companyId);
    }

    @Put('orders/:id/reject')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отклонить заявку' })
    async rejectOrder(@Param('id') id: string, @Request() req: any) {
        return this.forwarderService.rejectOrder(id, req.user.companyId);
    }

    @Put('orders/:id/assign-driver')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Назначить водителя на заявку' })
    async assignDriver(
        @Param('id') id: string,
        @Body() dto: { driverId?: string; driverName: string; driverPhone: string; driverPlate: string; trailerNumber?: string },
        @Request() req: any
    ) {
        return this.forwarderService.assignDriver(id, req.user.companyId, dto);
    }

    @Put('orders/:id/assign-forwarder')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Переназначить заявку на другого экспедитора (партнера)' })
    async assignForwarder(
        @Param('id') id: string,
        @Body() dto: { partnerId: string; price: number },
        @Request() req: any
    ) {
        return this.forwarderService.assignForwarder(id, req.user.companyId, dto.partnerId, dto.price);
    }

    @Get('stats')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить статистику экспедитора' })
    async getStats(@Request() req: any) {
        return this.forwarderService.getForwarderStats(req.user.companyId);
    }

    // ==================== DRIVERS ====================

    @Get('drivers')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить список водителей' })
    async getDrivers(@Request() req: any) {
        return this.driversService.getDrivers(req.user.companyId);
    }

    @Post('drivers')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Добавить водителя' })
    async createDriver(
        @Body() dto: {
            firstName: string;
            lastName: string;
            middleName?: string;
            phone: string;
            iin?: string;
            vehicleType?: string;
            vehiclePlate?: string;
            vehicleModel?: string;
            trailerNumber?: string;
        },
        @Request() req: any
    ) {
        return this.driversService.createDriver(req.user.companyId, dto);
    }

    @Put('drivers/:id')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить данные водителя' })
    async updateDriver(
        @Param('id') id: string,
        @Body() dto: {
            firstName?: string;
            lastName?: string;
            middleName?: string;
            iin?: string;
            vehicleType?: string;
            vehiclePlate?: string;
            vehicleModel?: string;
            trailerNumber?: string;
        },
        @Request() req: any
    ) {
        return this.driversService.updateDriver(id, req.user.companyId, dto);
    }

    @Delete('drivers/:id')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Деактивировать водителя' })
    async deleteDriver(@Param('id') id: string, @Request() req: any) {
        return this.driversService.deactivateDriver(id, req.user.companyId);
    }

    // ==================== TRACKING ====================

    @Get('tracking')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить GPS координаты водителей' })
    async getTracking(@Request() req: any) {
        return this.trackingService.getDriversLocations(req.user.companyId);
    }

    @Put('orders/:id/status')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить статус заявки' })
    async updateOrderStatus(
        @Param('id') id: string,
        @Body() dto: { status: string; comment?: string },
        @Request() req: any
    ) {
        return this.forwarderService.updateOrderStatus(id, req.user.companyId, dto.status, dto.comment, req.user.sub);
    }

    // ==================== МЕНЕДЖЕРЫ НА ЗАЯВКЕ ====================

    @Put('orders/:id/assign-me')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Взять заявку в работу (прикрепить себя)' })
    async assignMe(@Param('id') id: string, @Request() req: any) {
        return this.forwarderService.assignManagerToOrder(id, req.user.companyId, req.user.sub);
    }

    @Delete('orders/:id/unassign-me')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Открепиться от заявки' })
    async unassignMe(@Param('id') id: string, @Request() req: any) {
        return this.forwarderService.unassignManagerFromOrder(id, req.user.companyId, req.user.sub);
    }

    @Get('orders/:id/changelog')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить лог изменений заявки' })
    async getChangeLog(@Param('id') id: string, @Request() req: any) {
        return this.forwarderService.getOrderChangeLog(id, req.user.companyId);
    }

    // ==================== КОМИССИЯ МЕНЕДЖЕРОВ ====================

    @Put('users/:id/commission')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Установить процент комиссии менеджеру' })
    async setCommission(
        @Param('id') id: string,
        @Body() dto: { commissionPercent: number },
        @Request() req: any
    ) {
        return this.forwarderService.setManagerCommission(req.user.companyId, id, dto.commissionPercent);
    }

    @Get('my-earnings')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Мой заработок за месяц' })
    async getMyEarnings(
        @Request() req: any,
        @Query('year') year?: string,
        @Query('month') month?: string,
    ) {
        return this.forwarderService.getManagerEarnings(
            req.user.companyId,
            req.user.sub,
            year ? parseInt(year) : undefined,
            month ? parseInt(month) : undefined,
        );
    }

    @Get('users/:id/earnings')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Заработок менеджера за месяц (для админа)' })
    async getUserEarnings(
        @Param('id') id: string,
        @Request() req: any,
        @Query('year') year?: string,
        @Query('month') month?: string,
    ) {
        return this.forwarderService.getManagerEarnings(
            req.user.companyId,
            id,
            year ? parseInt(year) : undefined,
            month ? parseInt(month) : undefined,
        );
    }
}
