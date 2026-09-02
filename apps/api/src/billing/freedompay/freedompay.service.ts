import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    PaymentParams,
    randomSalt,
    scriptNameFromUrl,
    signParams,
    verifySignature,
    безПустых,
} from './freedompay.signature';
import { buildXmlResponse, parseFlatXml } from './freedompay.xml';

/**
 * Разговор с платёжной системой FreedomPay.
 *
 * Здесь только сам разговор: собрать запрос, подписать, отправить, разобрать
 * ответ. Что делать с деньгами — в `CardPaymentService`: тот знает про
 * подписки и базу, этот не знает ничего, кроме протокола.
 *
 * Порядок оплаты со стороны платформы:
 *
 *   1. Мы просим ссылку — `init_payment.php`. В запросе номер нашего платежа
 *      (`pg_order_id`), сумма и три адреса: куда вернуть человека при удаче,
 *      куда при отказе и куда сервер платёжной системы пришлёт результат.
 *   2. Человек вводит карту на стороне банка. У нас номер карты не бывает
 *      никогда — ни в базе, ни в журнале.
 *   3. Сервер платёжной системы стучится на `pg_result_url` и приносит
 *      подписанное «оплачено» или «отказ». Это единственный источник правды:
 *      возврат человека в браузере ничего не доказывает — на этот адрес он
 *      может зайти и сам.
 *
 * Настройки — из окружения, потому что секретный ключ в коде не хранится:
 *
 *   FREEDOMPAY_MERCHANT_ID   номер магазина из кабинета FreedomPay
 *   FREEDOMPAY_SECRET_KEY    секретный ключ для API (не для скриптов!)
 *   FREEDOMPAY_API_URL       адрес шлюза, по умолчанию боевой
 *   FREEDOMPAY_TESTING_MODE  «1», пока магазин в тестовом режиме
 *   API_PUBLIC_URL           наш собственный адрес снаружи — на него шлюз
 *                            присылает результат, и localhost тут не годится
 */

/** Сколько живёт выданная ссылка на оплату. Час — с запасом на «схожу за картой». */
const LIFETIME_SECONDS = 3600;

/** Сколько ждём ответа шлюза, прежде чем сказать человеку «не получилось». */
const REQUEST_TIMEOUT_MS = 20_000;

export interface FreedomPayReady {
    merchantId: string;
    secretKey: string;
    apiUrl: string;
    testingMode: boolean;
    apiPublicUrl: string;
}

export interface InitPaymentInput {
    /** Наш номер платежа — он же номер заказа для платёжной системы. */
    paymentId: string;
    amount: number;
    currency: string;
    description: string;
    /** Куда вернуть человека в браузере. */
    successUrl: string;
    failureUrl: string;
    userId?: string | null;
    email?: string | null;
}

export interface InitPaymentResult {
    providerPaymentId: string | null;
    redirectUrl: string;
}

@Injectable()
export class FreedomPayService {
    private readonly logger = new Logger(FreedomPayService.name);

    constructor(private readonly config: ConfigService) { }

    /**
     * Настройки, если оплата картой вообще настроена.
     *
     * Возвращает `null`, когда чего-то не хватает: кнопку «Оплатить картой»
     * в кабинете тогда не показываем совсем. Показать её и упасть на нажатии
     * хуже, чем не показать: человек уже решил заплатить.
     */
    настройки(): FreedomPayReady | null {
        const merchantId = (this.config.get<string>('FREEDOMPAY_MERCHANT_ID') || '').trim();
        const secretKey = (this.config.get<string>('FREEDOMPAY_SECRET_KEY') || '').trim();
        // Свой адрес снаружи обязателен: на него платёжная система присылает
        // результат оплаты. Без него оплата прошла бы, а подписка — нет.
        const apiPublicUrl = (this.config.get<string>('API_PUBLIC_URL') || '').trim().replace(/\/+$/, '');
        if (!merchantId || !secretKey || !apiPublicUrl) return null;

        return {
            merchantId,
            secretKey,
            apiUrl: (this.config.get<string>('FREEDOMPAY_API_URL') || 'https://api.freedompay.money')
                .trim()
                .replace(/\/+$/, ''),
            testingMode: (this.config.get<string>('FREEDOMPAY_TESTING_MODE') || '').trim() === '1',
            apiPublicUrl,
        };
    }

    готов(): boolean {
        return this.настройки() !== null;
    }

    /**
     * Что видно владельцу платформы: настроена оплата или нет, и если нет —
     * чего именно не хватает.
     *
     * Без этого настройка идёт вслепую. Переменные задаются в панели
     * хостинга, а платформа на нехватку отвечает единственным способом —
     * не показывает кнопку. Отличить «не задал ключ» от «не задал адрес» по
     * отсутствию кнопки нельзя, и человек перебирает наугад.
     *
     * Секретный ключ отсюда не отдаётся ни при каких условиях — только сам
     * факт, задан он или нет. Всё остальное (номер магазина, адреса) не
     * секрет: номер уходит в каждом запросе, адреса и так наши собственные.
     */
    диагностика() {
        const merchantId = (this.config.get<string>('FREEDOMPAY_MERCHANT_ID') || '').trim();
        const secretKey = (this.config.get<string>('FREEDOMPAY_SECRET_KEY') || '').trim();
        const apiPublicUrl = (this.config.get<string>('API_PUBLIC_URL') || '').trim().replace(/\/+$/, '');

        const нехватает: string[] = [];
        if (!merchantId) нехватает.push('FREEDOMPAY_MERCHANT_ID');
        if (!secretKey) нехватает.push('FREEDOMPAY_SECRET_KEY');
        if (!apiPublicUrl) нехватает.push('API_PUBLIC_URL');

        const настройки = this.настройки();
        return {
            ready: настройки !== null,
            missing: нехватает,
            merchantId: merchantId || null,
            /** Только факт: сам ключ наружу не выходит. */
            secretKeySet: secretKey.length > 0,
            apiUrl: настройки?.apiUrl ?? null,
            testingMode: настройки?.testingMode ?? false,
            /**
             * Адрес, который уйдёт в платёжную систему. Показан намеренно:
             * ошибка именно в нём самая дорогая и самая незаметная — деньги
             * спишутся, а подтверждение к нам не придёт.
             */
            resultUrl: настройки ? this.resultUrl() : null,
            /** Куда вернётся человек из банка. */
            frontendUrl: (this.config.get<string>('FRONTEND_URL') || '').trim().replace(/\/+$/, '') || null,
        };
    }

