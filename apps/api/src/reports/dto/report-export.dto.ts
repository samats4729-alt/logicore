import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

export class ReportColumnDto {
    @ApiProperty({ description: 'Ключ поля в строке' })
    @IsString()
    @MaxLength(60)
    key!: string;

    @ApiProperty({ description: 'Заголовок колонки в файле' })
    @IsString()
    @MaxLength(120)
    title!: string;

    @ApiProperty({ description: 'Числовая колонка — Excel сможет её сложить', required: false })
    @IsBoolean()
    @IsOptional()
    numeric?: boolean;
}

export class ExportReportDto {
    @ApiProperty({ description: 'Название отчёта для печатной шапки' })
    @IsString()
    @MaxLength(120)
    title!: string;

    @ApiProperty({ description: 'Начало периода', required: false })
    @IsDateString()
    @IsOptional()
    periodFrom?: string;

    @ApiProperty({ description: 'Конец периода', required: false })
    @IsDateString()
    @IsOptional()
    periodTo?: string;

    @ApiProperty({ type: [ReportColumnDto], description: 'Колонки в порядке вывода' })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(30)
    @ValidateNested({ each: true })
    @Type(() => ReportColumnDto)
    columns!: ReportColumnDto[];

    @ApiProperty({ description: 'Строки отчёта — то же, что видно на экране' })
    @IsArray()
    @ArrayMaxSize(5000)
    rows!: Record<string, unknown>[];

    @ApiProperty({ description: 'Итоговая строка по ключам колонок', required: false })
    @IsObject()
    @IsOptional()
    totals?: Record<string, unknown>;
}
