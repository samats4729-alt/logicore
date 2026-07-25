import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';
import { AccountingDocumentsController } from './accounting-documents.controller';
import { AccountingDocumentsService } from './accounting-documents.service';

@Module({
    imports: [AccountingModule],
    controllers: [AccountingDocumentsController],
    providers: [AccountingDocumentsService, AccountingDocumentCalculatorService],
    exports: [AccountingDocumentsService, AccountingDocumentCalculatorService],
})
export class AccountingDocumentsModule {}
