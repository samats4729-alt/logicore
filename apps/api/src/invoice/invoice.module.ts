import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { PublicInvoiceController } from './public-invoice.controller';
import { InvoiceService } from './invoice.service';
import { AccountingModule } from '../accounting/accounting.module';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [AccountingModule, EmailModule],
    controllers: [InvoiceController, PublicInvoiceController],
    providers: [InvoiceService],
    exports: [InvoiceService],
})
export class InvoiceModule {}
