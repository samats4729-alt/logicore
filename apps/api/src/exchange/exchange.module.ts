import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ExchangeController, ExchangeStatusController } from './exchange.controller';
import { ExchangeService } from './exchange.service';

/** Биржа грузов. Выключена, пока на сервере нет `EXCHANGE_ENABLED=true`. */
@Module({
    imports: [PrismaModule, AuditModule],
    controllers: [ExchangeStatusController, ExchangeController],
    providers: [ExchangeService],
})
export class ExchangeModule {}
