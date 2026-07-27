import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { AuditModule } from '../audit/audit.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PaymentProofService } from './payment-proof.service';
import { PaymentProofController } from './payment-proof.controller';
import { PublicPaymentProofController } from './public-payment-proof.controller';

@Module({
    imports: [PrismaModule, S3Module, AuditModule, AccountingModule],
    controllers: [PaymentProofController, PublicPaymentProofController],
    providers: [PaymentProofService],
    exports: [PaymentProofService],
})
export class PaymentProofsModule {}
