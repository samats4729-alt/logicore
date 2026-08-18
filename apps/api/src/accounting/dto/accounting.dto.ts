import { AccountKind, PaymentDirection, PaymentMethod } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateNested,
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

/** Доля платежа по одной заявке. */
export class PaymentOrderShareDto {
    @IsString()
    @IsNotEmpty()
    orderId!: string;

    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0.01)
    @Max(MAX_MONEY_AMOUNT)
    amount!: number;
}

export class CreatePaymentDto {
    /**
     * По каким заявкам разошёлся платёж.
     *
     * Заказчик присылает один перевод за два десятка рейсов: бухгалтер
     * отмечает их разом, а не заводит двадцать платежей. Вместе с `orderId`
     * не используется — иначе одна заявка была бы оплачена дважды.
     */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => PaymentOrderShareDto)
    orderShares?: PaymentOrderShareDto[];

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

    /**
     * Валюта платежа. Не указана — берётся валюта счёта, а без счёта тенге:
     * так обычные платежи работают ровно как раньше.
     */
    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z]{3}$/, { message: 'Валюта указывается кодом из трёх букв, например USD' })
    currency?: string;
}

export class UpdatePaymentDto {
    /**
     * Направление можно исправить, не удаляя платёж.
     *
     * Записать оплату не в ту сторону легко, а исправить было нечем:
     * поле в форме гасло, и оставалось удалить строку и завести заново.
     * Бухгалтер при этом теряет и дату проводки, и примечание, и связь с
     * выпиской — то есть чинит одну ошибку, заводя вторую.
     */
    @IsOptional()
    @IsEnum(PaymentDirection)
    direction?: PaymentDirection;

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

/**
 * Период и страница для журналов бухгалтерии.
 *
 * В 1С журнал всегда ограничен периодом — открыть «вообще всё» там нельзя.
 * У нас страницы грузили историю целиком, и на большой базе это единственный
 * запрос, который положит раздел.
 *
 * Совместимость: без `page` и `limit` метод отдаёт массив, как раньше, —
 * меняется только отбор по периоду, если его передали. Страница появляется
 * в ответе только тогда, когда её явно попросили.
 */
export class JournalQueryDto extends PaginationQueryDto {
    @IsOptional()
    @IsDateString()
    from?: string;

    @IsOptional()
    @IsDateString()
    to?: string;
}

/**
 * Возврат платежа (сторно).
 *
 * Сумма необязательна: без неё возвращается весь непогашенный остаток
 * платежа — самый частый случай. Дата тоже: возврат проводится сегодняшним
 * числом, а не задним числом исходного платежа.
 */
export class RefundPaymentDto {
    @IsOptional()
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0.01)
    @Max(MAX_MONEY_AMOUNT)
    amount?: number;

    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    note?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    accountId?: string;
}

/**
 * Новый счёт или касса.
 *
 * Валюта задаётся при создании и потом не меняется, пока по счёту не было
 * движений: объявить прошлые тенге долларами — значит выдумать остаток.
 */
export class CreateFinanceAccountDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name!: string;

    @IsEnum(AccountKind)
    kind!: AccountKind;

    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z]{3}$/, { message: 'Валюта указывается кодом из трёх букв, например USD' })
    currency?: string;

    @IsOptional()
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0)
    @Max(MAX_MONEY_AMOUNT)
    openingBalance?: number;

    @IsOptional()
    @IsDateString()
    openingDate?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    iban?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    bankName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    bankBic?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    kbe?: string;
}
