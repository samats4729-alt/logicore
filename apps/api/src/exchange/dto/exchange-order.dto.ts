import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Выставить заявку на биржу: цена для исполнителя и что ещё ему важно. */
export class PublishOrderDto {
    @ApiProperty({ description: 'Цена, которую компания предлагает исполнителю, ₸' })
    @IsNumber({}, { message: 'Укажите цену для исполнителя' })
    @Min(1, { message: 'Укажите цену для исполнителя' })
    @Max(1_000_000_000, { message: 'Цена слишком большая — проверьте число' })
    price: number;

    @ApiProperty({ required: false, description: 'Что ещё важно исполнителю — видно всем на бирже' })
    @IsString()
    @IsOptional()
    @MaxLength(1000, { message: 'Примечание — не длиннее 1000 знаков' })
    note?: string;
}

/** Снять заявку с биржи — с причиной. */
export class UnpublishOrderDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty({ message: 'Напишите, почему снимаете заявку с биржи' })
    @MaxLength(300)
    reason: string;
}

/** Фильтр биржи: откуда, куда, кузов. Всё необязательно. */
export class ExchangeBoardQueryDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(120)
    from?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(120)
    to?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(60)
    bodyType?: string;
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
