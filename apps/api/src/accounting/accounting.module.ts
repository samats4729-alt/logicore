import { PaymentAllocationModule } from '../accounting-documents/payment-allocation.module';
import { Module, forwardRef } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { PublicAccountingController } from './public-accounting.controller';
import { AccountingService } from './accounting.service';
import { FinanceCalculatorService } from './services/finance-calculator.service';
import { PeriodClosingService } from './services/period-closing.service';
import { FinancialSettingsService } from './services/financial-settings.service';
import { PaymentsService } from './services/payments.service';
import { FinancialReportsService } from './services/financial-reports.service';
import { SharedReportLinkService } from './services/shared-report-link.service';
import { CurrencyRevaluationService } from './services/currency-revaluation.service';
import { EmailModule } from '../email/email.module';
import { PayrollModule } from '../payroll/payroll.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
    imports: [PaymentAllocationModule, EmailModule, CurrencyModule, forwardRef(() => PayrollModule)],
    controllers: [AccountingController, PublicAccountingController],
    providers: [
        AccountingService,
        FinanceCalculatorService,
        PeriodClosingService,
        FinancialSettingsService,
        PaymentsService,
        FinancialReportsService,
        SharedReportLinkService,
        CurrencyRevaluationService,
    ],
    exports: [
        AccountingService,
        FinanceCalculatorService,
        PeriodClosingService,
        FinancialSettingsService,
        PaymentsService,
        FinancialReportsService,
        SharedReportLinkService,
        CurrencyRevaluationService,
    ],
})
export class AccountingModule { }
