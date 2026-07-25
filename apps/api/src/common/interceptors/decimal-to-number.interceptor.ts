import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Денежные поля хранятся как DECIMAL и приходят из Prisma объектами
 * Prisma.Decimal. У них есть toJSON, который отдаёт СТРОКУ — то есть без
 * этого перехватчика веб получил бы `"1000"` вместо `1000` везде, где
 * ответ строится из строк Prisma напрямую (например, списки расходов и
 * поступлений).
 *
 * TypeScript такую утечку не ловит: сериализация в JSON нетипизирована.
 * Поэтому преобразование сделано одним общим правилом на границе HTTP —
 * так контракт с вебом остаётся прежним независимо от того, через какой
 * путь значение попало в ответ.
 *
 * Внутри сервисов расчёты по-прежнему ведутся в Decimal: перехватчик
 * трогает только то, что уже уходит наружу.
 */
@Injectable()
export class DecimalToNumberInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(map((data) => convert(data)));
    }
}

function convert(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined) return value;

    if (Prisma.Decimal.isDecimal(value)) {
        return (value as Prisma.Decimal).toNumber();
    }

    // Даты, буферы и потоки отдаём как есть — их сериализация уже корректна.
    if (typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
        return value;
    }

    // Защита от циклических ссылок: без неё ответ с обратной связью
    // «сущность → её коллекция → та же сущность» уронил бы процесс.
    if (seen.has(value as object)) return value;
    seen.add(value as object);

    if (Array.isArray(value)) {
        return value.map((item) => convert(item, seen));
    }

    // Только простые объекты: экземпляры классов (например, потоки файлов)
    // не разбираем, чтобы не потерять их поведение.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        result[key] = convert(item, seen);
    }
    return result;
}
