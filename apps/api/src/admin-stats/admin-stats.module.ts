import { Module } from '@nestjs/common';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsController } from './admin-stats.controller';

@Module({
    controllers: [AdminStatsController],
    providers: [AdminStatsService],
    // Ту же сводку показывает бот владельца — считаем её в одном месте.
    exports: [AdminStatsService],
})
export class AdminStatsModule { }
