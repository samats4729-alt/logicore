import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsInt, IsOptional, IsNotEmpty, IsEnum, IsDateString, Min } from 'class-validator';
import { QuoteRequestStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateQuoteRequestDto {
    @ApiProperty({ description: 'Клиент, который просит расчёт' })
    @IsString()
    @IsNotEmpty({ message: 'Укажите клиента: запрос всегда чей-то' })
    customerCompanyId: string;

    @ApiProperty({ description: 'Город погрузки — как написал человек' })
    @IsString()
    @IsOptional()
    originCityName?: string;

    @ApiProperty({ required: false, description: 'Город погрузки из справочника, если выбрали подсказку' })
    @IsString()
    @IsOptional()
    originCityId?: string;

    @ApiProperty({ description: 'Город выгрузки — как написал человек' })
    @IsString()
    @IsOptional()
    destinationCityName?: string;

    @ApiProperty({ required: false, description: 'Город выгрузки из справочника' })
    @IsString()
    @IsOptional()
    destinationCityId?: string;

    @ApiProperty({ required: false, description: 'Адрес погрузки из справочника' })
    @IsString()
    @IsOptional()
    originLocationId?: string;

    @ApiProperty({ required: false, description: 'Адрес выгрузки из справочника' })
    @IsString()
    @IsOptional()
    destinationLocationId?: string;

    @ApiProperty({ required: false, description: 'Адрес погрузки текстом, если его ещё нет в справочнике' })
    @IsString()
    @IsOptional()
    originAddress?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    destinationAddress?: string;

    @ApiProperty({ required: false, description: 'Когда груз готов к отгрузке' })
    @IsDateString({}, { message: 'Дата готовности указана в неверном формате' })
    @IsOptional()
    readyDate?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    cargoDescription?: string;

    @ApiProperty({ required: false, description: 'Характер груза: напитки, стройматериалы' })
    @IsString()
    @IsOptional()
    natureOfCargo?: string;

    @ApiProperty({ required: false, description: 'Тип кузова: тент, рефрижератор' })
    @IsString()
    @IsOptional()
    cargoType?: string;

    @ApiProperty({ required: false, description: 'Вес в килограммах — как в заявке' })
    @IsNumber({}, { message: 'Вес должен быть числом' })
    @Min(0, { message: 'Вес не может быть отрицательным' })
    @IsOptional()
    cargoWeight?: number;

    @ApiProperty({ required: false, description: 'Объём, м³' })
    @IsNumber({}, { message: 'Объём должен быть числом' })
    @Min(0, { message: 'Объём не может быть отрицательным' })
    @IsOptional()
    cargoVolume?: number;

    @ApiProperty({ required: false, description: 'Сколько паллет' })
    @IsInt({ message: 'Количество паллет должно быть целым числом' })
    @Min(0, { message: 'Количество паллет не может быть отрицательным' })
    @IsOptional()
    palletCount?: number;

    @ApiProperty({ required: false, description: 'Вид паллеты: EUR, FIN, AMERICAN, HALF, CUSTOM' })
    @IsString()
    @IsOptional()
    palletKind?: string;

    @ApiProperty({ required: false, description: 'Почём нашли машину' })
    @IsNumber({}, { message: 'Цена перевозчика должна быть числом' })
    @Min(0, { message: 'Цена перевозчика не может быть отрицательной' })
    @IsOptional()
    carrierCost?: number;

    @ApiProperty({ required: false, description: 'Что предложили клиенту' })
    @IsNumber({}, { message: 'Цена клиенту должна быть числом' })
    @Min(0, { message: 'Цена клиенту не может быть отрицательной' })
    @IsOptional()
    customerPrice?: number;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    notes?: string;
}

export class UpdateQuoteRequestDto extends CreateQuoteRequestDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    declare customerCompanyId: string;
}

export class RejectQuoteRequestDto {
    @ApiProperty({ description: 'Почему клиент отказался' })
    @IsString()
    @IsNotEmpty({ message: 'Укажите причину отказа: без неё запись бесполезна' })
    reason: string;
}

/**
 * Фильтры списка.
 *
 * Объявлены все до одного намеренно: `forbidNonWhitelisted` отвергает
 * запрос целиком, если в строке пришёл незаявленный параметр. На заявках
 * этим уже обжигались — фильтры молча возвращали ошибку вместо списка.
 */
export class QuoteRequestsQueryDto extends PaginationQueryDto {
    @IsOptional()
    @IsEnum(QuoteRequestStatus, { message: 'Неизвестный статус запроса' })
    status?: QuoteRequestStatus;

    @IsOptional()
    @IsString()
    customerCompanyId?: string;

    @IsOptional()
    @IsString()
    originCityId?: string;

    @IsOptional()
    @IsString()
    destinationCityId?: string;

    @IsOptional()
    @IsString()
    search?: string;
}

/** Что показать менеджеру о прошлых запросах — до того, как он сохранил новый. */
export class QuoteMemoryQueryDto {
    @IsString()
    @IsNotEmpty({ message: 'Укажите клиента' })
    customerCompanyId: string;

    @IsOptional()
    @IsString()
    originCityName?: string;

    @IsOptional()
    @IsString()
    originCityId?: string;

    @IsOptional()
    @IsString()
    destinationCityName?: string;

    @IsOptional()
    @IsString()
    destinationCityId?: string;

    @IsOptional()
    @IsString()
    cargoType?: string;

    @IsOptional()
    @IsNumber()
    cargoWeight?: number;

    @IsOptional()
    @IsNumber()
    cargoVolume?: number;

    /** Не сравнивать запрос сам с собой при правке. */
    @IsOptional()
    @IsString()
    excludeId?: string;
}
