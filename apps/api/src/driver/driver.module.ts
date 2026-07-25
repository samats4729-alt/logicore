import { Module } from '@nestjs/common';
import { DriverService } from './driver.service';
import { DriverPublicController } from './driver-public.controller';
import { DriverAdminController } from './driver-admin.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
    imports: [OrdersModule],
    controllers: [DriverPublicController, DriverAdminController],
    providers: [DriverService],
})
export class DriverModule { }
