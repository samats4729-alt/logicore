import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrdersModule } from './orders/orders.module';
import { LocationsModule } from './locations/locations.module';
import { TrackingModule } from './tracking/tracking.module';
import { DocumentsModule } from './documents/documents.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RedisModule } from './redis/redis.module';
import { CompanyModule } from './company/company.module';
import { ForwarderModule } from './forwarder/forwarder.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),
        PrismaModule,
        RedisModule,
        AuthModule,
        UsersModule,
        OrdersModule,
        LocationsModule,
        TrackingModule,
        DocumentsModule,
        WarehouseModule,
        NotificationsModule,
        CompanyModule,
        ForwarderModule,
    ],
})
export class AppModule { }
