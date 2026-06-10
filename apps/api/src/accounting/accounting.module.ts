import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { PublicAccountingController } from './public-accounting.controller';
import { AccountingService } from './accounting.service';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [EmailModule],
    controllers: [AccountingController, PublicAccountingController],
    providers: [AccountingService],
})
export class AccountingModule { }