    /** Адрес, на который платёжная система присылает результат оплаты. */
    resultUrl(): string {
        return `${this.настройки()?.apiPublicUrl ?? ''}/billing/freedompay/result`;
    }

    /** Адрес предварительной проверки: «этот заказ ещё можно оплатить?». */
    checkUrl(): string {
        return `${this.настройки()?.apiPublicUrl ?? ''}/billing/freedompay/check`;
    }

    /**
     * Попросить ссылку на оплату.
     *
     * Бросает с человеческим текстом: его увидит тот, кто нажал кнопку.
     */
    async initPayment(input: InitPaymentInput): Promise<InitPaymentResult> {
        const настройки = this.настройки();
        if (!настройки) throw new Error('Оплата картой не настроена');

        const параметры = безПустых({
            pg_merchant_id: настройки.merchantId,
            pg_order_id: input.paymentId,
            // Сумма целым числом тенге: копеек в наших ценах нет, а
            // «15000.00» и «15000» подписываются по-разному, и сверять потом
            // придётся то, что реально ушло.
            pg_amount: Math.round(input.amount),
            pg_currency: input.currency,
            pg_description: input.description.slice(0, 200),
            pg_salt: randomSalt(),
            pg_lifetime: LIFETIME_SECONDS,
            pg_result_url: this.resultUrl(),
            pg_check_url: this.checkUrl(),
            pg_success_url: input.successUrl,
            pg_failure_url: input.failureUrl,
            pg_language: 'ru',
            pg_user_id: input.userId ?? undefined,
            pg_user_contact_email: input.email ?? undefined,
            // Тестовый режим передаётся, только пока он есть: на боевом
            // магазине лишний `pg_testing_mode=0` ничего не меняет, но и
            // отправлять его незачем.
            pg_testing_mode: настройки.testingMode ? 1 : undefined,
        });

        const scriptName = 'init_payment.php';
        параметры.pg_sig = signParams(scriptName, параметры, настройки.secretKey);

        const ответ = await this.post(`${настройки.apiUrl}/${scriptName}`, параметры);

        if (ответ.pg_status !== 'ok') {
            const причина = ответ.pg_error_description || ответ.pg_error_code || 'ответ без объяснения';
            this.logger.error(
                `FreedomPay отказал в ссылке на оплату ${input.paymentId}: ${причина}`,
            );
            throw new Error(`Платёжная система отказала: ${причина}`);
        }
        if (!ответ.pg_redirect_url) {
            throw new Error('Платёжная система не прислала адрес формы оплаты');
        }

        return {
            providerPaymentId: ответ.pg_payment_id ?? null,
            redirectUrl: ответ.pg_redirect_url,
        };
    }

    /**
     * Подписано ли входящее сообщение нашим ключом.
     *
     * `url` — путь, на который пришёл запрос: имя скрипта в подписи берётся
     * из него, и для `/result` с `/check` подписи разные.
     */
    подписьВерна(url: string, тело: PaymentParams): boolean {
        const настройки = this.настройки();
        if (!настройки) return false;
        return verifySignature(scriptNameFromUrl(url), тело, настройки.secretKey);
    }

    /**
     * Подписанный ответ платёжной системе.
     *
     * Ответ тоже подписывается — по нему шлюз убеждается, что говорит с нами,
     * а не с кем-то, кто перехватил адрес.
     */
    ответ(url: string, поля: Record<string, string>): string {
        const настройки = this.настройки();
        const scriptName = scriptNameFromUrl(url);
        const параметры: Record<string, string> = { pg_salt: randomSalt(), ...поля };
        параметры.pg_sig = настройки
            ? signParams(scriptName, параметры, настройки.secretKey)
            : '';
        return buildXmlResponse(параметры);
    }

    private async post(url: string, params: Record<string, string>): Promise<Record<string, string>> {
        const прерыватель = new AbortController();
        const таймер = setTimeout(() => прерыватель.abort(), REQUEST_TIMEOUT_MS);
        try {
            const ответ = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: new URLSearchParams(params).toString(),
                signal: прерыватель.signal,
            });
            const текст = await ответ.text();
            if (!ответ.ok) {
                this.logger.error(`FreedomPay ответил ${ответ.status}: ${текст.slice(0, 300)}`);
                throw new Error(`Платёжная система недоступна (${ответ.status})`);
            }
            return parseFlatXml(текст);
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                throw new Error('Платёжная система не ответила вовремя');
            }
            throw error;
        } finally {
            clearTimeout(таймер);
        }
    }
}
