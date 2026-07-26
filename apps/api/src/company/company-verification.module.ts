import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CompanyVerificationService } from './services/company-verification.service';
import { CompanyVerifiedGuard } from './guards/company-verified.guard';

/**
 * Отдельный лёгкий модуль, чтобы гейт «компания подтверждена» можно было
 * подключить к заявкам и бухгалтерии, не втягивая весь CompanyModule с его
 * зависимостями (заявки, биллинг, почта) и не рискуя циклом импортов.
 */
@Module({
    imports: [PrismaModule],
    providers: [CompanyVerificationService, CompanyVerifiedGuard],
    exports: [CompanyVerificationService, CompanyVerifiedGuard],
})
export class CompanyVerificationModule {}
