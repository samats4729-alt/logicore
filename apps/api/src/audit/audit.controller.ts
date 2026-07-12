import { Controller, Get, Put, Body, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuditController {
    constructor(private auditService: AuditService) { }

    // ==================== Кабинет компании ====================

    @Get('status')
    @ApiOperation({ summary: 'Доступен ли журнал действий компаниям (для меню)' })
    async getStatus() {
        return { companiesEnabled: await this.auditService.isCompaniesUiEnabled() };
    }

    @Get('company')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Журнал действий своей компании' })
    async getCompanyLog(
        @Request() req: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const enabled = await this.auditService.isCompaniesUiEnabled();
        if (!enabled) {
            throw new ForbiddenException('Журнал действий пока не доступен');
        }
        return this.auditService.getCompanyLog(
            req.user.companyId,
            parseInt(page || '1', 10) || 1,
            Math.min(parseInt(limit || '50', 10) || 50, 200),
        );
    }

    // ==================== Админ платформы ====================

    @Get('admin')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Журнал действий по всем компаниям' })
    async getPlatformLog(
        @Query('companyId') companyId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.auditService.getPlatformLog({
            companyId: companyId || undefined,
            page: parseInt(page || '1', 10) || 1,
            limit: parseInt(limit || '50', 10) || 50,
        });
    }

    @Put('admin/settings')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Включить/выключить журнал для компаний' })
    async updateSettings(@Body() body: { companiesEnabled: boolean }) {
        return this.auditService.setCompaniesUiEnabled(!!body.companiesEnabled);
    }
}
