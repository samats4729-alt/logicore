import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Служебные поля компании, которые наружу не уходят никогда.
 *
 * - `parkInviteCode` — код, по которому водитель прикрепляется к парку.
 *   Парку он отдаётся отдельно (`inviteCode` в «Управлении парком»).
 * - `stampImage`, `signatureImage` — пути к файлам печати и подписи. Сами
 *   картинки компания получает своими запросами (`/company/stamp`), а в
 *   документы их подставляет сервер.
 *
 * Строку компании целиком отдают десятки мест: карточка заявки (перевозчик
 * и заказчик рейса), партнёры, договоры. Закрывать каждое по отдельности —
 * значит однажды забыть новое; на этом уже ловили код приглашения парка и
 * печать в карточке чужой заявки (владелец, 25.10.2026: сохранять
 * разграничение прав между компаниями). Поэтому правило — одно, на выходе.
 */
export const PRIVATE_COMPANY_FIELDS = ['parkInviteCode', 'stampImage', 'signatureImage'] as const;

@Injectable()
export class PrivateCompanyFieldsInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(map((data) => strip(data)));
    }
}

export function strip(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined || typeof value !== 'object') return value;
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    if (seen.has(value)) return value;
    seen.add(value);

    if (Array.isArray(value)) return value.map((item) => strip(item, seen));

    // Только простые объекты: потоки файлов и прочие экземпляры классов — как есть.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if ((PRIVATE_COMPANY_FIELDS as readonly string[]).includes(key)) continue;
        result[key] = strip(item, seen);
    }
    return result;
}
