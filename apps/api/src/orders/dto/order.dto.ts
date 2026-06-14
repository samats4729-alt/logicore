import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsNotEmpty, IsArray, IsEnum, IsDateString, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { OrderStatus } from '@prisma/client';

@ValidatorConstraint({ name: 'IsAssignDriverValid', async: false })
export class IsAssignDriverValidConstraint implements ValidatorConstraintInterface {
    validate(_value: any, args: ValidationArguments) {
        const dto = args.object as any;
        const hasDriverId = !!dto.driverId;
        const hasManual = !!(dto.assignedDriverName || dto.assignedDriverPhone || dto.assignedDriverPlate || dto.assignedDriverTrailer);
        return (hasDriverId && !hasManual) || (!hasDriverId && hasManual);
    }

    defaultMessage(args: ValidationArguments) {
        const dto = args.object as any;
        const hasDriverId = !!dto.driverId;
        const hasManual = !!(dto.assignedDriverName || dto.assignedDriverPhone || dto.assignedDriverPlate || dto.assignedDriverTrailer);
        if (hasDriverId && hasManual) {
            return 'Нельзя одновременно передавать ID водителя и заполнять данные вручную';
        }
        return 'Необходимо указать водителя (ID или заполнить вручную)';
    }
}

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

    @ApiProperty({ required: false, description: 'ID суб-экспедитора' })
    @IsString()
    @IsOptional()
    subForwarderId?: string;

    @ApiProperty({ required: false, description: 'Цена для суб-экспедитора' })
    @IsNumber()
    @IsOptional()
    subForwarderPrice?: number;

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
    @ApiProperty({ required: false, example: 'driver-id-123' })
    @IsString()
    @IsOptional()
    @Validate(IsAssignDriverValidConstraint)
    driverId?: string;

    @ApiProperty({ required: false, description: 'ID компании-субподрядчика' })
    @IsString()
    @IsOptional()
    partnerId?: string;

    @ApiProperty({ required: false, description: 'ФИО водителя вручную' })
    @IsString()
    @IsOptional()
    assignedDriverName?: string;

    @ApiProperty({ required: false, description: 'Телефон водителя вручную' })
    @IsString()
    @IsOptional()
    assignedDriverPhone?: string;

    @ApiProperty({ required: false, description: 'Госномер авто вручную' })
    @IsString()
    @IsOptional()
    assignedDriverPlate?: string;

    @ApiProperty({ required: false, description: 'Госномер прицепа вручную' })
    @IsString()
    @IsOptional()
    assignedDriverTrailer?: string;
}
