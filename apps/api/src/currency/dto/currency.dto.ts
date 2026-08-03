import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';

export class RatesImportDto {
    @ApiProperty({ required: false, example: '2026-08-03' })
    @IsOptional()
    @IsISO8601()
    date?: string;
}

export class RatesBackfillDto {
    @ApiProperty({ example: '2026-07-01' })
    @IsISO8601()
    from: string;

    @ApiProperty({ example: '2026-07-31' })
    @IsISO8601()
    to: string;
}

export class ManualRateDto {
    @ApiProperty({ example: 'TMT' })
    @IsString()
    @Length(3, 3)
    code: string;

    @ApiProperty({ example: '2026-08-03' })
    @IsISO8601()
    date: string;

    /** Тенге за одну единицу валюты. */
    @ApiProperty({ example: 135.5 })
    @IsNumber()
    @Min(0.000001)
    rate: number;

    @ApiProperty({ required: false, example: 'Курс по договору с клиентом' })
    @IsOptional()
    @IsString()
    @MaxLength(300)
    note?: string;
}
