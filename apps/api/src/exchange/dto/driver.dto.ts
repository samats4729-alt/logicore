import { ApiProperty } from '@nestjs/swagger';
import { ExchangeDriverDocumentKind, ExchangeDriverKind, ExchangeDriverStatus } from '@prisma/client';
import {
    IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

/** Вход водителя через Google: токен от Google и устройство (одна сессия на человека). */
export class DriverGoogleAuthDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    token: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    deviceId: string;
}

/**
 * Анкета водителя. Поля перечислены руками — всё, чего здесь нет, сервер
 * не примет (дыра «тело целиком в базу», HANDOFF 29.09).
 */
export class UpdateDriverProfileDto {
    @ApiProperty({ required: false, enum: ExchangeDriverKind })
    @IsEnum(ExchangeDriverKind, { message: 'Выберите: свой ИП или через парк' })
    @IsOptional()
    kind?: ExchangeDriverKind;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    parkCompanyId?: string;

    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(80) lastName?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(80) firstName?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(80) middleName?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(20) iin?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(30) phone?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(200) ipName?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(20) ipIin?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(20) vehiclePlate?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(60) vehicleBodyType?: string;

    @ApiProperty({ required: false, description: 'Грузоподъёмность, кг' })
    @IsInt({ message: 'Грузоподъёмность — целое число' })
    @Min(100)
    @Max(100000)
    @IsOptional()
    vehicleCapacityKg?: number;

    @ApiProperty({ required: false })
    @IsBoolean()
    @IsOptional()
    vehicleIsOwn?: boolean;
}

export class DriverDocumentDto {
    @ApiProperty({ enum: ExchangeDriverDocumentKind })
    @IsEnum(ExchangeDriverDocumentKind, { message: 'Неизвестный вид документа' })
    kind: ExchangeDriverDocumentKind;
}

export class DriverReasonDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty({ message: 'Напишите причину' })
    @MaxLength(300)
    reason: string;
}

export class DriverFeedQueryDto {
    @ApiProperty({ required: false, description: 'Тип кузова — только такие заявки' })
    @IsString()
    @IsOptional()
    @MaxLength(60)
    bodyType?: string;
}

/** Код приглашения парка — шесть знаков, как в ссылке. */
export class ParkCodeDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty({ message: 'Впишите код парка' })
    @MaxLength(12)
    code: string;
}

export const PARK_TRIP_FILTERS = ['active', 'done', 'all'] as const;

export class ParkTripsQueryDto {
    @ApiProperty({ required: false, enum: PARK_TRIP_FILTERS })
    @IsIn(PARK_TRIP_FILTERS as unknown as string[])
    @IsOptional()
    status?: typeof PARK_TRIP_FILTERS[number];
}

export const PARK_DRIVER_FILTERS = ['pending', 'approved', 'rejected', 'blocked', 'all'] as const;
export type ParkDriverFilter = typeof PARK_DRIVER_FILTERS[number];

export class ParkDriversQueryDto {
    @ApiProperty({ required: false, enum: PARK_DRIVER_FILTERS })
    @IsIn(PARK_DRIVER_FILTERS as unknown as string[])
    @IsOptional()
    status?: ParkDriverFilter;
}

export class AdminCompaniesQueryDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    q?: string;
}

export class SetParkDto {
    @ApiProperty()
    @IsBoolean()
    isPark: boolean;
}

export const PARK_FILTER_STATUSES: Record<ParkDriverFilter, ExchangeDriverStatus[] | undefined> = {
    pending: ['PENDING'],
    approved: ['APPROVED'],
    rejected: ['REJECTED'],
    blocked: ['BLOCKED'],
    all: ['PENDING', 'APPROVED', 'REJECTED', 'BLOCKED'],
};
