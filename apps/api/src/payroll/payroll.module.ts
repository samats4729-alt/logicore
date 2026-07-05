import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';

@Module({
    imports: [PrismaModule, forwardRef(() => AccountingModule)],
    controllers: [PayrollController],
    providers: [PayrollService],
    exports: [PayrollService],
})
export class PayrollModule {}
