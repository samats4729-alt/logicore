import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { S3Module } from './s3/s3.module';

import { CitiesModule } from './cities/cities.module';
import { PartnersModule } from './partners/partners.module';
import { InventoryModule } from './inventory/inventory.module';
import { DriverModule } from './driver/driver.module';
import { CargoTypesModule } from './cargo-types/cargo-types.module';
import { ContractsModule } from './contracts/contracts.module';
import { ExternalCompaniesModule } from './external-companies/external-companies.module';
import { AccountingModule } from './accounting/accounting.module';
import { EmailModule } from './email/email.module';
import { InvoiceModule } from './invoice/invoice.module';
import { AssistantModule } from './assistant/assistant.module';
import { PayrollModule } from './payroll/payroll.module';
import { BillingModule } from './billing/billing.module';
import { AuditModule } from './audit/audit.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { GeoModule } from './geo/geo.module';
import { AdminStatsModule } from './admin-stats/admin-stats.module';
import { IdentityModule } from './identity/identity.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),
        ThrottlerModule.forRoot([{
            ttl: 60000,
            limit: 60,
        }]),
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
        S3Module,

        CitiesModule,
        PartnersModule,
        InventoryModule,
        DriverModule,
        CargoTypesModule,
        ContractsModule,
        ExternalCompaniesModule,
        AccountingModule,
        EmailModule,
        InvoiceModule,
        AssistantModule,
        PayrollModule,
        BillingModule,
        AuditModule,
        MonitoringModule,
        GeoModule,
        AdminStatsModule,
        IdentityModule,
    ],
})
export class AppModule { }
