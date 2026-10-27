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

/** Водитель просит на топливо или предоплату по рейсу (Q17). */
export class AdvanceRequestDto {
    @ApiProperty({ enum: ['FUEL', 'ADVANCE'] })
    @IsIn(['FUEL', 'ADVANCE'], { message: 'Выберите: топливо или предоплата' })
    kind: 'FUEL' | 'ADVANCE';

    @ApiProperty({ description: 'Сумма, ₸' })
    @IsNotEmpty({ message: 'Впишите сумму' })
    amount: string | number;

    @ApiProperty({ required: false })
    @IsOptional() @IsString() @MaxLength(300)
    comment?: string;
}

/** Решение парка по запросу водителя (Q17). */
export class AdvanceDecisionDto {
    @ApiProperty({ enum: ['APPROVE', 'CHECK', 'REUPLOAD', 'REJECT'] })
    @IsIn(['APPROVE', 'CHECK', 'REUPLOAD', 'REJECT'], { message: 'Неизвестное решение' })
    action: 'APPROVE' | 'CHECK' | 'REUPLOAD' | 'REJECT';

    @ApiProperty({ required: false, description: 'Что проверяют, что перезагрузить, почему отказ' })
    @IsOptional() @IsString() @MaxLength(500)
    note?: string;

    @ApiProperty({ required: false, description: 'Сколько выдать, если не столько, сколько просили' })
    @IsOptional()
    amount?: string | number;

    @ApiProperty({ required: false, enum: ['STATION', 'TO_DRIVER'] })
    @IsOptional() @IsIn(['STATION', 'TO_DRIVER'])
    method?: 'STATION' | 'TO_DRIVER';
}

/**
 * Парк выдал по рейсу сам: топливо (оплатил на заправке или перевёл) или
 * предоплату водителю (шеф, 27.10.2026). Без вида — топливо, как раньше.
 */
export class FuelIssueDto {
    @ApiProperty({ required: false, enum: ['FUEL', 'ADVANCE'] })
    @IsOptional()
    @IsIn(['FUEL', 'ADVANCE'], { message: 'Выберите: топливо или предоплата' })
    kind?: 'FUEL' | 'ADVANCE';

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
