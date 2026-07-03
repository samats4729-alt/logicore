import { OrdersModule } from '../orders/orders.module';
import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CompanyDriversService } from './services/company-drivers.service';
import { CompanyTrackingService } from './services/company-tracking.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [
        PrismaModule,
        OrdersModule,
        EmailModule,
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
    controllers: [CompanyController],
    providers: [CompanyService, CompanyDriversService, CompanyTrackingService],
    exports: [CompanyService, CompanyDriversService, CompanyTrackingService],
})
export class CompanyModule { }
