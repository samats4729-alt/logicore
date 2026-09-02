import { createHash } from 'crypto';
import {
    scriptNameFromUrl,
    signatureSource,
    signParams,
    verifySignature,
    безПустых,
    randomSalt,
} from './freedompay.signature';
import { parseFlatXml, buildXmlResponse } from './freedompay.xml';
import { FreedomPayService } from './freedompay.service';

/**
 * Подпись — единственный замок на обработчике оплаты: адрес открыт всем,
 * потому что стучится в него сервер платёжной системы, а не человек с
 * логином. Поэтому проверяется не «работает вообще», а ровно те четыре
 * правила, на которых подпись расходится молча.
 *
 * Проверить настоящим ключом из этой среды нельзя — сеть до FreedomPay
 * закрыта. Зато сам алгоритм проверяется целиком: строка, которая уходит в
 * md5, собирается здесь руками и сверяется посимвольно.
 */

const КЛЮЧ = 'secret';

describe('подпись FreedomPay', () => {
    describe('имя скрипта', () => {
        it('берёт последний кусок пути, а не весь адрес', () => {
            expect(scriptNameFromUrl('https://api.example.com/billing/freedompay/result'))
                .toBe('result');
        });

        it('не спотыкается о хвостовой слэш и строку запроса', () => {
            expect(scriptNameFromUrl('https://api.example.com/billing/freedompay/result/'))
                .toBe('result');
            expect(scriptNameFromUrl('https://api.example.com/billing/freedompay/result?x=1'))
                .toBe('result');
        });

        it('у запроса ссылки имя скрипта — имя файла', () => {
            expect(scriptNameFromUrl('https://api.freedompay.money/init_payment.php'))
                .toBe('init_payment.php');
        });
    });

    describe('строка для md5', () => {
        it('сортирует по имени параметра, а в строку кладёт значение', () => {
            // Имена намеренно в обратном алфавитном порядке: если сортировка
            // потеряется, строка соберётся задом наперёд и тест это увидит.
            const строка = signatureSource(
                'init_payment.php',
                { pg_salt: 'соль', pg_order_id: '42', pg_merchant_id: '1000' },
                КЛЮЧ,
            );

            expect(строка).toBe('init_payment.php;1000;42;соль;secret');
        });

        it('не включает саму подпись', () => {
            const без = signatureSource('result', { pg_order_id: '42' }, КЛЮЧ);
            const с = signatureSource('result', { pg_order_id: '42', pg_sig: 'чужая' }, КЛЮЧ);

            expect(с).toBe(без);
        });

        it('пустое значение остаётся пустым местом, а не выпадает', () => {
            // Платёжная система считает подпись по всему, что реально пришло.
            // Выброси мы пустое поле — на её ответах подпись не сошлась бы.
            const строка = signatureSource(
                'result',
                { pg_failure_code: '', pg_order_id: '42' },
                КЛЮЧ,
            );

            expect(строка).toBe('result;;42;secret');
        });

        it('секретный ключ идёт последним, имя скрипта — первым', () => {
            const строка = signatureSource('result', { pg_result: 1 }, КЛЮЧ);

            expect(строка.startsWith('result;')).toBe(true);
            expect(строка.endsWith(';secret')).toBe(true);
        });
    });

    describe('подсчёт', () => {
        it('это md5 от собранной строки', () => {
            const параметры = { pg_order_id: '42', pg_salt: 'соль' };
            const ожидаем = createHash('md5')
                .update(signatureSource('result', параметры, КЛЮЧ), 'utf8')
                .digest('hex');

            expect(signParams('result', параметры, КЛЮЧ)).toBe(ожидаем);
        });
    });

    describe('проверка входящего сообщения', () => {
        const пришло = (): Record<string, string> => {
            const тело: Record<string, string> = {
                pg_order_id: 'pay-1',
                pg_payment_id: '99',
                pg_amount: '15000',
                pg_result: '1',
                pg_salt: 'соль',
            };
            return { ...тело, pg_sig: signParams('result', тело, КЛЮЧ) };
        };

        it('принимает сообщение, подписанное нашим ключом', () => {
            expect(verifySignature('result', пришло(), КЛЮЧ)).toBe(true);
        });

        it('отвергает подделку', () => {
            // Ровно то, чего мы боимся: чужой узнал адрес обработчика и шлёт
            // «оплачено» без ключа.
            const подделка = { ...пришло(), pg_sig: 'a'.repeat(32) };

            expect(verifySignature('result', подделка, КЛЮЧ)).toBe(false);
        });

        it('отвергает подменённую сумму при верной подписи от старого тела', () => {
            const тело = пришло();

            expect(verifySignature('result', { ...тело, pg_amount: '1' }, КЛЮЧ)).toBe(false);
        });

        it('отвергает сообщение без подписи', () => {
            const { pg_sig, ...без } = пришло();

            expect(verifySignature('result', без, КЛЮЧ)).toBe(false);
        });

        it('не спотыкается о подпись в верхнем регистре', () => {
            const тело = пришло();

            expect(verifySignature('result', { ...тело, pg_sig: тело.pg_sig.toUpperCase() }, КЛЮЧ))
                .toBe(true);
        });

        it('чужой ключ не подходит', () => {
            expect(verifySignature('result', пришло(), 'другой')).toBe(false);
        });

        it('другое имя скрипта не подходит', () => {
            // Тот же ключ, но подпись считалась от `result` — обработчик
            // `check` такое сообщение принять не должен.
            expect(verifySignature('check', пришло(), КЛЮЧ)).toBe(false);
        });
    });

    describe('чистка перед отправкой', () => {
        it('убирает пустые поля и приводит числа к строкам', () => {
            expect(безПустых({
                pg_amount: 15000,
                pg_description: 'Подписка',
                pg_user_contact_email: undefined,
                pg_param1: null,
                pg_param2: '',
            })).toEqual({ pg_amount: '15000', pg_description: 'Подписка' });
        });

        it('ноль не пустое значение', () => {
            expect(безПустых({ pg_testing_mode: 0 })).toEqual({ pg_testing_mode: '0' });
        });
    });

    describe('соль', () => {
        it('разная от вызова к вызову', () => {
            const соли = new Set(Array.from({ length: 50 }, () => randomSalt()));

            expect(соли.size).toBe(50);
        });
    });
});

