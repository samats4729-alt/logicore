import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { OneCConnectionsService } from './onec-connections.service';

class EnabledDto {
    @IsBoolean() enabled!: boolean;
}

/**
 * «Обмен с 1С» в кабинете: включить, получить адрес, логин и пароль для
 * своей 1С, сменить пароль, приостановить. Это решение руководителя:
 * подключение открывает 1С компании дорогу к её данным в LogiCore.
 */
@ApiTags('one-c')
@Controller('company/one-c')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OneCConnectionsController {
    constructor(
        private readonly connections: OneCConnectionsService,
        private readonly audit: AuditService,
    ) {}

    @Get()
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Подключения 1С компании и журнал обмена' })
    list(@Request() req: any) {
        return this.connections.list(req.user.companyId);
    }

    @Post()
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Включить обмен с 1С: адрес, логин и пароль (пароль — один раз)' })
    async create(@Request() req: any) {
        const result = await this.connections.create(req.user.companyId, req.user.sub);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'SETTINGS', entity: 'one_c_connection',
            entityId: result.id, entityLabel: 'Обмен с 1С: выдан адрес и пароль для 1С',
        });
        return result;
    }

    @Post(':id/password')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Новый пароль для 1С — прежний перестаёт работать' })
    async resetPassword(@Request() req: any, @Param('id') id: string) {
        const result = await this.connections.resetPassword(req.user.companyId, id);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'SETTINGS', entity: 'one_c_connection',
            entityId: id, entityLabel: 'Обмен с 1С: выдан новый пароль',
        });
        return result;
    }

    @Patch(':id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Приостановить или возобновить обмен с 1С' })
    async setEnabled(@Request() req: any, @Param('id') id: string, @Body() dto: EnabledDto) {
        const result = await this.connections.setEnabled(req.user.companyId, id, dto.enabled);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'SETTINGS', entity: 'one_c_connection',
            entityId: id, entityLabel: dto.enabled ? 'Обмен с 1С возобновлён' : 'Обмен с 1С приостановлен',
        });
        return result;
    }
}
