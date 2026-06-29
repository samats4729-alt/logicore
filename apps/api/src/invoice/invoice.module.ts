import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { PublicInvoiceController } from './public-invoice.controller';
import { InvoiceService } from './invoice.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
    imports: [AccountingModule],
    controllers: [InvoiceController, PublicInvoiceController],
    providers: [InvoiceService],
    exports: [InvoiceService],
})
export class InvoiceModule {}
