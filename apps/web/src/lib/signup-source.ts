/**
 * Запоминаем, что человек пришёл с рекламы Google, чтобы раздел «Реклама» в
 * админке показал его регистрацию.
 *
 * Google дописывает к адресу метку клика (`gclid`, на айфонах `gbraid`/`wbraid`)
 * только на первой странице: дальше по сайту метки уже нет, а зарегистрироваться
 * человек может и через неделю. Поэтому метка запоминается при первом заходе.
 * Сам номер клика не храним: важно лишь то, что человек пришёл с рекламы.
 */

const STORAGE_KEY = 'lc-signup-source';
const GOOGLE_ADS = 'GOOGLE_ADS';

/** Столько дней после клика регистрация считается пришедшей с рекламы. */
const REMEMBER_DAYS = 30;
const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;

const CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid'];

export function rememberAdClick(search: string = window.location.search) {
    const params = new URLSearchParams(search);
    if (!CLICK_PARAMS.some((name) => params.get(name))) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ source: GOOGLE_ADS, at: Date.now() }));
    } catch {
        // Хранилище закрыто — регистрация пройдёт как обычная, без отметки.
    }
}

/** Источник для регистрации; `undefined` — человек пришёл не с рекламы. */
export function adSignupSource(): string | undefined {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved?.source === GOOGLE_ADS && Date.now() - saved.at < REMEMBER_MS) return GOOGLE_ADS;
    } catch {
        // Хранилище закрыто или запись испорчена — считаем, что не с рекламы.
    }
    return undefined;
}
