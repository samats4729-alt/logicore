import { Transform, Type } from 'class-transformer';
import {
    AccountingDocumentDirection,
    AccountingDocumentStatus,
    AccountingDocumentType,
    AccountingVatCalculation,
    AccountingVatTreatment,
    PaymentDirection,
} from '@prisma/client';
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
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

/**
 * Потолок строк в печатном реестре. Реестр — документ для подшивки, а не
 * выгрузка: за разумный период столько счетов и не бывает, а печатать
 * неограниченный список значит уронить сервер на одном запросе.
 */
export const REGISTRY_MAX_ROWS = 500;

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

    /**
     * Расчётный счёт организации, с которого выставляется документ.
     * Не указан — берётся счёт по умолчанию (kind=BANK, isDefault).
     */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    bankAccountId?: string;

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

/**
 * Правка черновика из карточки документа («Записать» в 1С).
 *
 * Тип, направление и контрагент здесь не принимаются намеренно: от них
 * зависит номер документа и снимки сторон. Ошибся в них — черновик
 * удаляется и создаётся заново, а не переписывается задним числом.
 *
 * Поле, которого нет в запросе, остаётся прежним; `null` в необязательной
 * дате или примечании очищает значение.
 */
export class UpdateAccountingDocumentDto {
    @IsOptional()
    @IsDateString()
    documentDate?: string;

    @IsOptional()
    @IsDateString()
    operationDate?: string | null;

    @IsOptional()
    @IsDateString()
    dueDate?: string | null;

    /** `null` — вернуться к счёту организации по умолчанию. */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    bankAccountId?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    externalNumber?: string | null;

    @IsOptional()
    @IsDateString()
    externalDate?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    paymentTerms?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    note?: string | null;

    /** Массив заменяет строки документа целиком, итоги пересчитываются. */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(500)
    @ValidateNested({ each: true })
    @Type(() => AccountingDocumentLineDto)
    lines?: AccountingDocumentLineDto[];

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

/** Параметры кнопки «Подобрать по заявкам» в формах счёта и акта. */
export class BillableOrdersQueryDto {
    /** Счёт (по умолчанию) или акт выполненных работ. */
    @IsOptional()
    @IsEnum(AccountingDocumentType)
    type?: AccountingDocumentType;

    @IsEnum(AccountingDocumentDirection)
    direction!: AccountingDocumentDirection;

    @IsString()
    @IsNotEmpty()
    counterpartyId!: string;

    /**
     * Добавить рейсы «в работе» — счёт на аванс до завершения перевозки.
     * Для акта не действует: услуга ещё не оказана, актировать нечего.
     */
    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    includeInProgress?: boolean;
}

export class SuggestAllocationQueryDto {
    @IsString()
    @IsNotEmpty()
    counterpartyId!: string;

    @IsEnum(PaymentDirection)
    direction!: PaymentDirection;

    @Matches(MONEY)
    amount!: string;
}

export class AllocationItemDto {
    @IsString()
    @IsNotEmpty()
    documentId!: string;

    @Matches(MONEY)
    amount!: string;
}

/** Разнесение платежа по счетам. Пустой массив снимает разнесение. */
export class ApplyAllocationsDto {
    @IsArray()
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => AllocationItemDto)
    allocations!: AllocationItemDto[];
}

export class CancelAccountingDocumentDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    reason!: string;
}

export class AccountingDocumentListQueryDto {
    /**
     * Организация журнала. Пусто — активная компания сессии. Право на чужую
     * организацию проверяется отдельно: у пользователя должна быть роль
     * бухгалтерии именно в ней.
     */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    companyId?: string;

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

    /** Документы, связанные с конкретной заявкой — цепочка документов рейса. */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    orderId?: string;

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

/**
 * «Печать → Реестр документов» в 1С: печатная форма самого журнала за период.
 *
 * Фильтры повторяют список — печатается ровно то, что бухгалтер видит на
 * экране. Отдельно можно передать `ids`: тогда в реестр попадают только
 * отмеченные строки (массовое действие «печать выбранных»).
 */
export class AccountingDocumentRegistryQueryDto {
    /** Организация журнала — см. AccountingDocumentListQueryDto. */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    companyId?: string;

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

    /**
     * Отмеченные строки журнала. Приходят повторяющимся query-параметром
     * (`ids=a&ids=b`), поэтому одиночное значение приводится к массиву.
     */
    @IsOptional()
    @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(REGISTRY_MAX_ROWS)
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    ids?: string[];
}
