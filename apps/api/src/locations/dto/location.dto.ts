import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLocationDto {
    @ApiProperty({ description: 'Название точки' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ description: 'Адрес одной строкой. Если не прислали — собирается из частей' })
    @IsOptional()
    @IsString()
    address?: string;

    /* Координаты необязательны: при недоступном геокодере взять их неоткуда,
       а завести адрес всё равно надо. */
    @ApiPropertyOptional({ description: 'Широта' })
    @IsOptional()
    @IsNumber()
    latitude?: number | null;

    @ApiPropertyOptional({ description: 'Долгота' })
    @IsOptional()
    @IsNumber()
    longitude?: number | null;

    @ApiPropertyOptional({ description: 'Точку поставил человек — дозапись её не трогает' })
    @IsOptional()
    @IsBoolean()
    coordinatesManual?: boolean;

    @ApiPropertyOptional({ description: 'Страна' })
    @IsOptional()
    @IsString()
    country?: string;

    @ApiPropertyOptional({ description: 'Область' })
    @IsOptional()
    @IsString()
    region?: string;

    @ApiPropertyOptional({ description: 'Улица' })
    @IsOptional()
    @IsString()
    street?: string;

    @ApiPropertyOptional({ description: 'Дом' })
    @IsOptional()
    @IsString()
    house?: string;

    @ApiPropertyOptional({ description: 'Контактное лицо' })
    @IsOptional()
    @IsString()
    contactName?: string;

    @ApiPropertyOptional({ description: 'Контактный телефон' })
    @IsOptional()
    @IsString()
    contactPhone?: string;

    @ApiPropertyOptional({ description: 'Заметки' })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiPropertyOptional({ description: 'Город' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional({ description: 'ID города из справочника' })
    @IsOptional()
    @IsString()
    cityId?: string;

    @ApiPropertyOptional({ description: 'ID компании' })
    @IsOptional()
    @IsString()
    companyId?: string;

    @ApiPropertyOptional({ description: 'Email-адреса (через запятую)' })
    @IsOptional()
    @IsString()
    emails?: string;
}

export class UpdateLocationDto {
    @ApiPropertyOptional({ description: 'Название точки' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'Адрес' })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ description: 'Широта. Пустая — точку убрали' })
    @IsOptional()
    @IsNumber()
    latitude?: number | null;

    @ApiPropertyOptional({ description: 'Долгота. Пустая — точку убрали' })
    @IsOptional()
    @IsNumber()
    longitude?: number | null;

    @ApiPropertyOptional({ description: 'Точку поставил человек — дозапись её не трогает' })
    @IsOptional()
    @IsBoolean()
    coordinatesManual?: boolean;

    @ApiPropertyOptional({ description: 'Страна' })
    @IsOptional()
    @IsString()
    country?: string | null;

    @ApiPropertyOptional({ description: 'Область' })
    @IsOptional()
    @IsString()
    region?: string | null;

    @ApiPropertyOptional({ description: 'Улица' })
    @IsOptional()
    @IsString()
    street?: string | null;

    @ApiPropertyOptional({ description: 'Дом' })
    @IsOptional()
    @IsString()
    house?: string | null;

    @ApiPropertyOptional({ description: 'Контактное лицо' })
    @IsOptional()
    @IsString()
    contactName?: string;

    @ApiPropertyOptional({ description: 'Контактный телефон' })
    @IsOptional()
    @IsString()
    contactPhone?: string;

    @ApiPropertyOptional({ description: 'Заметки' })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiPropertyOptional({ description: 'Город' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional({ description: 'ID города из справочника' })
    @IsOptional()
    @IsString()
    cityId?: string | null;

    @ApiPropertyOptional({ description: 'ID компании' })
    @IsOptional()
    @IsString()
    companyId?: string;

    @ApiPropertyOptional({ description: 'Email-адреса (через запятую)' })
    @IsOptional()
    @IsString()
    emails?: string;
}
