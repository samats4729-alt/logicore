import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { OneCConnectionChoices, OneCConnectionsService } from './onec-connections.service';

class ChoicesDto implements OneCConnectionChoices {
    @IsOptional() @IsBoolean() enabled?: boolean;
    @IsOptional() @IsBoolean() sendActs?: boolean;
    @IsOptional() @IsBoolean() receiveCounterparties?: boolean;
    @IsOptional() @IsBoolean() receivePayments?: boolean;
    @IsOptional() @IsBoolean() sendCarrierActs?: boolean;
    @IsOptional() @IsBoolean() sendContracts?: boolean;
    @IsOptional() @IsBoolean() receiveCarrierPayments?: boolean;
}

/** Как изменение назвать в журнале действий — словами руководителя. */
const CHOICE_LABELS: Record<keyof OneCConnectionChoices, [string, string]> = {
    enabled: ['Обмен с 1С возобновлён', 'Обмен с 1С приостановлен'],
    sendActs: ['Обмен с 1С: акты отправляются в 1С', 'Обмен с 1С: акты в 1С не отправляются'],
    receiveCounterparties: ['Обмен с 1С: контрагенты принимаются из 1С', 'Обмен с 1С: контрагенты из 1С не принимаются'],
    receivePayments: ['Обмен с 1С: оплаты клиентов принимаются из 1С', 'Обмен с 1С: оплаты из 1С не принимаются'],
    sendCarrierActs: ['Обмен с 1С: акты перевозчиков отправляются в 1С', 'Обмен с 1С: акты перевозчиков в 1С не отправляются'],
    sendContracts: ['Обмен с 1С: договоры отправляются в 1С', 'Обмен с 1С: договоры в 1С не отправляются'],
    receiveCarrierPayments: ['Обмен с 1С: оплаты перевозчикам принимаются из 1С', 'Обмен с 1С: оплаты перевозчикам из 1С не принимаются'],
};

/**
 * «Обмен с 1С» в кабинете: включить, получить адрес для своей 1С, выдать
 * новый, приостановить и выбрать, что передавать. Это решение руководителя:
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
    @ApiOperation({ summary: 'Приостановить или возобновить обмен с 1С, выбрать, что передавать' })
    async update(@Request() req: any, @Param('id') id: string, @Body() dto: ChoicesDto) {
        const result = await this.connections.update(req.user.companyId, id, dto);
        for (const key of Object.keys(CHOICE_LABELS) as (keyof OneCConnectionChoices)[]) {
            if (typeof dto[key] !== 'boolean') continue;
            await this.audit.log({
                companyId: req.user.companyId, user: req.user, action: 'SETTINGS', entity: 'one_c_connection',
                entityId: id, entityLabel: CHOICE_LABELS[key][dto[key] ? 0 : 1],
            });
        }
        return result;
    }
}
