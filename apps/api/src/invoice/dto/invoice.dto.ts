import { InvoiceStatus, InvoiceType } from '@prisma/client';
import {
    ArrayMaxSize,
    ArrayNotEmpty,
    ArrayUnique,
    IsArray,
    IsBooleanString,
    IsDateString,
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class CreateInvoiceDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    invoiceNumber: string;

    @IsEnum(InvoiceType)
    type: InvoiceType;

    @IsDateString()
    date: string;

    @IsOptional()
    @IsDateString()
    dueDate?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    issuerId: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    recipientId: string;

    @IsArray()
    @ArrayNotEmpty()
    @ArrayUnique()
    @ArrayMaxSize(200)
    @IsString({ each: true })
    orderIds: string[];

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    note?: string;
}

export class UpdateInvoiceStatusDto {
    @IsEnum(InvoiceStatus)
    status: InvoiceStatus;
}

export class SendInvoiceEmailDto {
    @IsEmail()
    @MaxLength(320)
    email: string;
}

export class GetInvoicesQueryDto {
    @IsOptional()
    @IsEnum(InvoiceType)
    type?: InvoiceType;

    @IsOptional()
    @IsEnum(InvoiceStatus)
    status?: InvoiceStatus;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    counterpartyId?: string;
}

export class GetUninvoicedOrdersQueryDto {
    @IsEnum(InvoiceType)
    type: InvoiceType;

    @IsString()
    @IsNotEmpty()
    counterpartyId: string;

    @IsOptional()
    @IsBooleanString()
    includeInProgress?: string;
}
