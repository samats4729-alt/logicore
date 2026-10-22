import { Module } from '@nestjs/common';
import { OneCSoapController } from './onec-soap.controller';
import { OneCConnectionsController } from './onec-connections.controller';
import { OneCExchangeService } from './onec-exchange.service';
import { OneCConnectionsService } from './onec-connections.service';

/** Прямой обмен с 1С: адрес для 1С компании и настройка в кабинете. */
@Module({
    controllers: [OneCSoapController, OneCConnectionsController],
    providers: [OneCExchangeService, OneCConnectionsService],
})
export class OneCModule { }
