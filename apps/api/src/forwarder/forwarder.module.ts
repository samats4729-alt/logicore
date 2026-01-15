import { Module } from '@nestjs/common';
import { ForwarderController } from './forwarder.controller';
import { ForwarderService } from './forwarder.service';
import { ForwarderDriversService } from './services/forwarder-drivers.service';
import { ForwarderTrackingService } from './services/forwarder-tracking.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ForwarderController],
    providers: [ForwarderService, ForwarderDriversService, ForwarderTrackingService],
    exports: [ForwarderService],
})
export class ForwarderModule { }
