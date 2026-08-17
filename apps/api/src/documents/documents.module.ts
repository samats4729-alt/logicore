import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { S3Module } from '../s3/s3.module';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { SharedReportDocumentService } from './shared-report-document.service';
import { PublicSharedReportDocumentController } from './public-shared-report-document.controller';

@Module({
    imports: [AccountingModule, S3Module],
    controllers: [DocumentsController, PublicSharedReportDocumentController],
    providers: [DocumentsService, SharedReportDocumentService],
    exports: [DocumentsService, SharedReportDocumentService],
})
export class DocumentsModule { }
