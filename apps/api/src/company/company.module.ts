import { OrdersModule } from '../orders/orders.module';
import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CompanyController } from './company.controller';
import { CompanyVerificationController } from './company-verification.controller';
import { CompanyService } from './company.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CompanyDriversService } from './services/company-drivers.service';
import { CompanyTrackingService } from './services/company-tracking.service';
import { CompanyVerificationModule } from './company-verification.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailModule } from '../email/email.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
    imports: [
        PrismaModule,
        CompanyVerificationModule,
        OrdersModule,
        EmailModule,
        BillingModule,
        IdentityModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => {
                const secret = configService.get<string>('JWT_SECRET');
                if (!secret) {
                    throw new Error('JWT_SECRET environment variable is not configured');
                }
                return {
                    secret,
                    signOptions: {
                        expiresIn: configService.get('JWT_EXPIRES_IN') || '7d',
                    },
                };
            },
            inject: [ConfigService],
        }),
    ],
    controllers: [CompanyController, CompanyVerificationController],
    providers: [CompanyService, CompanyDriversService, CompanyTrackingService],
    // Ре-экспорт модулем, а не провайдером: экспортировать чужой
    // провайдер Nest не даёт.
    exports: [CompanyService, CompanyDriversService, CompanyTrackingService, CompanyVerificationModule],
})
export class CompanyModule { }
