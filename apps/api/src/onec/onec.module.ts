import { Module } from '@nestjs/common';
import { OneCSoapController } from './onec-soap.controller';
import { OneCConnectionsController } from './onec-connections.controller';
import { OneCExchangeService } from './onec-exchange.service';
import { OneCConnectionsService } from './onec-connections.service';
import { OneCFileStore } from './onec-files';
import { OneCImportService } from './onec-import.service';
import { OneCExportService } from './onec-export.service';
import { ExternalCompaniesModule } from '../external-companies/external-companies.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PaymentAllocationModule } from '../accounting-documents/payment-allocation.module';

/** Прямой обмен с 1С: адрес для 1С компании и настройка в кабинете. */
@Module({
    imports: [ExternalCompaniesModule, AccountingModule, PaymentAllocationModule],
    controllers: [OneCSoapController, OneCConnectionsController],
    providers: [OneCExchangeService, OneCConnectionsService, OneCFileStore, OneCImportService, OneCExportService],
})
export class OneCModule { }
