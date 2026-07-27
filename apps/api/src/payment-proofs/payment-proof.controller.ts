import { Controller, Get, Param, Post, Body, Query, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentProofStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { S3Service } from '../s3/s3.service';
import { PaymentProofService } from './payment-proof.service';

const VIEW_ROLES = [
    UserRole.ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.LOGISTICIAN,
    UserRole.FORWARDER,
];
/** Решение по чеку принимает бухгалтерия, а не любой сотрудник. */
const REVIEW_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT];

@ApiTags('payment-proofs')
@ApiBearerAuth()
@Controller('payment-proofs')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('accounting')
export class PaymentProofController {
    constructor(
        private readonly proofs: PaymentProofService,
        private readonly audit: AuditService,
        private readonly s3: S3Service,
    ) {}

    @Get()
    @Roles(...VIEW_ROLES)
    @ApiOperation({ summary: 'Чеки, присланные контрагентами' })
    list(
        @Request() req: any,
        @Query('status') status?: PaymentProofStatus,
        @Query('orderId') orderId?: string,
    ) {
        return this.proofs.list(req.user.companyId, { status, orderId });
    }

    @Get('pending-count')
    @Roles(...VIEW_ROLES)
    @ApiOperation({ summary: 'Сколько чеков ждёт проверки' })
    async pendingCount(@Request() req: any) {
        return { count: await this.proofs.pendingCount(req.user.companyId) };
    }

    @Get(':id/file')
    @Roles(...VIEW_ROLES)
    @ApiOperation({ summary: 'Посмотреть файл чека' })
    async file(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
        const proof = await this.proofs.file(req.user.companyId, id);

        if (this.s3.isS3Enabled()) {
            const { stream, mimeType } = await this.s3.downloadFile(proof.fileUrl);
            res.setHeader('Content-Type', mimeType || proof.mimeType);
            res.setHeader('Cache-Control', 'private, no-store');
            return stream.pipe(res);
        }

        const absolute = path.join(process.cwd(), proof.fileUrl);
        if (!fs.existsSync(absolute)) {
            return res.status(404).json({ message: 'Файл не найден' });
        }
        res.setHeader('Content-Type', proof.mimeType);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.sendFile(absolute);
    }

    @Post(':id/accept')
    @Roles(...REVIEW_ROLES)
    @ApiOperation({
        summary: 'Подтвердить чек',
        description: 'Платёж НЕ создаётся: деньги проводит бухгалтер отдельно.',
    })
    async accept(@Param('id') id: string, @Request() req: any) {
        const proof = await this.proofs.accept(req.user.companyId, req.user.sub, id);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'payment_proof',
            entityId: id,
            entityLabel: 'Чек контрагента подтверждён',
        });
        return proof;
    }

    @Post(':id/reject')
    @Roles(...REVIEW_ROLES)
    @ApiOperation({ summary: 'Отклонить чек' })
    async reject(
        @Param('id') id: string,
        @Body() body: { reason?: string },
        @Request() req: any,
    ) {
        const proof = await this.proofs.reject(req.user.companyId, req.user.sub, id, body?.reason);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'payment_proof',
            entityId: id,
            entityLabel: `Чек контрагента отклонён${body?.reason ? `: ${body.reason}` : ''}`,
        });
        return proof;
    }
}
