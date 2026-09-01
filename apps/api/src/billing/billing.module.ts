import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { SubscriptionInterceptor } from './subscription.interceptor';
import { PublicBillingController } from './public-billing.controller';
import { FreedomPayController } from './freedompay/freedompay.controller';
import { FreedomPayService } from './freedompay/freedompay.service';
import { CardPaymentService } from './freedompay/card-payment.service';

@Module({
    controllers: [BillingController, PublicBillingController, FreedomPayController],
    providers: [
        BillingService,
        FreedomPayService,
        CardPaymentService,
        {
            provide: APP_INTERCEPTOR,
            useClass: SubscriptionInterceptor,
        },
    ],
    exports: [BillingService],
})
export class BillingModule { }
