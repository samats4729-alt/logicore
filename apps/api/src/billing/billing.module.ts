import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { SubscriptionInterceptor } from './subscription.interceptor';
import { PublicBillingController } from './public-billing.controller';

@Module({
    controllers: [BillingController, PublicBillingController],
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
