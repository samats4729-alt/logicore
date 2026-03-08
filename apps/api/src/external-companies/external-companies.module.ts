import { Module } from '@nestjs/common';
import { ExternalCompaniesController } from './external-companies.controller';
import { ExternalCompaniesService } from './external-companies.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ExternalCompaniesController],
    providers: [ExternalCompaniesService],
    exports: [ExternalCompaniesService],
})
export class ExternalCompaniesModule { }
