import { Module } from '@nestjs/common';
import { DriverService } from './driver.service';
import { DriverPublicController } from './driver-public.controller';
import { DriverAdminController } from './driver-admin.controller';

@Module({
    controllers: [DriverPublicController, DriverAdminController],
    providers: [DriverService],
})
export class DriverModule { }
