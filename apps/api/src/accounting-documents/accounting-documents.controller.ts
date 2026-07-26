import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Request,
    Res,
    UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountingDocumentDirection, AccountingDocumentType, Prisma, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { AccountingDocumentsService } from './accounting-documents.service';
import { AccountingDocumentPdfService } from './accounting-document-pdf.service';
import { StampImageService } from '../common/services/stamp-image.service';
import { PaymentAllocationService } from './payment-allocation.service';
import { CompanyVerifiedGuard, RequireVerifiedCompany } from '../company/guards/company-verified.guard';
import {
    AccountingDocumentListQueryDto,
    AccountingDocumentRegistryQueryDto,
    ApplyAllocationsDto,
    BillableOrdersQueryDto,
    CancelAccountingDocumentDto,
    CreateAccountingDocumentDto,
    GenerateReconciliationDraftDto,
    REGISTRY_MAX_ROWS,
    SuggestAllocationQueryDto,
    UpdateAccountingDocumentDto,
} from './dto/accounting-document.dto';
import type { RegistryKind } from './accounting-document-pdf.service';

/** Заголовок печатной формы по фильтрам журнала, из которого её вызвали. */
function registryKind(query: AccountingDocumentRegistryQueryDto): RegistryKind {
    if (query.type === AccountingDocumentType.SERVICE_ACT) return 'SERVICE_ACTS';
    if (query.type === AccountingDocumentType.PAYMENT_INVOICE) {
        return query.direction === AccountingDocumentDirection.INCOMING
            ? 'INCOMING_INVOICES'
            : 'OUTGOING_INVOICES';
    }
    return 'DOCUMENTS';
}

const VIEW_ROLES = [
    UserRole.ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.LOGISTICIAN,
    UserRole.FORWARDER,
];
const CHANGE_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT];

@ApiTags('accounting-documents')
@ApiBearerAuth()
@Controller('accounting-documents')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, CompanyVerifiedGuard)
@RequirePermissions('accounting')
export class AccountingDocumentsController {
    constructor(
        private readonly documents: AccountingDocumentsService,
        private readonly pdf: AccountingDocumentPdfService,
        private readonly stamps: StampImageService,
        private readonly allocations: PaymentAllocationService,
        private readonly audit: AuditService,
    ) {}

