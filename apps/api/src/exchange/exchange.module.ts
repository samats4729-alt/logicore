import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ExchangeController, ExchangeStatusController } from './exchange.controller';
import { ExchangeService } from './exchange.service';
import {
    ExchangeAdminController, ExchangeDriverAuthController, ExchangeDriverController, ExchangeParkController,
} from './drivers.controller';
import { ExchangeDriversService } from './drivers.service';

/** Биржа грузов. Выключена, пока на сервере нет `EXCHANGE_ENABLED=true`. */
@Module({
    imports: [PrismaModule, AuditModule, AuthModule],
    controllers: [
        ExchangeStatusController, ExchangeController,
        ExchangeDriverAuthController, ExchangeDriverController, ExchangeParkController, ExchangeAdminController,
    ],
    providers: [ExchangeService, ExchangeDriversService],
})
export class ExchangeModule {}
