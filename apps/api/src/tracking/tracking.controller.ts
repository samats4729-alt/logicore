import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { UserRole } from '@prisma/client';

@ApiTags('tracking')
@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class TrackingController {
    constructor(private trackingService: TrackingService) { }

    @Post('gps')
    @Roles(UserRole.DRIVER)
    @ApiOperation({ summary: 'Отправить GPS точку' })
    async sendGpsPoint(@Body() dto: any, @Request() req: any) {
        return this.trackingService.saveGpsPoint({
            driverId: req.user.sub,
            ...dto,
            recordedAt: new Date(dto.recordedAt),
        });
    }

    @Post('gps/batch')
    @Roles(UserRole.DRIVER)
    @ApiOperation({ summary: 'Отправить пакет GPS точек (после offline)' })
    async sendGpsPointsBatch(@Body() dto: any[], @Request() req: any) {
        const points = dto.map(p => ({
            driverId: req.user.sub,
            ...p,
            recordedAt: new Date(p.recordedAt),
        }));
        return this.trackingService.saveGpsPointsBatch(points);
    }

    @Get('drivers')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.RECIPIENT)
    @RequirePermissions('tracking')
    @ApiOperation({ summary: 'Получить позиции всех активных водителей' })
    async getAllDriversPositions(@Request() req: any) {
        const companyId = req.user.companyId;
        return this.trackingService.getAllActiveDriversPositions(companyId);
    }

    @Get('driver/:id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.RECIPIENT)
    @RequirePermissions('tracking')
    @ApiOperation({ summary: 'Получить последнюю позицию водителя' })
    async getDriverPosition(@Param('id') id: string) {
        return this.trackingService.getDriverLastPosition(id);
    }

    @Get('order/:id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.RECIPIENT)
    @RequirePermissions('tracking', 'orders')
    @ApiOperation({ summary: 'Получить трек заявки' })
    async getOrderTrack(@Param('id') id: string) {
        return this.trackingService.getOrderTrack(id);
    }
}
