import { BadRequestException, Body, Controller, Get, Param, ParseArrayPipe, Post, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { PurgeGpsPointsDto, SendGpsPointDto } from './dto/gps-point.dto';
import { UserRole } from '@prisma/client';

// Ограничение на один offline-пакет: у водителя за смену накапливаются сотни
// точек, но неограниченный массив — это неограниченная запись в самую горячую
// таблицу базы одним запросом.
const MAX_GPS_BATCH = 500;

@ApiTags('tracking')
@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class TrackingController {
    constructor(private trackingService: TrackingService) { }

    @Post('gps')
    @Roles(UserRole.DRIVER)
    @ApiOperation({ summary: 'Отправить GPS точку' })
    async sendGpsPoint(@Body() dto: SendGpsPointDto, @Request() req: any) {
        // driverId берётся ТОЛЬКО из токена и стоит после разбора тела запроса,
        // чтобы его нельзя было переопределить полем из payload.
        return this.trackingService.saveGpsPoint({
            orderId: dto.orderId,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracy: dto.accuracy,
            speed: dto.speed,
            heading: dto.heading,
            driverId: req.user.sub,
            recordedAt: new Date(dto.recordedAt),
        });
    }

    @Post('gps/batch')
    @Roles(UserRole.DRIVER)
    @ApiOperation({ summary: 'Отправить пакет GPS точек (после offline)' })
    async sendGpsPointsBatch(
        @Body(new ParseArrayPipe({ items: SendGpsPointDto })) dto: SendGpsPointDto[],
        @Request() req: any,
    ) {
        if (dto.length > MAX_GPS_BATCH) {
            throw new BadRequestException(`За один раз можно отправить не более ${MAX_GPS_BATCH} точек`);
        }

        const points = dto.map(p => ({
            orderId: p.orderId,
            latitude: p.latitude,
            longitude: p.longitude,
            accuracy: p.accuracy,
            speed: p.speed,
            heading: p.heading,
            driverId: req.user.sub,
            recordedAt: new Date(p.recordedAt),
        }));
        return this.trackingService.saveGpsPointsBatch(points);
    }

    @Post('gps/purge')
    @Roles(UserRole.ADMIN)
    @ApiOperation({
        summary: 'Удалить GPS-точки старше указанного числа дней (обслуживание)',
        description:
            'Таблица GpsPoint растёт быстрее всех остальных и никогда не чистилась. '
            + 'Удаление идёт пакетами; если в ответе hasMore = true, вызов нужно повторить.',
    })
    async purgeGpsPoints(@Body() dto: PurgeGpsPointsDto) {
        return this.trackingService.purgeGpsPointsOlderThan(dto.olderThanDays);
    }

    // Экспедитор и завскладом были пропущены во всех трёх маршрутах карты.
    // Экспедитор — роль по умолчанию при регистрации организации, поэтому
    // мониторинга не видел никто из вновь пришедших: пустая карта и «нет
    // активных рейсов» всегда. Завскладу право «Карта/Трекинг» выдавали в
    // «Сотрудниках», пункт в меню появлялся, страница открывалась — а данные
    // не приходили. Отбор по компании делает сервис, право завсклада
    // по-прежнему проверяет @RequirePermissions.
    @Get('drivers')
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
        UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER, UserRole.RECIPIENT,
    )
    @RequirePermissions('tracking')
    @ApiOperation({ summary: 'Получить позиции всех активных водителей' })
    async getAllDriversPositions(@Request() req: any) {
        const companyId = req.user.companyId;
        return this.trackingService.getAllActiveDriversPositions(companyId);
    }

    @Get('active-trips')
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
        UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER, UserRole.RECIPIENT,
    )
    @RequirePermissions('tracking')
    @ApiOperation({ summary: 'Активные рейсы с маршрутами и позициями водителей' })
    async getActiveTrips(@Request() req: any) {
        return this.trackingService.getActiveTrips(req.user.companyId);
    }

    @Get('driver/:id')
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
        UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER, UserRole.RECIPIENT,
    )
    @RequirePermissions('tracking')
    @ApiOperation({ summary: 'Получить последнюю позицию водителя' })
    async getDriverPosition(@Param('id') id: string, @Request() req: any) {
        return this.trackingService.getDriverLastPosition(id, req.user.companyId);
    }

    @Get('order/:id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.RECIPIENT)
    @RequirePermissions('tracking', 'orders')
    @ApiOperation({ summary: 'Получить трек заявки' })
    async getOrderTrack(@Param('id') id: string, @Request() req: any) {
        return this.trackingService.getOrderTrack(id, req.user.companyId);
    }
}
