import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentAllocationService } from './payment-allocation.service';
import { CurrencyModule } from '../currency/currency.module';

/**
 * Лёгкий модуль: разнесение платежей нужно и документам, и платежам.
 * Кроме Prisma нужны курсы валют — при погашении валютного счёта считается
 * курсовая разница. Цикла импортов между AccountingModule и
 * AccountingDocumentsModule по-прежнему нет.
 */
@Module({
    imports: [PrismaModule, CurrencyModule],
    providers: [PaymentAllocationService],
    exports: [PaymentAllocationService],
})
export class PaymentAllocationModule {}
