import { PaymentDirection, PaymentMethod } from '@prisma/client';
import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

const MAX_MONEY_AMOUNT = 1_000_000_000_000_000;

export class UpdateOrderFinanceDto {
    @IsOptional()
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0)
    @Max(MAX_MONEY_AMOUNT)
    customerPrice?: number;

    @IsOptional()
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0)
    @Max(MAX_MONEY_AMOUNT)
    driverCost?: number;

    @IsOptional()
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0)
    @Max(MAX_MONEY_AMOUNT)
    subForwarderPrice?: number;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    customerPaymentCondition?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    customerPaymentForm?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    driverPaymentCondition?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    driverPaymentForm?: string;

    @IsOptional()
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0)
    @Max(100)
    vatRate?: number;

    @IsOptional()
    @IsBoolean()
    hasVat?: boolean;

    @IsOptional()
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0)
    @Max(100)
    executorVatRate?: number;

    @IsOptional()
    @IsBoolean()
    executorHasVat?: boolean;
}

export class CreateManualEntryDto {
    @IsDateString()
    date!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    category!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    description!: string;

    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0.01)
    @Max(MAX_MONEY_AMOUNT)
    amount!: number;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    note?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    orderId?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    accountId?: string;
}

export class UpdateManualEntryDto {
    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    category?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0.01)
    @Max(MAX_MONEY_AMOUNT)
    amount?: number;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    note?: string;

    @IsOptional()
    @IsString()
    accountId?: string;
}

export class CreatePaymentDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    orderId?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    counterpartyId?: string;

    @IsEnum(PaymentDirection)
    direction!: PaymentDirection;

    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0.01)
    @Max(MAX_MONEY_AMOUNT)
    amount!: number;

    @IsDateString()
    date!: string;

    @IsOptional()
    @IsEnum(PaymentMethod)
    method?: PaymentMethod;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    note?: string;

    @IsOptional()
    @IsString()
    accountId?: string;

    @IsOptional()
    @IsString()
    categoryId?: string;
}

export class UpdatePaymentDto {
    @IsOptional()
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0.01)
    @Max(MAX_MONEY_AMOUNT)
    amount?: number;

    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsEnum(PaymentMethod)
    method?: PaymentMethod;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    note?: string;

    @IsOptional()
    @IsString()
    counterpartyId?: string;

    @IsOptional()
    @IsString()
    accountId?: string;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsString()
    orderId?: string;
}
