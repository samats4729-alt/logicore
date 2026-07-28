import { Module, Global } from '@nestjs/common';
import { TelegramService } from './telegram.service';

/**
 * Глобальный, потому что уведомлять владельца может понадобиться из любого
 * места — сегодня это обращения пользователей, завтра что-то ещё.
 */
@Global()
@Module({
    providers: [TelegramService],
    exports: [TelegramService],
})
export class TelegramModule { }
