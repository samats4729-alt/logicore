import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportExportService } from './report-export.service';

@Module({
    controllers: [ReportsController],
    providers: [ReportExportService],
})
export class ReportsModule {}
