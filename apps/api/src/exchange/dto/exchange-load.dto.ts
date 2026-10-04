import { ApiProperty } from '@nestjs/swagger';
import {
    IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

/**
 * Груз на биржу. Поля перечислены руками: всё, чего здесь нет, сервер не
 * примет, — так закрыта дыра «тело запроса целиком в базу» (HANDOFF, 29.09).
 */
export class CreateExchangeLoadDto {
    @ApiProperty({ description: 'Город погрузки — как написал человек' })
    @IsString()
    @IsNotEmpty({ message: 'Укажите, откуда везти' })
    @MaxLength(120)
    originCityName: string;

    @ApiProperty({ required: false, description: 'Город погрузки из справочника, если выбрали подсказку' })
    @IsString()
    @IsOptional()
    originCityId?: string;

    @ApiProperty({ required: false, description: 'Адрес погрузки' })
    @IsString()
    @IsOptional()
    @MaxLength(300)
    originAddress?: string;

    @ApiProperty({ description: 'Город выгрузки — как написал человек' })
    @IsString()
    @IsNotEmpty({ message: 'Укажите, куда везти' })
    @MaxLength(120)
    destinationCityName: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    destinationCityId?: string;

    @ApiProperty({ required: false, description: 'Адрес выгрузки' })
    @IsString()
    @IsOptional()
    @MaxLength(300)
    destinationAddress?: string;

    @ApiProperty({ description: 'День погрузки, YYYY-MM-DD' })
    @IsDateString({}, { message: 'Укажите день погрузки' })
    loadingDate: string;

    @ApiProperty({ required: false, description: 'Время погрузки словами: «с 9 до 12»' })
    @IsString()
    @IsOptional()
    @MaxLength(60)
    loadingTime?: string;

    @ApiProperty({ description: 'Тип кузова: тент, рефрижератор, борт' })
    @IsString()
    @IsNotEmpty({ message: 'Выберите тип кузова' })
    @MaxLength(60)
    bodyType: string;

    @ApiProperty({ description: 'Что везём' })
    @IsString()
    @IsNotEmpty({ message: 'Напишите, что везём' })
    @MaxLength(300)
    cargoDescription: string;

    @ApiProperty({ required: false, description: 'Вес в килограммах' })
    @IsInt({ message: 'Вес должен быть числом' })
    @Min(1, { message: 'Вес должен быть больше нуля' })
    @Max(200000, { message: 'Вес больше 200 тонн — проверьте число' })
    @IsOptional()
    weightKg?: number;

    @ApiProperty({ required: false, description: 'Объём, м³' })
    @IsNumber({}, { message: 'Объём должен быть числом' })
    @Min(0.1, { message: 'Объём должен быть больше нуля' })
    @Max(500, { message: 'Объём больше 500 м³ — проверьте число' })
    @IsOptional()
    volumeM3?: number;

    @ApiProperty({ required: false, description: 'Что ещё важно водителю' })
    @IsString()
    @IsOptional()
    @MaxLength(1000)
    requirements?: string;

    @ApiProperty({ description: 'Сколько платим за перевозку, ₸' })
    @IsNumber({}, { message: 'Укажите цену перевозки' })
    @Min(1, { message: 'Укажите цену перевозки' })
    @Max(1_000_000_000, { message: 'Цена слишком большая — проверьте число' })
    price: number;
}

export const EXCHANGE_LIST_FILTERS = ['active', 'done', 'cancelled', 'all'] as const;
export type ExchangeListFilter = typeof EXCHANGE_LIST_FILTERS[number];

export class ExchangeLoadsQueryDto {
    @ApiProperty({ required: false, enum: EXCHANGE_LIST_FILTERS })
    @IsIn(EXCHANGE_LIST_FILTERS as unknown as string[])
    @IsOptional()
    status?: ExchangeListFilter;
}

export class CancelExchangeLoadDto {
    @ApiProperty({ description: 'Почему сняли груз' })
    @IsString()
    @IsNotEmpty({ message: 'Напишите, почему снимаете груз' })
    @MaxLength(300)
    reason: string;
}

export class RoutePricesQueryDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    originCityName: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    destinationCityName: string;
}
