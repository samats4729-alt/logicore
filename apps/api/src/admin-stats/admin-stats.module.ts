import { Module } from '@nestjs/common';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsController } from './admin-stats.controller';

@Module({
    controllers: [AdminStatsController],
    providers: [AdminStatsService],
})
export class AdminStatsModule { }
