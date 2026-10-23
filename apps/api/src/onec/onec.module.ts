import { Module } from '@nestjs/common';
import { OneCSoapController } from './onec-soap.controller';
import { OneCConnectionsController } from './onec-connections.controller';
import { OneCExchangeService } from './onec-exchange.service';
import { OneCConnectionsService } from './onec-connections.service';
import { OneCFileStore } from './onec-files';
import { OneCImportService } from './onec-import.service';
import { ExternalCompaniesModule } from '../external-companies/external-companies.module';

/** Прямой обмен с 1С: адрес для 1С компании и настройка в кабинете. */
@Module({
    imports: [ExternalCompaniesModule],
    controllers: [OneCSoapController, OneCConnectionsController],
    providers: [OneCExchangeService, OneCConnectionsService, OneCFileStore, OneCImportService],
})
export class OneCModule { }
