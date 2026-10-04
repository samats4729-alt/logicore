import {
    Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Request, Res, UploadedFile, UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { AllowWithoutCompany, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { AuthService } from '../auth/auth.service';
import { setAuthCookie } from '../auth/auth-cookie';
import { AuditService } from '../audit/audit.service';
import { S3Service } from '../s3/s3.service';
import { MAX_UPLOAD_SIZE } from '../documents/allowed-files';
import { ExchangeEnabledGuard } from './exchange-enabled.guard';
import { ExchangeDriversService } from './drivers.service';
import { sendExchangeFile } from './exchange-files';
import {
    AdminCompaniesQueryDto, DriverDocumentDto, DriverGoogleAuthDto, DriverReasonDto, ParkDriversQueryDto, SetParkDto,
    UpdateDriverProfileDto,
} from './dto/driver.dto';

const LOGIN_ATTEMPTS_PER_MINUTE = Number(process.env.AUTH_THROTTLE_LIMIT) || 5;

/**
 * Вход водителя биржи через Google. Открыт без логина — это и есть вход.
 * Замок — проверка токена у Google: без настоящего входа в Google сюда не
 * попасть. Перечислен в auth/open-routes.spec.ts.
 */
@ApiTags('exchange-drivers')
@Controller('exchange/driver/auth')
@UseGuards(ExchangeEnabledGuard)
export class ExchangeDriverAuthController {
    constructor(
        private readonly drivers: ExchangeDriversService,
        private readonly auth: AuthService,
    ) {}

    @Post('google')
    @Throttle({ default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Вход водителя биржи через Google' })
    async google(@Body() dto: DriverGoogleAuthDto, @Res({ passthrough: true }) response: Response) {
        const profile = await this.auth.googleProfile(dto.token);
        await this.drivers.ensureDriverUser(profile);
        const result = await this.auth.loginWithGoogle(dto.token, dto.deviceId);
        if ('accessToken' in result && result.accessToken) setAuthCookie(response, result.accessToken);
        return result;
    }
}

/** Анкета водителя — из приложения. Компании у такого водителя нет. */
@ApiTags('exchange-drivers')
@Controller('exchange/driver')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard, RolesGuard)
@AllowWithoutCompany()
@Roles(UserRole.DRIVER)
@ApiBearerAuth()
export class ExchangeDriverController {
    constructor(
        private readonly drivers: ExchangeDriversService,
        private readonly s3: S3Service,
    ) {}

    @Get('me')
    @ApiOperation({ summary: 'Моя анкета водителя' })
    me(@Request() req: any) {
        return this.drivers.me(req.user.sub);
    }

    @Put('me')
    @ApiOperation({ summary: 'Заполнить анкету' })
    update(@Request() req: any, @Body() dto: UpdateDriverProfileDto) {
        return this.drivers.update(req.user.sub, dto);
    }

    @Get('parks')
    @ApiOperation({ summary: 'Парки биржи — для выбора в анкете' })
    parks() {
        return this.drivers.parks();
    }

    @Post('me/documents')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE } }))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Фото документа' })
    addDocument(@Request() req: any, @Body() dto: DriverDocumentDto, @UploadedFile() file: Express.Multer.File) {
        return this.drivers.addDocument(req.user.sub, dto.kind, file);
    }

    @Delete('me/documents/:id')
    @ApiOperation({ summary: 'Убрать фото документа' })
    removeDocument(@Request() req: any, @Param('id') id: string) {
        return this.drivers.removeDocument(req.user.sub, id);
    }

    @Get('me/documents/:id')
    @ApiOperation({ summary: 'Своё фото документа' })
    async document(@Request() req: any, @Param('id') id: string, @Res() res: Response) {
        return sendExchangeFile(this.s3, res, await this.drivers.ownDocument(req.user.sub, id));
    }

    @Post('me/sign-contract')
    @ApiOperation({ summary: 'Подписать договор с парком' })
    signContract(@Request() req: any) {
        const deviceId = req.headers['x-device-id'] as string | undefined;
        const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip;
        return this.drivers.signContract(req.user.sub, deviceId, ip);
    }

    @Post('me/submit')
    @ApiOperation({ summary: 'Отправить анкету' })
    submit(@Request() req: any) {
        return this.drivers.submit(req.user.sub);
    }
}

/**
 * Водители парка — кабинет компании-парка. Права — как у биржи (заявки),
 * и сверх того компания обязана быть парком: это проверяет сервис.
 */
@ApiTags('exchange-drivers')
@Controller('exchange/park')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('orders')
@Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
@ApiBearerAuth()
export class ExchangeParkController {
    constructor(
        private readonly drivers: ExchangeDriversService,
        private readonly s3: S3Service,
        private readonly audit: AuditService,
    ) {}

    @Get('drivers')
    @ApiOperation({ summary: 'Водители парка' })
    list(@Request() req: any, @Query() query: ParkDriversQueryDto) {
        return this.drivers.parkDrivers(req.user.companyId, query.status);
    }

    @Get('drivers/:id')
    @ApiOperation({ summary: 'Анкета водителя' })
    card(@Request() req: any, @Param('id') id: string) {
        return this.drivers.parkDriverCard(req.user.companyId, id);
    }

    @Get('documents/:id')
    @ApiOperation({ summary: 'Фото документа водителя' })
    async document(@Request() req: any, @Param('id') id: string, @Res() res: Response) {
        return sendExchangeFile(this.s3, res, await this.drivers.parkDocument(req.user.companyId, id));
    }

    private async log(req: any, driver: { id: string; lastName: string | null; firstName: string | null }, what: string) {
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'STATUS',
            entity: 'exchange_driver',
            entityId: driver.id,
            entityLabel: `${[driver.lastName, driver.firstName].filter(Boolean).join(' ') || 'Водитель'}: ${what}`,
        });
    }

    @Post('drivers/:id/approve')
    @ApiOperation({ summary: 'Допустить к грузам' })
    async approve(@Request() req: any, @Param('id') id: string) {
        const driver = await this.drivers.approve(req.user.companyId, id, req.user.sub);
        await this.log(req, driver, 'допущен к грузам');
        return driver;
    }

    @Post('drivers/:id/reject')
    @ApiOperation({ summary: 'Отказать' })
    async reject(@Request() req: any, @Param('id') id: string, @Body() dto: DriverReasonDto) {
        const driver = await this.drivers.reject(req.user.companyId, id, req.user.sub, dto.reason);
        await this.log(req, driver, `отказ — ${dto.reason}`);
        return driver;
    }

    @Post('drivers/:id/block')
    @ApiOperation({ summary: 'Заблокировать за обман' })
    async block(@Request() req: any, @Param('id') id: string, @Body() dto: DriverReasonDto) {
        const driver = await this.drivers.block(req.user.companyId, id, req.user.sub, dto.reason);
        await this.log(req, driver, `заблокирован — ${dto.reason}`);
        return driver;
    }
}

/** Владелец платформы назначает парки. */
@ApiTags('exchange-drivers')
@Controller('exchange/admin')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class ExchangeAdminController {
    constructor(private readonly drivers: ExchangeDriversService) {}

    @Get('companies')
    @ApiOperation({ summary: 'Компании платформы — кому быть парком' })
    companies(@Query() query: AdminCompaniesQueryDto) {
        return this.drivers.adminCompanies(query.q);
    }

    @Put('companies/:id/park')
    @ApiOperation({ summary: 'Сделать компанию парком или снять отметку' })
    setPark(@Param('id') id: string, @Body() dto: SetParkDto) {
        return this.drivers.setPark(id, dto.isPark);
    }
}
