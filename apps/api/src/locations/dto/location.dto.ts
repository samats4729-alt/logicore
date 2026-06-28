import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLocationDto {
    @ApiProperty({ description: 'Название точки' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Адрес' })
    @IsString()
    address: string;

    @ApiProperty({ description: 'Широта' })
    @IsNumber()
    latitude: number;

    @ApiProperty({ description: 'Долгота' })
    @IsNumber()
    longitude: number;

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

    @ApiPropertyOptional({ description: 'Широта' })
    @IsOptional()
    @IsNumber()
    latitude?: number;

    @ApiPropertyOptional({ description: 'Долгота' })
    @IsOptional()
    @IsNumber()
    longitude?: number;

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

    @ApiPropertyOptional({ description: 'ID компании' })
    @IsOptional()
    @IsString()
    companyId?: string;

    @ApiPropertyOptional({ description: 'Email-адреса (через запятую)' })
    @IsOptional()
    @IsString()
    emails?: string;
}
