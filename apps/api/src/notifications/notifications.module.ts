import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
    imports: [PrismaModule],
    providers: [NotificationsService],
    exports: [NotificationsService],
})
export class NotificationsModule { }
