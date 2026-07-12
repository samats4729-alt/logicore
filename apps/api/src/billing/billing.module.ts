import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { SubscriptionInterceptor } from './subscription.interceptor';

@Module({
    controllers: [BillingController],
    providers: [
        BillingService,
        {
            provide: APP_INTERCEPTOR,
            useClass: SubscriptionInterceptor,
        },
    ],
    exports: [BillingService],
})
export class BillingModule { }
