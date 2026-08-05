import { Body, Controller, Delete, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { CurrencyService, localToday } from './currency.service';
import { CompanyRateDto, RatesBackfillDto, RatesImportDto } from './dto/currency.dto';

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
    rates(@Request() req: any, @Query('date') date?: string, @Query('onlyCommon') onlyCommon?: string) {
        return this.currency.ratesOn(date || localToday(), {
            onlyCommon: onlyCommon === 'true',
            companyId: req.user.companyId,
        });
    }

    @Get('rates/history')
    @Roles(...VIEW_ROLES)
    @ApiOperation({ summary: 'История курса одной валюты за период' })
    history(
        @Request() req: any,
        @Query('code') code: string,
        @Query('from') from: string,
        @Query('to') to: string,
    ) {
        return this.currency.history(code, from, to, { companyId: req.user.companyId });
    }

    @Post('rates/import')
    @Roles(...CHANGE_ROLES)
    @RequirePermissions('accounting')
    @ApiOperation({ summary: 'Загрузить курсы Нацбанка на дату' })
    async import(@Request() req: any, @Body() dto: RatesImportDto) {
        const date = dto.date || localToday();
        const result = await this.currency.importFromNbk(date, { userId: req.user.sub });
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'CREATE', entity: 'exchange_rate',
            entityLabel: `Загружены курсы Нацбанка на ${result.rateDate}`,
            details: { saved: result.saved, unknown: result.unknown.length },
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
        summary: 'Поставить свой курс компании',
        description:
            'Для валют без официального курса и для курса по договору. Курс принадлежит компании, ' +
            'другим компаниям не виден и загрузкой Нацбанка не затирается.',
    })
    async manual(@Request() req: any, @Body() dto: CompanyRateDto) {
        const saved = await this.currency.setCompanyRate({
            ...dto, companyId: req.user.companyId, userId: req.user.sub,
        });
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'UPDATE', entity: 'exchange_rate',
            entityId: saved.id,
            entityLabel: `Свой курс ${dto.code} на ${dto.date}: ${dto.rate}`,
            details: { note: dto.note ?? null },
        });
        return saved;
    }

    @Delete('rates/manual')
    @Roles(...CHANGE_ROLES)
    @RequirePermissions('accounting')
    @ApiOperation({ summary: 'Убрать свой курс компании' })
    async removeManual(@Request() req: any, @Query('code') code: string, @Query('date') date: string) {
        const result = await this.currency.removeCompanyRate(req.user.companyId, code, date);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'DELETE', entity: 'exchange_rate',
            entityLabel: `Убран свой курс ${code} на ${date}`,
        });
        return result;
    }
}
