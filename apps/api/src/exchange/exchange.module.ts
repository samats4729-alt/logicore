import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ExchangeController, ExchangeStatusController } from './exchange.controller';
import { ExchangeService } from './exchange.service';
import {
    ExchangeAdminController, ExchangeDriverAuthController, ExchangeDriverController, ExchangeParkController,
    ExchangePublicController,
} from './drivers.controller';
import { ExchangeDriverLoadsService } from './driver-loads.service';
import { ExchangeDriversService } from './drivers.service';
import { ExchangeOffersService } from './exchange-offers.service';
import { ExchangeParkService } from './park.service';
import { ExchangePayoutsService } from './payouts.service';
import { ExchangeParkRegistryService } from './park-registry.service';
import { ParkContractService } from './park-contract.service';
import { VehicleOwnerContractService } from './vehicle-owner-contract.service';
import { ExchangeSettlementService } from './settlement.service';
import { ExchangeFuelService } from './fuel.service';
import { ExchangeParkEarningsService } from './park-earnings.service';
import { StampImageService } from '../common/services/stamp-image.service';
import { DriverCalculatorController } from './driver-calculator.controller';
import { OrdersModule } from '../orders/orders.module';
import { ExchangeAdvanceRequestsService } from './advance-requests.service';
import { ExchangeDriverVehiclesService } from './driver-vehicles.service';

/** Биржа грузов. Выключена, пока на сервере нет `EXCHANGE_ENABLED=true`. */
@Module({
    imports: [PrismaModule, AuditModule, AuthModule, OrdersModule],
    controllers: [
        ExchangeStatusController, ExchangeController,
        ExchangeDriverAuthController, ExchangeDriverController, ExchangeParkController, ExchangeAdminController,
        ExchangePublicController, DriverCalculatorController,
    ],
    providers: [ExchangeService, ExchangeDriversService, ExchangeDriverLoadsService, ExchangeOffersService, ExchangeParkService, ExchangePayoutsService, ParkContractService, VehicleOwnerContractService, StampImageService, ExchangeSettlementService, ExchangeFuelService, ExchangeParkRegistryService, ExchangeAdvanceRequestsService, ExchangeDriverVehiclesService, ExchangeParkEarningsService],
})
export class ExchangeModule {}
