import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

/** Отклик на заявку: согласен на цену компании или своя цена, когда подаст машину. */
export class MakeOfferDto {
    @ApiProperty({ required: false, description: 'Согласен на цену компании' })
    @IsBoolean()
    @IsOptional()
    agree?: boolean;

    @ApiProperty({ required: false, description: 'Своя цена, ₸ — если не согласен на цену компании' })
    @IsNumber({}, { message: 'Цена — числом' })
    @Min(1, { message: 'Укажите свою цену' })
    @Max(1_000_000_000, { message: 'Цена слишком большая — проверьте число' })
    @IsOptional()
    price?: number;

    @ApiProperty({ required: false, description: 'Когда подаст машину, YYYY-MM-DD' })
    @IsDateString({}, { message: 'Дата подачи машины указана с ошибкой' })
    @IsOptional()
    readyDate?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(500, { message: 'Комментарий — не длиннее 500 знаков' })
    comment?: string;
}
