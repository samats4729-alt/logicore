import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Чек, который контрагент присылает по ссылке на отчёт.
 *
 * Поля приходят из multipart-формы, то есть строками. Сумму и дату здесь
 * не разбираем — это делает сервис, чтобы сообщение об ошибке было одно и
 * то же независимо от того, откуда пришёл запрос. Статуса и рецензента в
 * DTO нет намеренно: их назначает только наша сторона.
 */
export class SubmitPaymentProofDto {
    @IsString()
    @MaxLength(50)
    orderId!: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    claimedAmount?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    claimedDate?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    note?: string;
}
