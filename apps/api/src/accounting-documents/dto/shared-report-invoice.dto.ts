import { Transform, Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayNotEmpty,
    IsArray,
    IsDateString,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

/**
 * Сумма по сделке со слов контрагента.
 *
 * Наша цифра при этом не меняется: счёт приходит черновиком, расхождение
 * видно бухгалтеру, и решает он. До этого заявленная сумма — требование
 * стороны, а не факт.
 */
export class SharedReportInvoiceAmountDto {
    @IsString()
    @IsNotEmpty()
    orderId!: string;

    /** Строкой: с пробелами и запятой, как человек её печатает. */
    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    amount!: string;
}

/**
 * Счёт, который контрагент выставляет по ссылке на отчёт.
 *
 * Эндпоинт публичный и без аутентификации, поэтому границы полей заданы
 * здесь, а не только в сервисе: без DTO-класса глобальный ValidationPipe
 * пропустил бы и текст любой длины, и лишние поля.
 */
export class SharedReportInvoiceDto {
    @IsArray()
    @ArrayNotEmpty({ message: 'Отметьте хотя бы одну сделку' })
    @ArrayMaxSize(200, { message: 'В один счёт помещается не больше 200 сделок' })
    @IsString({ each: true })
    orderIds!: string[];

    /**
     * Суммы, которые контрагент назвал сам.
     *
     * Необязательно и не по каждой сделке: где не назвал — берётся наша.
     */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => SharedReportInvoiceAmountDto)
    amounts?: SharedReportInvoiceAmountDto[];

    /** Номер счёта в нумерации контрагента — наш номер выдаётся отдельно. */
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    externalNumber?: string;

    @IsOptional()
    @IsDateString()
    externalDate?: string;

    @IsOptional()
    @IsDateString()
    dueDate?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    note?: string;
}
