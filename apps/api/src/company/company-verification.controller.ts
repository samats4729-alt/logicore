import { Body, Controller, Get, Param, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanyVerificationStatus, UserRole } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { CompanyVerificationService } from './services/company-verification.service';

class RejectCompanyDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    reason!: string;
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

    @Post(':id/reject')
    @ApiOperation({ summary: 'Отклонить организацию с причиной' })
    async reject(@Request() req: any, @Param('id') id: string, @Body() dto: RejectCompanyDto) {
        const company = await this.verification.reject(id, req.user.sub, dto.reason);
        await this.audit.log({
            companyId: id,
            user: req.user,
            action: 'STATUS',
            entity: 'company',
            entityId: id,
            entityLabel: `Организация отклонена: ${company.name}`,
            details: { reason: company.rejectionReason },
        });
        return company;
    }
}
