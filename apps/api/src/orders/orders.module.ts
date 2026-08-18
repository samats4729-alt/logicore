import { CompanyVerificationModule } from '../company/company-verification.module';
import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { OrdersService } from './orders.service';
import { OrdersExportService } from './orders-export.service';
import { OrdersController } from './orders.controller';
import { PowerOfAttorneyService } from './power-of-attorney.service';
import { OrderContractService } from './order-contract.service';
import { OrderDocumentsService } from './order-documents.service';
import { OrderSettlementsModule } from './order-settlements.module';
import { StampImageService } from '../common/services/stamp-image.service';
import { EmailModule } from '../email/email.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PayrollModule } from '../payroll/payroll.module';

import { CurrencyModule } from '../currency/currency.module';

@Module({
    imports: [
        CurrencyModule, EmailModule, AccountingModule, PayrollModule, BillingModule, CompanyVerificationModule,
        OrderSettlementsModule,
    ],
    controllers: [OrdersController],
    providers: [
        OrdersService,
        OrdersExportService,
        PowerOfAttorneyService,
        OrderContractService,
        OrderDocumentsService,
        StampImageService,
    ],
    exports: [OrdersService, OrderSettlementsModule],
})
export class OrdersModule { }
