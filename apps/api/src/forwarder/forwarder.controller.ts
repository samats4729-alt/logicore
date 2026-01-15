import { Controller, Get, Put, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
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

    @Get('orders/:id')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить одну заявку' })
    async getOrder(@Param('id') id: string, @Request() req: any) {
        return this.forwarderService.getForwarderOrder(id, req.user.companyId);
    }

    @Put('orders/:id/assign-driver')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Назначить водителя на заявку' })
    async assignDriver(
        @Param('id') id: string,
        @Body() dto: { driverName: string; driverPhone: string; driverPlate: string },
        @Request() req: any
    ) {
        return this.forwarderService.assignDriver(id, req.user.companyId, dto);
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
        return this.forwarderService.updateOrderStatus(id, req.user.companyId, dto.status, dto.comment);
    }
}
