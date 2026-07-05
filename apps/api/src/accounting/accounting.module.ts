import { Module, forwardRef } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { PublicAccountingController } from './public-accounting.controller';
import { AccountingService } from './accounting.service';
import { FinanceCalculatorService } from './services/finance-calculator.service';
import { PeriodClosingService } from './services/period-closing.service';
import { FinancialSettingsService } from './services/financial-settings.service';
import { PaymentsService } from './services/payments.service';
import { FinancialReportsService } from './services/financial-reports.service';
import { EmailModule } from '../email/email.module';
import { PayrollModule } from '../payroll/payroll.module';

@Module({
    imports: [EmailModule, forwardRef(() => PayrollModule)],
    controllers: [AccountingController, PublicAccountingController],
    providers: [
        AccountingService,
        FinanceCalculatorService,
        PeriodClosingService,
        FinancialSettingsService,
        PaymentsService,
        FinancialReportsService,
    ],
    exports: [
        AccountingService,
        FinanceCalculatorService,
        PeriodClosingService,
        FinancialSettingsService,
        PaymentsService,
        FinancialReportsService,
    ],
})
export class AccountingModule { }