    @Post()
    @Roles(...CHANGE_ROLES)
    @RequireVerifiedCompany()
    @ApiOperation({ summary: 'Создать черновик бухгалтерского документа' })
    async create(@Request() req: any, @Body() dto: CreateAccountingDocumentDto) {
        const document = await this.documents.createDraft(req.user.companyId, req.user.id, dto);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'CREATE',
            entity: 'accounting_document',
            entityId: document.id,
            entityLabel: `${document.type} №${document.number}`,
        });
        return document;
    }

    @Post('reconciliation/from-ledger')
    @Roles(...CHANGE_ROLES)
    @RequireVerifiedCompany()
    @ApiOperation({ summary: 'Создать черновик акта сверки из заявок и оплат' })
    async createReconciliationFromLedger(
        @Request() req: any,
        @Body() dto: GenerateReconciliationDraftDto,
    ) {
        const document = await this.documents.createReconciliationDraftFromLedger(
            req.user.companyId,
            req.user.id,
            dto,
        );
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'CREATE',
            entity: 'accounting_document',
            entityId: document.id,
            entityLabel: `${document.type} №${document.number}`,
            details: {
                source: 'ledger',
                reportPeriodFrom: dto.reportPeriodFrom,
                reportPeriodTo: dto.reportPeriodTo,
                operationCount: document.reconciliationLines.length,
            },
        });
        return document;
    }

    @Get()
    @Roles(...VIEW_ROLES)
    @ApiOperation({ summary: 'Получить список бухгалтерских документов' })
    list(@Request() req: any, @Query() query: AccountingDocumentListQueryDto) {
        return this.documents.list(req.user.companyId, query);
    }

    // Объявлено до `:id`, иначе путь съедается параметром.
    @Get('billable-orders')
    @Roles(...CHANGE_ROLES)
    @ApiOperation({
        summary: 'Заявки контрагента, на которые счёт ещё не выставлен',
        description: 'Аналог кнопки «Подобрать по заявкам» в 1С.',
    })
    listBillableOrders(@Request() req: any, @Query() query: BillableOrdersQueryDto) {
        return this.documents.listBillableOrders(req.user.companyId, query);
    }

    // Тоже до `:id`, иначе путь съедается параметром.
    @Get('registry/pdf')
    @Roles(...VIEW_ROLES)
    @ApiOperation({
        summary: 'Печатная форма «Реестр документов»',
        description: 'Журнал за период на бумаге. Аналог меню Печать → Реестр документов в 1С.',
    })
    async downloadRegistryPdf(
        @Request() req: any,
        @Query() query: AccountingDocumentRegistryQueryDto,
        @Res() res: Response,
    ) {
        const registry = await this.documents.listForRegistry(req.user.companyId, query);
        const pdfBuffer = await this.pdf.generateRegistryPdf({
            kind: registryKind(query),
            companyName: registry.company?.name ?? null,
            companyBin: registry.company?.bin ?? null,
            counterpartyName: registry.counterpartyName,
            status: query.status ?? null,
            from: query.from ? new Date(query.from) : null,
            to: query.to ? new Date(query.to) : null,
            selectionOnly: Boolean(query.ids?.length),
            truncated: registry.documents.length >= REGISTRY_MAX_ROWS,
            printedAt: new Date(),
            rows: registry.documents.map((document) => ({
                number: document.number,
                documentDate: document.documentDate,
                status: document.status,
                counterpartyName: document.counterparty?.name ?? null,
                counterpartyBin: document.counterparty?.bin ?? null,
                orderNumbers: document.orders.map((link) => link.order.orderNumber),
                total: document.total,
                amountPaid: document.amountPaid,
                balanceDue: document.balanceDue,
            })),
            totals: {
                amount: new Prisma.Decimal(registry.totals.amount),
                paid: new Prisma.Decimal(registry.totals.paid),
                due: new Prisma.Decimal(registry.totals.due),
            },
        });
        // Имя файла только из латиницы и цифр: кириллица в заголовке HTTP
        // уже роняла отдачу PDF по публичной ссылке.
        const period = [query.from, query.to].filter(Boolean).join('_') || 'all';
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Registry_${period.replace(/[^0-9_-]+/g, '')}.pdf"`,
            'Content-Length': pdfBuffer.length,
            'Cache-Control': 'private, no-store',
        });
        res.end(pdfBuffer);
    }

    // Тоже до `:id`, иначе путь съедается параметром.
    @Get('allocation-suggestion')
    @Roles(...CHANGE_ROLES)
    @ApiOperation({
        summary: 'Предложить разнесение платежа по неоплаченным счетам',
        description: 'FIFO по сроку оплаты — как бухгалтер гасит вручную.',
    })
    suggestAllocation(@Request() req: any, @Query() query: SuggestAllocationQueryDto) {
        return this.allocations.suggest(req.user.companyId, query);
    }

    @Post('payments/:paymentId/allocations')
    @Roles(...CHANGE_ROLES)
    @ApiOperation({ summary: 'Разнести платёж по счетам' })
    async applyAllocations(
        @Request() req: any,
        @Param('paymentId') paymentId: string,
        @Body() dto: ApplyAllocationsDto,
    ) {
        const result = await this.allocations.apply(
            req.user.companyId,
            req.user.sub,
            paymentId,
            dto.allocations,
        );
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'payment',
            entityId: paymentId,
            entityLabel: 'Разнесение платежа по счетам',
            details: { documents: result.documents, allocated: result.allocated.toFixed(2) },
        });
        return result;
    }

    @Get(':id')
    @Roles(...VIEW_ROLES)
    @ApiOperation({ summary: 'Получить бухгалтерский документ' })
    getById(@Request() req: any, @Param('id') id: string) {
        return this.documents.getById(req.user.companyId, id);
    }

    @Patch(':id')
    @Roles(...CHANGE_ROLES)
    @ApiOperation({
        summary: 'Изменить черновик бухгалтерского документа',
        description: 'Проведённый документ не изменяется — его отменяют и создают заново.',
    })
    async update(
        @Request() req: any,
        @Param('id') id: string,
        @Body() dto: UpdateAccountingDocumentDto,
    ) {
        const document = await this.documents.updateDraft(req.user.companyId, id, dto);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'accounting_document',
            entityId: document.id,
            entityLabel: `${document.type} №${document.number}`,
            details: { fields: Object.keys(dto) },
        });
        return document;
    }

    @Get(':id/pdf')
    @Roles(...VIEW_ROLES)
    @ApiOperation({ summary: 'Скачать PDF бухгалтерского документа' })
    async downloadPdf(
        @Request() req: any,
        @Param('id') id: string,
        @Res() res: Response,
        // Флажок «Подпись и печать» — как в 1С. По умолчанию форма чистая.
        @Query('withStamp') withStamp?: string,
    ) {
        const document = await this.documents.getById(req.user.companyId, id);
        // Печать ставим только на исходящий документ и только свою: входящий
        // выставил контрагент, и наша печать на нём смысла не имеет.
        const mayStamp = withStamp === 'true' && document.direction === 'OUTGOING';
        const company = mayStamp
            ? await this.documents.getStampSource(req.user.companyId)
            : null;
        const { stamp } = await this.stamps.loadFor(company, mayStamp);
        const pdfBuffer = await this.pdf.generatePdf(document, stamp);
        const safeNumber = document.number.replace(/[^a-zA-Z0-9_-]+/g, '_');
        const filePrefix = document.type === 'SERVICE_ACT'
            ? 'ServiceAct_R1'
            : document.type === 'RECONCILIATION_ACT'
                ? 'ReconciliationAct'
                : 'Invoice';
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filePrefix}_${safeNumber}.pdf"`,
            'Content-Length': pdfBuffer.length,
            'Cache-Control': 'private, no-store',
        });
        res.end(pdfBuffer);
    }

    @Post(':id/share/regenerate')
    @Roles(...CHANGE_ROLES)
    @ApiOperation({
        summary: 'Перевыпустить публичную ссылку на документ',
        description: 'Ранее разосланные ссылки сразу перестают работать.',
    })
    async regenerateShare(@Request() req: any, @Param('id') id: string) {
        const result = await this.documents.regenerateShareToken(req.user.companyId, id);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'accounting_document',
            entityId: id,
            entityLabel: 'Публичная ссылка перевыпущена',
            details: { revoked: true },
        });
        return result;
    }

    @Post(':id/share/revoke')
    @Roles(...CHANGE_ROLES)
    @ApiOperation({ summary: 'Отозвать публичную ссылку на документ' })
    async revokeShare(@Request() req: any, @Param('id') id: string) {
        const result = await this.documents.revokeShare(req.user.companyId, id);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'accounting_document',
            entityId: id,
            entityLabel: 'Публичная ссылка отозвана',
            details: { revoked: true },
        });
        return result;
    }

    @Post(':id/post')
    @Roles(...CHANGE_ROLES)
    @ApiOperation({ summary: 'Провести бухгалтерский документ' })
    async postDocument(@Request() req: any, @Param('id') id: string) {
        const document = await this.documents.post(req.user.companyId, req.user.id, id);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'STATUS',
            entity: 'accounting_document',
            entityId: document.id,
            entityLabel: `${document.type} №${document.number}`,
            details: { status: document.status, checksum: document.checksum },
        });
        return document;
    }

    @Post(':id/cancel')
    @Roles(...CHANGE_ROLES)
    @ApiOperation({ summary: 'Отменить проведённый бухгалтерский документ' })
    async cancel(
        @Request() req: any,
        @Param('id') id: string,
        @Body() dto: CancelAccountingDocumentDto,
    ) {
        const document = await this.documents.cancel(req.user.companyId, req.user.id, id, dto.reason);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'STATUS',
            entity: 'accounting_document',
            entityId: document.id,
            entityLabel: `${document.type} №${document.number}`,
            details: { status: document.status, reason: dto.reason },
        });
        return document;
    }

    @Delete(':id')
    @Roles(...CHANGE_ROLES)
    @ApiOperation({ summary: 'Удалить черновик бухгалтерского документа' })
    async deleteDraft(@Request() req: any, @Param('id') id: string) {
        const result = await this.documents.deleteDraft(req.user.companyId, id);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'DELETE',
            entity: 'accounting_document',
            entityId: id,
        });
        return result;
    }
}
