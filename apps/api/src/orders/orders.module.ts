import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PowerOfAttorneyService } from './power-of-attorney.service';
import { EmailModule } from '../email/email.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PayrollModule } from '../payroll/payroll.module';

@Module({
    imports: [EmailModule, AccountingModule, PayrollModule],
    controllers: [OrdersController],
    providers: [OrdersService, PowerOfAttorneyService],
    exports: [OrdersService],
})
export class OrdersModule { }