describe('XML платёжной системы', () => {
    it('разбирает ответ на запрос ссылки', () => {
        const ответ = `<?xml version="1.0" encoding="utf-8"?>
<response>
    <pg_status>ok</pg_status>
    <pg_payment_id>123456</pg_payment_id>
    <pg_redirect_url>https://api.freedompay.money/pay.html?customer=1&amp;order=2</pg_redirect_url>
    <pg_salt>соль</pg_salt>
    <pg_sig>abc</pg_sig>
</response>`;

        expect(parseFlatXml(ответ)).toEqual({
            pg_status: 'ok',
            pg_payment_id: '123456',
            // Амперсанд в ссылке приходит экранированным — не расшифруй мы его,
            // человек ушёл бы на битый адрес.
            pg_redirect_url: 'https://api.freedompay.money/pay.html?customer=1&order=2',
            pg_salt: 'соль',
            pg_sig: 'abc',
        });
    });

    it('разбирает отказ', () => {
        const ответ = '<response><pg_status>error</pg_status>'
            + '<pg_error_code>101</pg_error_code>'
            + '<pg_error_description>Неверная подпись</pg_error_description></response>';

        expect(parseFlatXml(ответ)).toEqual({
            pg_status: 'error',
            pg_error_code: '101',
            pg_error_description: 'Неверная подпись',
        });
    });

    it('на мусор вместо XML отвечает пустотой, а не падением', () => {
        expect(parseFlatXml('502 Bad Gateway')).toEqual({});
    });

    it('собирает ответ обратно и читает его же', () => {
        const xml = buildXmlResponse({ pg_status: 'ok', pg_description: 'Оплата принята' });

        expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
        expect(parseFlatXml(xml)).toEqual({ pg_status: 'ok', pg_description: 'Оплата принята' });
    });

    it('спецсимволы в ответе не ломают разметку', () => {
        const xml = buildXmlResponse({ pg_status: 'ok', pg_description: 'Счёт «Ромашка» < 1 & 2' });

        expect(xml).toContain('&lt;');
        expect(parseFlatXml(xml).pg_description).toBe('Счёт «Ромашка» < 1 & 2');
    });
});

/**
 * Проверка настройки — то, что владелец видит в админке вместо отсутствия
 * кнопки. Здесь важно ровно одно: секретный ключ не должен утечь наружу
 * никаким полем, а список нехватки должен называть переменные поимённо,
 * иначе настройка снова превращается в перебор наугад.
 */
