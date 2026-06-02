import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsNotEmpty, IsArray, IsEnum, IsDateString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class CreateOrderDto {
    @ApiProperty({ required: false, description: 'ID заказчика (если не указан - берется из токена)' })
    @IsString()
    @IsOptional()
    customerId?: string;

    @ApiProperty({ required: false, description: 'ID компании-заказчика' })
    @IsString()
    @IsOptional()
    customerCompanyId?: string;

    @ApiProperty({ required: true, type: [Object], description: 'Массив точек маршрута (Погрузка, Догруз, Выгрузка)' })
    @IsArray()
    @IsNotEmpty()
    routePoints: { locationId: string; pointType: 'PICKUP' | 'ADDITIONAL_PICKUP' | 'DELIVERY'; notes?: string; expectedDate?: string }[];

    @ApiProperty({ required: false, example: 'Строительные материалы - кирпич' })
    @IsString()
    @IsOptional()
    cargoDescription?: string;

    @ApiProperty({ required: false, example: 15000 })
    @IsNumber()
    @IsOptional()
    cargoWeight?: number;

    @ApiProperty({ required: false, example: 45 })
    @IsNumber()
    @IsOptional()
    cargoVolume?: number;

    @ApiProperty({ required: false, example: 'Строительные материалы' })
    @IsString()
    @IsOptional()
    cargoType?: string;

    @ApiProperty({ required: false, example: 'Требуется тент, аккуратная погрузка' })
    @IsString()
    @IsOptional()
    requirements?: string;

    @ApiProperty({ required: false, example: 'Сыпучие' })
    @IsString()
    @IsOptional()
    natureOfCargo?: string;


    @ApiProperty({ required: false, example: 150000 })
    @IsNumber()
    @IsOptional()
    customerPrice?: number;

    @ApiProperty({ required: false, enum: ['FIXED', 'PER_KM', 'PER_TON'], example: 'FIXED' })
    @IsString()
    @IsOptional()
    @IsEnum(['FIXED', 'PER_KM', 'PER_TON'])
    customerPriceType?: 'FIXED' | 'PER_KM' | 'PER_TON';

    @ApiProperty({ required: false, example: 120000, description: 'Ставка перевозчику (водителю/экспедитору)' })
    @IsNumber()
    @IsOptional()
    driverCost?: number;

    @ApiProperty({ required: false, description: 'ID водителя для назначения' })
    @IsString()
    @IsOptional()
    driverId?: string;

    @ApiProperty({ required: false, description: 'ID экспедитора (компании-перевозчика)' })
    @IsString()
    @IsOptional()
    forwarderId?: string;

    // --- New Fields ---
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    customerPaymentCondition?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    customerPaymentForm?: string;

    @ApiProperty({ required: false })
    @IsDateString()
    @IsOptional()
    customerPaymentDate?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    driverPaymentCondition?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    driverPaymentForm?: string;

    @ApiProperty({ required: false })
    @IsDateString()
    @IsOptional()
    driverPaymentDate?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    ttnNumber?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    atiCodeCustomer?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    atiCodeCarrier?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    trailerNumber?: string;

    @ApiProperty({ required: false })
    @IsNumber()
    @IsOptional()
    actualWeight?: number;

    @ApiProperty({ required: false })
    @IsNumber()
    @IsOptional()
    actualVolume?: number;

    @ApiProperty({ required: false, description: 'ID применённого тарифа из доп. соглашения' })
    @IsString()
    @IsOptional()
    appliedTariffId?: string;
}

export class UpdateStatusDto {
    @ApiProperty({ enum: OrderStatus })
    @IsEnum(OrderStatus)
    status: OrderStatus;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    comment?: string;
}

export class AssignDriverDto {
    @ApiProperty({ example: 'driver-id-123' })
    @IsString()
    @IsNotEmpty()
    driverId: string;

    @ApiProperty({ required: false, description: 'ID компании-субподрядчика' })
    @IsString()
    @IsOptional()
    partnerId?: string;
}
