import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsNotEmpty, IsArray, IsEnum, IsDateString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class CreateOrderDto {
    @ApiProperty({ required: false, description: 'ID заказчика (если не указан - берется из токена)' })
    @IsString()
    @IsOptional()
    customerId?: string;

    @ApiProperty({ example: 'location-id-123' })
    @IsString()
    @IsNotEmpty()
    pickupLocationId: string;

    @ApiProperty()
    @IsString()
    deliveryLocationId: string;

    @ApiProperty({ example: 'Строительные материалы - кирпич' })
    @IsString()
    @IsNotEmpty()
    cargoDescription: string;

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

    @ApiProperty({ required: false })
    @IsDateString()
    @IsOptional()
    pickupDate?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    pickupNotes?: string;

    @ApiProperty({ required: false, type: [Object] })
    @IsArray()
    @IsOptional()
    deliveryPoints?: { locationId: string; notes?: string }[];

    @ApiProperty({ required: false, example: 150000 })
    @IsNumber()
    @IsOptional()
    customerPrice?: number;

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
