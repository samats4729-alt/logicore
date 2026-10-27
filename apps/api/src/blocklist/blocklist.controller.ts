import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { AuditService } from '../audit/audit.service';
import { BLOCK_KINDS } from './blocklist';
import { BlocklistService } from './blocklist.service';

class AddBlockDto {
    @IsIn(BLOCK_KINDS as unknown as string[], { message: 'Выберите, что заносим: БИН/ИИН, телефон или госномер' })
    kind!: string;

    @IsString()
    @IsNotEmpty({ message: 'Укажите значение' })
    @MaxLength(40)
    value!: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string | null;

    @IsString()
    @IsNotEmpty({ message: 'Напишите причину' })
    @MaxLength(500)
    reason!: string;
}

/**
 * Чёрный список компании (задачи шефа, F5/S2). Занести может любой, кто
 * работает с контрагентами или водителями: мошенника замечает тот, кто с
 * ним говорил. Снять — только руководитель, чтобы запись не исчезала
 * молча.
 */
@ApiTags('blocklist')
@Controller('company/blocklist')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('partners', 'drivers', 'orders')
@ApiBearerAuth()
export class BlocklistController {
    constructor(
        private blocklist: BlocklistService,
        private audit: AuditService,
    ) { }

    @Get()
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Чёрный список компании' })
    async list(@Request() req: any) {
        return this.blocklist.list(req.user.companyId);
    }

    @Post()
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Занести в чёрный список' })
    async add(@Request() req: any, @Body() dto: AddBlockDto) {
        const result = await this.blocklist.add(req.user.companyId, req.user.sub, dto);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'CREATE', entity: 'blocklist',
            entityId: result.entry.id, entityLabel: `Чёрный список: ${result.entry.value}${result.entry.name ? ` (${result.entry.name})` : ''}`,
        });
        return result;
    }

    @Delete(':id')
    @Roles(UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Убрать из чёрного списка' })
    async remove(@Request() req: any, @Param('id') id: string) {
        const result = await this.blocklist.remove(req.user.companyId, id);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'DELETE', entity: 'blocklist', entityId: id,
        });
        return result;
    }
}
