import { Type } from 'class-transformer';
import {
    AccountingDocumentDirection,
    AccountingDocumentStatus,
    AccountingDocumentType,
    AccountingVatCalculation,
    AccountingVatTreatment,
} from '@prisma/client';
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsDateString,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

const MONEY = /^\d{1,18}(\.\d{1,2})?$/;
const SIGNED_MONEY = /^-?\d{1,18}(\.\d{1,2})?$/;
const QUANTITY = /^\d{1,18}(\.\d{1,3})?$/;
const RATE = /^\d{1,3}(\.\d{1,2})?$/;

export class AccountingDocumentLineDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    serviceCode?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    description?: string;

    @IsOptional()
    @IsDateString()
    serviceDate?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    reportDetails?: string;

    @IsOptional()
    @Matches(QUANTITY)
    quantity?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(32)
    unit?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    unitCode?: string;

    @Matches(MONEY)
    unitPrice!: string;

    @IsOptional()
    @Matches(MONEY)
    discountAmount?: string;

    @IsOptional()
    @IsEnum(AccountingVatTreatment)
    vatTreatment?: AccountingVatTreatment;

    @IsOptional()
    @IsEnum(AccountingVatCalculation)
    vatCalculation?: AccountingVatCalculation;

    @IsOptional()
    @Matches(RATE)
    vatRate?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    orderId?: string;
}

export class AccountingReconciliationLineDto {
    @IsDateString()
    transactionDate!: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    sourceDocumentType?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    sourceDocumentNumber?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @Matches(MONEY)
    debit?: string;

    @IsOptional()
    @Matches(MONEY)
    credit?: string;
}

export class CreateAccountingDocumentDto {
    @IsEnum(AccountingDocumentType)
    type!: AccountingDocumentType;

    @IsEnum(AccountingDocumentDirection)
    direction!: AccountingDocumentDirection;

    @IsString()
    @IsNotEmpty()
    counterpartyId!: string;

    @IsDateString()
    documentDate!: string;

    @IsOptional()
    @IsDateString()
    operationDate?: string;

    @IsOptional()
    @IsDateString()
    dueDate?: string;

    @IsOptional()
    @IsDateString()
    reportPeriodFrom?: string;

    @IsOptional()
    @IsDateString()
    reportPeriodTo?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    contractId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    externalNumber?: string;

    @IsOptional()
    @IsDateString()
    externalDate?: string;

    @IsOptional()
    @Matches(/^[A-Z]{3}$/)
    currency?: string;

    @IsOptional()
    @Matches(SIGNED_MONEY)
    openingBalance?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    paymentPurposeCode?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    paymentTerms?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    customerMaterialsInfo?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    appendixInfo?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    note?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(500)
    @ValidateNested({ each: true })
    @Type(() => AccountingDocumentLineDto)
    lines?: AccountingDocumentLineDto[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(5000)
    @ValidateNested({ each: true })
    @Type(() => AccountingReconciliationLineDto)
    reconciliationLines?: AccountingReconciliationLineDto[];

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(500)
    @IsString({ each: true })
    orderIds?: string[];
}

export class GenerateReconciliationDraftDto {
    @IsString()
    @IsNotEmpty()
    counterpartyId!: string;

    @IsDateString()
    reportPeriodFrom!: string;

    @IsDateString()
    reportPeriodTo!: string;

    @IsOptional()
    @IsDateString()
    documentDate?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    note?: string;
}

export class CancelAccountingDocumentDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    reason!: string;
}

export class AccountingDocumentListQueryDto {
    @IsOptional()
    @IsEnum(AccountingDocumentType)
    type?: AccountingDocumentType;

    @IsOptional()
    @IsEnum(AccountingDocumentDirection)
    direction?: AccountingDocumentDirection;

    @IsOptional()
    @IsEnum(AccountingDocumentStatus)
    status?: AccountingDocumentStatus;

    @IsOptional()
    @IsString()
    counterpartyId?: string;

    @IsOptional()
    @IsDateString()
    from?: string;

    @IsOptional()
    @IsDateString()
    to?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}
