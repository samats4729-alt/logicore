import { All, Controller, Header, HttpCode, HttpStatus, Logger, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CardPaymentService } from './card-payment.service';
import { FreedomPayService } from './freedompay.service';

/**
 * Дверь, в которую стучится платёжная система.
 *
 * Без входа по логину — стучится сюда сервер FreedomPay, а не человек.
 * Вместо логина каждое сообщение подписано секретным ключом магазина, и
 * подпись проверяется первым же действием: без неё «оплачено» мог бы
 * прислать кто угодно, кто узнал адрес.
 *
 * Метод не ограничен намеренно (`@All`): по умолчанию шлюз шлёт POST, но
 * способ вызова задаётся в кабинете магазина, и переключённый там на GET
 * обработчик молча перестал бы получать результаты оплаты. Цена ошибки
 * несимметрична: деньги списаны, подписка не продлена.
 *
 * Ответ всегда XML и всегда 200. Другой код шлюз считает сбоем и присылает
 * то же сообщение снова — это нам и нужно, но только когда мы действительно
 * не справились: тогда внутри XML стоит `pg_status=error`.
 */
@ApiExcludeController()
@Controller('billing/freedompay')
export class FreedomPayController {
    private readonly logger = new Logger(FreedomPayController.name);

    constructor(
        private readonly payments: CardPaymentService,
        private readonly freedompay: FreedomPayService,
    ) { }

    /** «Этот заказ ещё можно оплатить?» — до списания денег. */
    @All('check')
    @Throttle({ default: { limit: 120, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @Header('Content-Type', 'application/xml; charset=utf-8')
    async check(@Req() req: Request): Promise<string> {
        return this.payments.handleCheck(this.freedompay.checkUrl(), параметры(req));
    }

    /** Результат оплаты. Единственное «оплачено», которому мы верим. */
    @All('result')
    @Throttle({ default: { limit: 120, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @Header('Content-Type', 'application/xml; charset=utf-8')
    async result(@Req() req: Request): Promise<string> {
        return this.payments.handleResult(this.freedompay.resultUrl(), параметры(req));
    }
}

/**
 * Тело запроса как есть.
 *
 * Через `@Req`, а не `@Body`, намеренно: подпись считается по всем полям,
 * которые прислали, включая незнакомые нам. Глобальная проверка входящих
 * данных настроена срезать всё лишнее (`whitelist`), и стоит однажды
 * появиться здесь классу-описанию — подпись перестанет сходиться, а причина
 * будет не видна.
 */
function параметры(req: Request): Record<string, string> {
    const тело = (req.body ?? {}) as Record<string, unknown>;
    const источник = Object.keys(тело).length > 0
        ? тело
        : (req.query ?? {}) as Record<string, unknown>;

    const результат: Record<string, string> = {};
    for (const [имя, значение] of Object.entries(источник)) {
        // Повтор одного имени приходит массивом. Такого в протоколе нет, но
        // и падать на нём незачем: подпись всё равно не сойдётся.
        результат[имя] = Array.isArray(значение) ? String(значение[0]) : String(значение);
    }
    return результат;
}
