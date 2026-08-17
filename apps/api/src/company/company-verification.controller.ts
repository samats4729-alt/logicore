import { Body, Controller, Get, Param, Post, Put, Query, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanyVerificationStatus, UserRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { CompanyVerificationService } from './services/company-verification.service';

class RejectCompanyDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    reason!: string;

    /**
     * Отказ окончательный: заявку признали чужой.
     *
     * По умолчанию выключено — обычный отказ должен оставлять настоящей
     * компании возможность исправиться.
     */
    @IsOptional()
    @IsBoolean()
    block?: boolean;
}

class ReviewQueueQueryDto {
    @IsOptional()
    @IsEnum(CompanyVerificationStatus)
    status?: CompanyVerificationStatus;
}

/**
 * Очередь подтверждения организаций — рабочее место владельца платформы.
 *
 * Только ADMIN: решение о допуске компании к работе принимает человек,
 * который отвечает за платформу, а не сама компания.
 */
@ApiTags('admin-company-verification')
@ApiBearerAuth()
@Controller('admin/company-verification')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CompanyVerificationController {
    constructor(
        private readonly verification: CompanyVerificationService,
        private readonly audit: AuditService,
    ) {}

    /**
     * Требовать ли подтверждение для работы.
     *
     * Объявлено до `:id/...`, иначе путь перехватывается параметром.
     */
    @Get('settings')
    @ApiOperation({ summary: 'Требуется ли подтверждение организации' })
    async getSettings() {
        return { required: await this.verification.isVerificationRequired() };
    }

    @Put('settings')
    @ApiOperation({ summary: 'Включить или выключить обязательное подтверждение' })
    async setSettings(@Request() req: any, @Body() body: { required: boolean }) {
        const result = await this.verification.setVerificationRequired(Boolean(body?.required));
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'UPDATE', entity: 'platform',
            entityId: 'verification_required',
            entityLabel: result.required
                ? 'Подтверждение организации стало обязательным'
                : 'Подтверждение организации больше не обязательно',
        });
        return result;
    }

    @Get()
    @ApiOperation({ summary: 'Организации на проверке' })
    list(@Query() query: ReviewQueueQueryDto) {
        return this.verification.listForReview(query.status);
    }

    // Объявлено до `:id/...`, иначе путь перехватывается параметром.
    @Get('documents/:documentId')
    @ApiOperation({ summary: 'Открыть приложенный документ' })
    async readDocument(@Param('documentId') documentId: string, @Res() res: Response) {
        const file = await this.verification.readDocument(documentId);
        res.set({
            'Content-Type': file.mimeType || 'application/octet-stream',
            'Content-Disposition': `inline; filename="document_${documentId}"`,
            'Cache-Control': 'private, no-store',
        });
        file.stream.pipe(res);
    }

    @Post(':id/approve')
    @ApiOperation({ summary: 'Подтвердить организацию' })
    async approve(@Request() req: any, @Param('id') id: string) {
        const company = await this.verification.approve(id, req.user.sub);
        await this.audit.log({
            companyId: id,
            user: req.user,
            action: 'STATUS',
            entity: 'company',
            entityId: id,
            entityLabel: `Организация подтверждена: ${company.name}`,
            details: { verificationStatus: company.verificationStatus },
        });
        return company;
    }

    @Post(':id/link-active-orders')
    @ApiOperation({
        summary: 'Отдать организации её рейсы, которые сейчас в работе',
        description: 'Только незавершённые. Счета и платежи остаются у того, кто завёл карточку контрагента.',
    })
    async linkActiveOrders(@Request() req: any, @Param('id') id: string) {
        const result = await this.verification.linkActiveOrders(id);
        await this.audit.log({
            companyId: id,
            user: req.user,
            action: 'UPDATE',
            entity: 'company',
            entityId: id,
            entityLabel: `Рейсы в работе переданы организации «${result.companyName}» (БИН ${result.bin})`,
            details: { movedOrders: result.movedOrders, partnerCards: result.partnerCards },
        });
        return result;
    }

    @Post(':id/reject')
    @ApiOperation({
        summary: 'Отклонить организацию с причиной',
        description: 'С block=true отказ окончательный: закрывает повторную подачу и работу в кабинете.',
    })
    async reject(@Request() req: any, @Param('id') id: string, @Body() dto: RejectCompanyDto) {
        const blocked = Boolean(dto.block);
        const company = await this.verification.reject(id, req.user.sub, dto.reason, blocked);
        await this.audit.log({
            companyId: id,
            user: req.user,
            action: 'STATUS',
            entity: 'company',
            entityId: id,
            entityLabel: blocked
                ? `Организация отклонена окончательно, доступ закрыт: ${company.name}`
                : `Организация отклонена: ${company.name}`,
            details: { reason: company.rejectionReason, blocked },
        });
        return company;
    }

    @Post(':id/unblock')
    @ApiOperation({
        summary: 'Снять окончательный отказ',
        description: 'Организация снова может приложить документы и подать заявку.',
    })
    async unblock(@Request() req: any, @Param('id') id: string) {
        const company = await this.verification.unblock(id);
        await this.audit.log({
            companyId: id,
            user: req.user,
            action: 'STATUS',
            entity: 'company',
            entityId: id,
            entityLabel: `Запрет снят, организация может подать заявку заново: ${company.name}`,
        });
        return company;
    }
}
