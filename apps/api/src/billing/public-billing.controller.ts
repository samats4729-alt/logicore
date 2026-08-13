import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BillingService } from './billing.service';

/**
 * Тариф для главной страницы. Без авторизации: цену смотрят до регистрации.
 *
 * Отдельным контроллером, потому что весь остальной биллинг закрыт гвардами
 * на уровне класса — а тут ровно одно значение, которое и так висит на сайте
 * для всех. Меняется оно в админке, а не в коде: страницу пересобирать ради
 * новой цены не нужно.
 */
@Controller('public/billing')
export class PublicBillingController {
    constructor(private readonly billingService: BillingService) { }

    @Throttle({ default: { limit: 60, ttl: 60000 } })
    @Get('tariff')
    async getTariff() {
        return this.billingService.getTariff();
    }
}
