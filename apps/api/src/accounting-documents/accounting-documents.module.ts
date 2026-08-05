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
import { PublicAccountingDocumentController } from './public-accounting-document.controller';
import { StampImageService } from '../common/services/stamp-image.service';
import { PaymentAllocationModule } from './payment-allocation.module';
import { PendingWorkService } from './pending-work.service';
import { SharedReportInvoiceService } from './shared-report-invoice.service';
import { CompanyVerificationModule } from '../company/company-verification.module';

import { CurrencyModule } from '../currency/currency.module';

@Module({
    imports: [CurrencyModule, AccountingModule, CompanyVerificationModule, PaymentAllocationModule],
    controllers: [AccountingDocumentsController, PublicAccountingDocumentController],
    providers: [
        AccountingDocumentsService,
        AccountingDocumentCalculatorService,
        AccountingDocumentPdfService,
        PendingWorkService,
        SharedReportInvoiceService,
        StampImageService,
        { provide: RECONCILIATION_REPORTS, useExisting: FinancialReportsService },
    ],
    exports: [AccountingDocumentsService, AccountingDocumentCalculatorService, AccountingDocumentPdfService, PaymentAllocationModule],
})
export class AccountingDocumentsModule {}
