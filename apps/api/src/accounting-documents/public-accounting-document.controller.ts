import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountingDocumentsService } from './accounting-documents.service';
import { AccountingDocumentPdfService } from './accounting-document-pdf.service';
import { SharedReportInvoiceService } from './shared-report-invoice.service';
import { SharedReportInvoiceDto } from './dto/shared-report-invoice.dto';

/**
 * Публичный доступ к документу по ссылке — для контрагента, у которого нет
 * учётной записи. Аутентификации нет, поэтому:
 *  - черновики и документы с отозванной ссылкой не отдаются;
 *  - несуществующая и отозванная ссылка неразличимы (обе 404), чтобы по
 *    ответу нельзя было перебирать токены;
 *  - стоит ограничение частоты, как на остальных публичных страницах.
 */
@ApiTags('public-accounting-documents')
@Controller('public/accounting-documents')
export class PublicAccountingDocumentController {
    constructor(
        private readonly documents: AccountingDocumentsService,
        private readonly pdf: AccountingDocumentPdfService,
        private readonly sharedReportInvoices: SharedReportInvoiceService,
    ) {}

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('from-shared-report/:token')
    @ApiOperation({
        summary: 'Контрагент выставляет счёт по отмеченным сделкам',
        description: 'Появляется у нас входящим ЧЕРНОВИКОМ: проводит бухгалтер, а не отправитель.',
    })
    async createFromSharedReport(
        @Param('token') token: string,
        @Body() dto: SharedReportInvoiceDto,
    ) {
        return this.sharedReportInvoices.createFromSharedReport(token, dto);
    }

    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Post('from-shared-report/:token/:documentId/withdraw')
    @ApiOperation({
        summary: 'Контрагент отзывает свой счёт',
        description: 'Только пока счёт черновик и по нему не разнесены платежи.',
    })
    async withdrawFromSharedReport(
        @Param('token') token: string,
        @Param('documentId') documentId: string,
    ) {
        return this.sharedReportInvoices.withdrawFromSharedReport(token, documentId);
    }

    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @Get(':token')
    @ApiOperation({ summary: 'Просмотр документа по публичной ссылке' })
    async getByToken(@Param('token') token: string) {
        return this.documents.getPublicByToken(token);
    }

    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Get(':token/pdf')
    @ApiOperation({ summary: 'Печатная форма документа по публичной ссылке' })
    async getPdfByToken(@Param('token') token: string, @Res() res: Response) {
        const document = await this.documents.getPublicByToken(token);
        const buffer = await this.pdf.generatePdf(document as any);
        // Номер документа кириллический («СЧ-2026-000001»), а в заголовке
        // HTTP допустим только ASCII — иначе Node роняет ответ.
        const safeNumber = document.number.replace(/[^a-zA-Z0-9_-]+/g, '_');
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="document_${safeNumber}.pdf"`,
            'Content-Length': String(buffer.length),
            'Cache-Control': 'private, no-store',
        });
        res.end(buffer);
    }
}
