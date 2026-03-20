import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PowerOfAttorneyService } from './power-of-attorney.service';

@Module({
    controllers: [OrdersController],
    providers: [OrdersService, PowerOfAttorneyService],
    exports: [OrdersService],
})
export class OrdersModule { }
