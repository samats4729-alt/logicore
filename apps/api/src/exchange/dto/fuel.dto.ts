import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Чек на топливо от водителя: фото (файлом) и сумма из чека. Сумма приходит
 * из формы с файлом строкой — числом её делает сервис, с понятной ошибкой.
 */
export class FuelReceiptDto {
    @ApiProperty({ description: 'Сумма по чеку, ₸' })
    @IsString()
    @IsNotEmpty({ message: 'Впишите сумму из чека' })
    @MaxLength(20)
    amount: string;
}

/** Парк дал денег на топливо: оплатил на заправке сам или перевёл водителю. */
export class FuelIssueDto {
    @ApiProperty({ description: 'Сумма, ₸' })
    @IsNumber({}, { message: 'Сумма — числом' })
    @Min(1, { message: 'Сумма должна быть больше нуля' })
    amount: number;

    @ApiProperty({ enum: ['STATION', 'TO_DRIVER'] })
    @IsIn(['STATION', 'TO_DRIVER'], { message: 'Укажите: оплатили на заправке или перевели водителю' })
    method: 'STATION' | 'TO_DRIVER';

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    note?: string;
}

/** Решение парка по чеку: принять (можно поправить сумму) или отклонить с причиной. */
export class FuelDecisionDto {
    @ApiProperty()
    @IsBoolean()
    accept: boolean;

    @ApiProperty({ required: false, description: 'Сумма по чеку, если водитель вписал неверно' })
    @IsOptional()
    @IsNumber({}, { message: 'Сумма — числом' })
    @Min(1, { message: 'Сумма должна быть больше нуля' })
    amount?: number;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(300)
    reason?: string;
}

/** Комиссия LogiCore с рейса водителя парка, % — меняет владелец платформы. */
export class PlatformFeeDto {
    @ApiProperty()
    @IsNumber({}, { message: 'Комиссия — числом' })
    @Min(0)
    platformPct: number;
}
