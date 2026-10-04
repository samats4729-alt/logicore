import {
    Body, Controller, Delete, Get, Param, Post, Query, Request, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { S3Service } from '../s3/s3.service';
import { fileResponseHeaders, MAX_UPLOAD_SIZE } from '../documents/allowed-files';
import { AuditService } from '../audit/audit.service';
import { ExchangeService } from './exchange.service';
import { exchangeEnabled, ExchangeEnabledGuard } from './exchange-enabled.guard';
import {
    CancelExchangeLoadDto, CreateExchangeLoadDto, ExchangeLoadsQueryDto, RoutePricesQueryDto,
} from './dto/exchange-load.dto';

/** Включена ли биржа — кабинет по этому решает, показывать ли вкладку. */
@ApiTags('exchange')
@Controller('exchange')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExchangeStatusController {
    @Get('status')
    @ApiOperation({ summary: 'Включена ли биржа на этом сервере' })
    status() {
        return { enabled: exchangeEnabled() };
    }
}

/**
 * Биржа со стороны компании, у которой груз.
 *
 * Права — как у заявок: кто ведёт заявки, тот ставит и грузы. Водитель и
 * грузополучатель сюда не попадают — им своя сторона биржи, в приложении.
 */
@ApiTags('exchange')
@Controller('exchange')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('orders')
@Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
@ApiBearerAuth()
export class ExchangeController {
    constructor(
        private readonly service: ExchangeService,
        private readonly s3: S3Service,
        private readonly audit: AuditService,
    ) {}

    @Get('loads')
    @ApiOperation({ summary: 'Грузы компании на бирже' })
    list(@Request() req: any, @Query() query: ExchangeLoadsQueryDto) {
        return this.service.list(req.user.companyId, query.status);
    }

    @Post('loads')
    @ApiOperation({ summary: 'Поставить груз на биржу' })
    async create(@Request() req: any, @Body() dto: CreateExchangeLoadDto) {
        const load = await this.service.create(req.user.companyId, req.user.sub, dto);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'CREATE',
            entity: 'exchange_load',
            entityId: load.id,
            entityLabel: `Груз ${load.number}: ${load.originCityName} — ${load.destinationCityName}`,
        });
        return load;
    }

    @Get('loads/:id')
    @ApiOperation({ summary: 'Карточка груза' })
    findOne(@Request() req: any, @Param('id') id: string) {
        return this.service.findOne(req.user.companyId, id);
    }

    @Post('loads/:id/cancel')
    @ApiOperation({ summary: 'Снять груз с биржи' })
    async cancel(@Request() req: any, @Param('id') id: string, @Body() dto: CancelExchangeLoadDto) {
        const load = await this.service.cancel(req.user.companyId, id, dto.reason);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'exchange_load',
            entityId: load.id,
            entityLabel: `Груз ${load.number} снят с биржи: ${dto.reason}`,
        });
        return load;
    }

    @Post('route-prices')
    @ApiOperation({ summary: 'Почём возили по направлению' })
    routePrices(@Request() req: any, @Body() query: RoutePricesQueryDto) {
        return this.service.routePrices(req.user.companyId, query);
    }

    @Post('loads/:id/photos')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE } }))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Добавить фото груза' })
    addPhoto(@Request() req: any, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
        return this.service.addPhoto(req.user.companyId, id, file);
    }

    @Get('photos/:photoId')
    @ApiOperation({ summary: 'Фото груза' })
    async photo(@Request() req: any, @Param('photoId') photoId: string, @Res() res: Response) {
        const photo = await this.service.photo(req.user.companyId, photoId);
        res.set(fileResponseHeaders(photo.fileName, photo.mimeType));
        if (this.s3.isS3Enabled()) {
            const { stream } = await this.s3.downloadFile(photo.fileKey);
            return stream.pipe(res);
        }
        const absolute = path.join(process.cwd(), photo.fileKey);
        if (!fs.existsSync(absolute)) return res.status(404).json({ message: 'Файл не найден' });
        return fs.createReadStream(absolute).pipe(res);
    }

    @Delete('photos/:photoId')
    @ApiOperation({ summary: 'Убрать фото груза' })
    removePhoto(@Request() req: any, @Param('photoId') photoId: string) {
        return this.service.removePhoto(req.user.companyId, photoId);
    }
}
