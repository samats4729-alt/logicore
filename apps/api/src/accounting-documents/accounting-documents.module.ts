import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';
import { AccountingDocumentsController } from './accounting-documents.controller';
import { AccountingDocumentsService } from './accounting-documents.service';
import { AccountingDocumentPdfService } from './accounting-document-pdf.service';

@Module({
    imports: [AccountingModule],
    controllers: [AccountingDocumentsController],
    providers: [AccountingDocumentsService, AccountingDocumentCalculatorService, AccountingDocumentPdfService],
    exports: [AccountingDocumentsService, AccountingDocumentCalculatorService, AccountingDocumentPdfService],
})
export class AccountingDocumentsModule {}
