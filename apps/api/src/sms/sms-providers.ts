/**
 * Куда уходит СМС с кодом (решение владельца 25.10.2026, вопрос 26: СМС —
 * только для регистрации и входа; платный сервис подключается после
 * согласования расходов).
 *
 * Сервис выбирается переменной `SMS_PROVIDER`:
 *  - пусто — СМС выключены: вход и регистрация по номеру и паролю, как раньше;
 *  - `log` — код пишется в журнал сервера, никуда не отправляется. Только для
 *    стенда разработчика: на рабочем сервере не включается;
 *  - `mobizon` — Mobizon (mobizon.kz), ключ в `MOBIZON_API_KEY`.
 *
 * Модуль не ходит в базу: на вход — номер и текст, на выход — ушло или нет.
 */

export interface SmsProvider {
    readonly name: string;
    /** Отправить. Не ушло — исключение с текстом для журнала, не для человека. */
    send(phone: string, text: string): Promise<void>;
}

/** Стенд разработчика: код — в журнал. */
export class LogSmsProvider implements SmsProvider {
    readonly name = 'log';
    constructor(private readonly log: (line: string) => void) {}
    async send(phone: string, text: string) {
        this.log(`СМС на ${phone}: ${text}`);
    }
}

/**
 * Mobizon — казахстанский сервис рассылок. Запрос по их описанию
 * (mobizon.kz/help/api-docs/message): POST
 * /service/Message/SendSmsMessage?output=json&api=v1&apiKey=…, в теле
 * recipient (только цифры), text, from (имя отправителя, если своё). Ответ
 * `code: 0` — принято.
 *
 * Проверить на живом аккаунте при подключении: сервис ещё не выбран и не
 * оплачен, и вживую этот запрос не отправлялся.
 */
export class MobizonSmsProvider implements SmsProvider {
    readonly name = 'mobizon';
    constructor(
        private readonly apiKey: string,
        private readonly options: { url?: string; from?: string | null; fetchImpl?: typeof fetch } = {},
    ) {}

    async send(phone: string, text: string) {
        const base = (this.options.url || 'https://api.mobizon.kz').replace(/\/+$/, '');
        const url = `${base}/service/Message/SendSmsMessage?output=json&api=v1&apiKey=${encodeURIComponent(this.apiKey)}`;
        const body = new URLSearchParams({ recipient: phone.replace(/\D/g, ''), text });
        if (this.options.from) body.set('from', this.options.from);
        // Код живёт пять минут — дольше пытаться доставить незачем.
        body.set('params[validity]', '60');
        const res = await (this.options.fetchImpl ?? fetch)(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: body.toString(),
        });
        const json: any = await res.json().catch(() => null);
        if (!res.ok || !json || Number(json.code) !== 0) {
            throw new Error(`Mobizon: ${json?.message || `ответ ${res.status}`}`);
        }
    }
}

/** Сервис по настройкам; `null` — СМС выключены. */
export function smsProviderFrom(
    env: { get(key: string): string | undefined },
    log: (line: string) => void,
): SmsProvider | null {
    const kind = (env.get('SMS_PROVIDER') || '').trim().toLowerCase();
    if (!kind) return null;
    if (kind === 'log') {
        // Код в журнале рабочего сервера — это код для кого угодно, кто видит журнал.
        if (env.get('NODE_ENV') === 'production') throw new Error('SMS_PROVIDER=log нельзя на рабочем сервере');
        return new LogSmsProvider(log);
    }
    if (kind === 'mobizon') {
        const key = env.get('MOBIZON_API_KEY');
        if (!key) throw new Error('SMS_PROVIDER=mobizon, но MOBIZON_API_KEY пуст');
        return new MobizonSmsProvider(key, { url: env.get('MOBIZON_API_URL'), from: env.get('MOBIZON_FROM') || null });
    }
    throw new Error(`Неизвестный SMS_PROVIDER: ${kind}`);
}
