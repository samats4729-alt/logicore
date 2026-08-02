import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, IsNotEmpty, IsArray, IsEnum, IsDateString, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments , IsIn } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

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

    @ApiProperty({ required: false, description: 'Ответственный менеджер от компании создателя: userId, "NONE" — не назначать (возьмёт любой), пусто — создатель' })
    @IsString()
    @IsOptional()
    responsibleUserId?: string;

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

    @ApiProperty({ required: false, example: 1.2, description: 'Длина груза, м' })
    @IsNumber()
    @IsOptional()
    cargoLength?: number;

    @ApiProperty({ required: false, example: 0.8, description: 'Ширина груза, м' })
    @IsNumber()
    @IsOptional()
    cargoWidth?: number;

    @ApiProperty({ required: false, example: 1.5, description: 'Высота груза, м' })
    @IsNumber()
    @IsOptional()
    cargoHeight?: number;

    @ApiProperty({ required: false, example: 12, description: 'Количество палет' })
    @IsNumber()
    @IsOptional()
    palletCount?: number;

    @IsOptional()
    @IsArray()
    pallets?: any[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    loadingTypes?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    packagingTypes?: string[];

    @ApiProperty({ required: false, example: 240, description: 'Количество грузовых мест' })
    @IsNumber()
    @IsOptional()
    placesCount?: number;

    @ApiProperty({ required: false, example: false, description: 'Можно ли штабелировать' })
    @IsBoolean()
    @IsOptional()
    stackable?: boolean;

    @ApiProperty({ required: false, example: 2, description: 'Температурный режим, нижняя граница, °C' })
    @IsNumber()
    @IsOptional()
    tempMin?: number;

    @ApiProperty({ required: false, example: 6, description: 'Температурный режим, верхняя граница, °C' })
    @IsNumber()
    @IsOptional()
    tempMax?: number;

    @ApiProperty({ required: false, example: true, description: 'Опасный груз (ДОПОГ)' })
    @IsBoolean()
    @IsOptional()
    adr?: boolean;

    @ApiProperty({ required: false, example: '3', description: 'Класс опасности по ДОПОГ' })
    @IsString()
    @IsOptional()
    adrClass?: string;

    @ApiProperty({ required: false, example: 4500000, description: 'Объявленная стоимость груза' })
    @IsNumber()
    @IsOptional()
    cargoValue?: number;

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

    @ApiProperty({ required: false, example: false })
    @IsBoolean()
    @IsOptional()
    hasVat?: boolean;

    @ApiProperty({ required: false, example: 12 })
    @IsNumber()
    @IsOptional()
    vatRate?: number;

    @ApiProperty({ required: false, example: false })
    @IsBoolean()
    @IsOptional()
    executorHasVat?: boolean;

    @ApiProperty({ required: false, example: 12 })
    @IsNumber()
    @IsOptional()
    executorVatRate?: number;
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

/**
 * Параметры списка заявок.
 *
 * Отдельный класс нужен из-за того, как Nest проверяет строку запроса:
 * `@Query()` разбирает её целиком по одному классу, а лишние поля запрещены.
 * Пока список опирался на общий `PaginationQueryDto`, всё, кроме `page` и
 * `limit`, отклонялось — фильтры по статусу, заказчику и водителю были
 * описаны в контроллере и в документации, но любой запрос с ними отвечал
 * «property status should not exist». То есть не работали ни разу.
 */
export class OrdersQueryDto extends PaginationQueryDto {
    @ApiProperty({ required: false, enum: OrderStatus })
    @IsEnum(OrderStatus)
    @IsOptional()
    status?: OrderStatus;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    customerId?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    driverId?: string;

    /** Номер, груз, город маршрута или название заказчика. */
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    search?: string;

    /**
     * Выставлен ли по рейсу счёт клиенту: `yes` — только выставленные,
     * `no` — только те, по которым счёта ещё нет. Просьба бухгалтера:
     * ей нужно видеть, что осталось выставить.
     */
    @ApiProperty({ required: false, enum: ['yes', 'no'] })
    @IsIn(['yes', 'no'])
    @IsOptional()
    invoiced?: 'yes' | 'no';
}
