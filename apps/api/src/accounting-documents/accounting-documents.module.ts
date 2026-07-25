import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { FinancialReportsService } from '../accounting/services/financial-reports.service';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';
import { AccountingDocumentsController } from './accounting-documents.controller';
import {
    AccountingDocumentsService,
    RECONCILIATION_REPORTS,
} from './accounting-documents.service';
import { AccountingDocumentPdfService } from './accounting-document-pdf.service';

@Module({
    imports: [AccountingModule],
    controllers: [AccountingDocumentsController],
    providers: [
        AccountingDocumentsService,
        AccountingDocumentCalculatorService,
        AccountingDocumentPdfService,
        { provide: RECONCILIATION_REPORTS, useExisting: FinancialReportsService },
    ],
    exports: [AccountingDocumentsService, AccountingDocumentCalculatorService, AccountingDocumentPdfService],
})
export class AccountingDocumentsModule {}
