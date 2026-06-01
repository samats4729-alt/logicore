import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { PrismaModule } from '../prisma/prisma.module';

import { CompanyDriversService } from './services/company-drivers.service';
import { CompanyTrackingService } from './services/company-tracking.service';

@Module({
    imports: [PrismaModule],
    controllers: [CompanyController],
    providers: [CompanyService, CompanyDriversService, CompanyTrackingService],
    exports: [CompanyService, CompanyDriversService, CompanyTrackingService],
})
export class CompanyModule { }
