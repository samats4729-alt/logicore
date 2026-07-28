import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { QuoteRequestsController } from './quote-requests.controller';
import { QuoteRequestsService } from './quote-requests.service';

@Module({
    imports: [ContractsModule],
    controllers: [QuoteRequestsController],
    providers: [QuoteRequestsService],
    exports: [QuoteRequestsService],
})
export class QuoteRequestsModule { }
