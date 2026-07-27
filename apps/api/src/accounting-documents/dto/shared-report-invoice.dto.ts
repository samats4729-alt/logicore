import { Transform } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayNotEmpty,
    IsArray,
    IsDateString,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

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
