import { Global, Module } from '@nestjs/common';
import { AdminStatsModule } from '../admin-stats/admin-stats.module';
import { CompanyVerificationModule } from '../company/company-verification.module';
import { TelegramAdminService } from './telegram-admin.service';
import { TelegramWebhookController } from './telegram-webhook.controller';

/**
 * Бот владельца — отдельно от `TelegramModule`.
 *
 * `TelegramModule` умеет только одно: отправить сообщение. Его инжектят
 * биллинг и поддержка, и он должен оставаться лёгким. Бот же тянет за собой
 * проверку компаний и статистику — если сложить это в один модуль, каждый,
 * кто просто хочет отправить уведомление, потянет за собой половину системы.
 *
 * Берём `CompanyVerificationModule`, а не `CompanyModule`: он для того и
 * выделен — подключить проверку компаний, не втягивая заявки, биллинг и почту.
 *
 * Глобальный, потому что о поданной заявке сообщает `MyCompanyController`, и
 * ему для этого не должно требоваться знать про телеграм в списке импортов.
 */
@Global()
@Module({
    imports: [CompanyVerificationModule, AdminStatsModule],
    controllers: [TelegramWebhookController],
    providers: [TelegramAdminService],
    exports: [TelegramAdminService],
})
export class TelegramAdminModule { }
