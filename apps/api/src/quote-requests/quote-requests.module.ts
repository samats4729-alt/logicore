import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ContractsModule } from '../contracts/contracts.module';
import { CitiesModule } from '../cities/cities.module';
import { QuoteRequestsController } from './quote-requests.controller';
import { QuoteRequestsService } from './quote-requests.service';

@Module({
    imports: [ContractsModule, OrdersModule, CitiesModule],
    controllers: [QuoteRequestsController],
    providers: [QuoteRequestsService],
    exports: [QuoteRequestsService],
})
export class QuoteRequestsModule { }
