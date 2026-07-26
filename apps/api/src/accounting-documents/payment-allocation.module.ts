import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentAllocationService } from './payment-allocation.service';

/**
 * Лёгкий модуль: разнесение платежей нужно и документам, и платежам.
 * Сервису достаточно Prisma, поэтому подключается без цикла импортов
 * между AccountingModule и AccountingDocumentsModule.
 */
@Module({
    imports: [PrismaModule],
    providers: [PaymentAllocationService],
    exports: [PaymentAllocationService],
})
export class PaymentAllocationModule {}