describe('проверка настройки оплаты картой', () => {
    const сервис = (env: Record<string, string | undefined>) =>
        new FreedomPayService({ get: (имя: string) => env[имя] } as any);

    const ПОЛНЫЙ = {
        FREEDOMPAY_MERCHANT_ID: '589160',
        FREEDOMPAY_SECRET_KEY: 'очень-секретный-ключ',
        API_PUBLIC_URL: 'https://api.example.com',
        FRONTEND_URL: 'https://app.example.com',
    };

    it('всё задано — настроено', () => {
        const д = сервис(ПОЛНЫЙ).диагностика();

        expect(д.ready).toBe(true);
        expect(д.missing).toEqual([]);
        expect(д.merchantId).toBe('589160');
        expect(д.secretKeySet).toBe(true);
    });

    it('секретный ключ наружу не выходит ни одним полем', () => {
        const д = сервис(ПОЛНЫЙ).диагностика();

        expect(JSON.stringify(д)).not.toContain('очень-секретный-ключ');
    });

    it('называет поимённо, чего не хватает', () => {
        const д = сервис({ FREEDOMPAY_SECRET_KEY: 'x' }).диагностика();

        expect(д.ready).toBe(false);
        expect(д.missing).toEqual(['FREEDOMPAY_MERCHANT_ID', 'API_PUBLIC_URL']);
    });

    it('пустая строка — это не заданное значение', () => {
        // Переменная, заведённая в панели хостинга, но с пустым значением,
        // выглядит как заданная. Для нас она не задана.
        const д = сервис({ ...ПОЛНЫЙ, FREEDOMPAY_MERCHANT_ID: '   ' }).диагностика();

        expect(д.ready).toBe(false);
        expect(д.missing).toContain('FREEDOMPAY_MERCHANT_ID');
    });

    it('показывает адрес, на который придёт подтверждение оплаты', () => {
        // Ошибка в нём самая дорогая: деньги спишутся, подписка не продлится.
        const д = сервис(ПОЛНЫЙ).диагностика();

        expect(д.resultUrl).toBe('https://api.example.com/billing/freedompay/result');
        expect(д.frontendUrl).toBe('https://app.example.com');
    });

    it('хвостовой слэш в адресе не даёт двойного', () => {
        const д = сервис({ ...ПОЛНЫЙ, API_PUBLIC_URL: 'https://api.example.com/' }).диагностика();

        expect(д.resultUrl).toBe('https://api.example.com/billing/freedompay/result');
    });

    it('пока не настроено, адреса обработчика нет', () => {
        const д = сервис({}).диагностика();

        expect(д.resultUrl).toBeNull();
        expect(д.merchantId).toBeNull();
        expect(д.secretKeySet).toBe(false);
    });

    it('тестовый режим виден отдельно', () => {
        expect(сервис(ПОЛНЫЙ).диагностика().testingMode).toBe(false);
        expect(сервис({ ...ПОЛНЫЙ, FREEDOMPAY_TESTING_MODE: '1' }).диагностика().testingMode).toBe(true);
    });
});

/**
 * Разбор сетевой ошибки.
 *
 * `fetch` в Node на любую сетевую беду отвечает двумя словами — «fetch
 * failed». Владелец платформы видит их в админке и не может понять, чинить
 * ему адрес, сеть или сертификат. Проверяем, что настоящая причина
 * доезжает до текста.
 */
describe('причина сетевой ошибки', () => {
    const сервис = () => new FreedomPayService({
        get: (имя: string) => ({
            FREEDOMPAY_MERCHANT_ID: '589160',
            FREEDOMPAY_SECRET_KEY: 'k',
            API_PUBLIC_URL: 'https://api.example.com',
            FREEDOMPAY_API_URL: 'https://шлюз.example',
        } as Record<string, string>)[имя],
    } as any);

    /** Так выглядит отказ DNS, каким его отдаёт `fetch`. */
    const несуществующийУзел = () => {
        const низ: any = new Error('getaddrinfo ENOTFOUND шлюз.example');
        низ.code = 'ENOTFOUND';
        низ.hostname = 'шлюз.example';
        const верх: any = new TypeError('fetch failed');
        верх.cause = низ;
        return верх;
    };

    const запрос = async (ошибка: any) => {
        const прежний = global.fetch;
        (global as any).fetch = jest.fn().mockRejectedValue(ошибка);
        try {
            await сервис().initPayment({
                paymentId: 'p1', amount: 5000, currency: 'KZT', description: 'тест',
                successUrl: 'https://app/ok', failureUrl: 'https://app/no',
            });
            throw new Error('должно было упасть');
        } catch (e: any) {
            return e.message as string;
        } finally {
            global.fetch = прежний;
        }
    };

    it('называет узел и код вместо «fetch failed»', async () => {
        const текст = await запрос(несуществующийУзел());

        expect(текст).toContain('ENOTFOUND');
        expect(текст).toContain('шлюз.example');
        // Два бесполезных слова сами по себе в тексте не остаются.
        expect(текст).not.toBe('fetch failed');
    });

    it('показывает адрес, до которого не дошли', async () => {
        const текст = await запрос(несуществующийУзел());

        expect(текст).toContain('https://шлюз.example/init_payment.php');
    });

    it('ошибка без вложенной причины не теряется', async () => {
        const текст = await запрос(new Error('соединение сброшено'));

        expect(текст).toContain('соединение сброшено');
    });
});
