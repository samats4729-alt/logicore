import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { UserRole } from '@prisma/client';
import { ExternalCompaniesService } from './external-companies.service';
import { AuditService } from '../audit/audit.service';

@ApiTags('external-companies')
@Controller('external-companies')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class ExternalCompaniesController {
    constructor(private readonly service: ExternalCompaniesService, private readonly auditService: AuditService) { }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN, UserRole.ACCOUNTANT, UserRole.WAREHOUSE_MANAGER)
    @ApiOperation({ summary: 'Список внешних компаний' })
    async getAll(@Req() req: any) {
        return this.service.getExternalCompanies(req.user.companyId);
    }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @RequirePermissions('partners', 'orders')
    @ApiOperation({ summary: 'Создать внешнюю компанию' })
    async create(@Req() req: any, @Body() dto: {
        name: string;
        bin?: string;
        phone?: string;
        email?: string;
        type: 'CUSTOMER' | 'FORWARDER';
        isCustomer?: boolean;
        isCarrier?: boolean;
        address?: string;
        directorName?: string;
    }) {
        const result = await this.service.createExternalCompany(req.user.companyId, dto);
        await this.auditService.log({
            companyId: req.user.companyId, user: req.user, action: 'CREATE', entity: 'partner',
            entityId: (result as any)?.id, entityLabel: `Контрагент «${dto.name}»`,
        });
        return result;
    }

    @Patch(':id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @RequirePermissions('partners')
    @ApiOperation({ summary: 'Обновить внешнюю компанию' })
    async update(@Req() req: any, @Param('id') id: string, @Body() dto: {
        name?: string;
        bin?: string;
        phone?: string;
        email?: string;
        address?: string;
        directorName?: string;
        isCustomer?: boolean;
        isCarrier?: boolean;
    }) {
        const result = await this.service.updateExternalCompany(req.user.companyId, id, dto);
        await this.auditService.log({
            companyId: req.user.companyId, user: req.user, action: 'UPDATE', entity: 'partner',
            entityId: id, entityLabel: `Контрагент «${(result as any)?.name || dto.name || id}»`,
        });
        return result;
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @RequirePermissions('partners')
    @ApiOperation({ summary: 'Удалить внешнюю компанию' })
    async delete(@Req() req: any, @Param('id') id: string) {
        const result = await this.service.deleteExternalCompany(req.user.companyId, id);
        await this.auditService.log({
            companyId: req.user.companyId, user: req.user, action: 'DELETE', entity: 'partner',
            entityId: id, entityLabel: `Контрагент «${(result as any)?.name || id}»`,
        });
        return result;
    }
}
