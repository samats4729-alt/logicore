import { Body, Controller, Delete, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { CurrencyService } from './currency.service';
import { ManualRateDto, RatesBackfillDto, RatesImportDto } from './dto/currency.dto';

/** Кто видит курсы: считать в валюте нужно всем, кто работает с деньгами. */
const VIEW_ROLES = [
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
    UserRole.ACCOUNTANT, UserRole.LOGISTICIAN,
];
/** Кто правит: курс — основание для сумм в документах, это бухгалтерия. */
const CHANGE_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.ACCOUNTANT];

@ApiTags('currency')
@ApiBearerAuth()
@Controller('currency')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CurrencyController {
    constructor(private readonly currency: CurrencyService, private readonly audit: AuditService) { }

    @Get()
    @Roles(...VIEW_ROLES)
    @ApiOperation({ summary: 'Справочник валют' })
    list() {
        return this.currency.listCurrencies();
    }

    @Get('rates')
    @Roles(...VIEW_ROLES)
    @ApiOperation({
        summary: 'Курсы на дату',
        description: 'Если на эту дату курс не объявляли (выходные), отдаётся последний до неё с пометкой.',
    })
    rates(@Query('date') date?: string, @Query('onlyCommon') onlyCommon?: string) {
        return this.currency.ratesOn(date || new Date().toISOString().slice(0, 10), {
            onlyCommon: onlyCommon === 'true',
        });
    }

    @Get('rates/history')
    @Roles(...VIEW_ROLES)
    @ApiOperation({ summary: 'История курса одной валюты за период' })
    history(@Query('code') code: string, @Query('from') from: string, @Query('to') to: string) {
        return this.currency.history(code, from, to);
    }

    @Post('rates/import')
    @Roles(...CHANGE_ROLES)
    @RequirePermissions('accounting')
    @ApiOperation({ summary: 'Загрузить курсы Нацбанка на дату' })
    async import(@Request() req: any, @Body() dto: RatesImportDto) {
        const date = dto.date || new Date().toISOString().slice(0, 10);
        const result = await this.currency.importFromNbk(date, { userId: req.user.sub });
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'CREATE', entity: 'exchange_rate',
            entityLabel: `Загружены курсы Нацбанка на ${result.rateDate}`,
            details: { saved: result.saved, skippedManual: result.skippedManual },
        });
        return result;
    }

    @Post('rates/backfill')
    @Roles(...CHANGE_ROLES)
    @RequirePermissions('accounting')
    @ApiOperation({ summary: 'Догрузить курсы за период' })
    async backfill(@Request() req: any, @Body() dto: RatesBackfillDto) {
        const result = await this.currency.backfill(dto.from, dto.to, { userId: req.user.sub });
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'CREATE', entity: 'exchange_rate',
            entityLabel: `Догрузка курсов за ${dto.from} — ${dto.to}`,
            details: { loaded: result.loaded, failed: result.failed.length },
        });
        return result;
    }

    @Post('rates/manual')
    @Roles(...CHANGE_ROLES)
    @RequirePermissions('accounting')
    @ApiOperation({
        summary: 'Поставить курс руками',
        description: 'Для валют без официального курса и для курса по договору. Автозагрузка такой курс не затирает.',
    })
    async manual(@Request() req: any, @Body() dto: ManualRateDto) {
        const saved = await this.currency.setManualRate({ ...dto, userId: req.user.sub });
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'UPDATE', entity: 'exchange_rate',
            entityId: saved.id,
            entityLabel: `Курс ${dto.code} на ${dto.date} поставлен вручную: ${dto.rate}`,
            details: { note: dto.note ?? null },
        });
        return saved;
    }

    @Delete('rates/manual')
    @Roles(...CHANGE_ROLES)
    @RequirePermissions('accounting')
    @ApiOperation({ summary: 'Убрать ручной курс' })
    async removeManual(@Request() req: any, @Query('code') code: string, @Query('date') date: string) {
        const result = await this.currency.removeManualRate(code, date);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'DELETE', entity: 'exchange_rate',
            entityLabel: `Убран ручной курс ${code} на ${date}`,
        });
        return result;
    }
}
