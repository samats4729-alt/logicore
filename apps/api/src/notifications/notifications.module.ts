import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { DriverPushService } from './driver-push.service';
import { NotificationsController } from './notifications.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
    imports: [PrismaModule],
    controllers: [NotificationsController],
    providers: [NotificationsService, DriverPushService],
    exports: [NotificationsService, DriverPushService],
})
export class NotificationsModule { }
