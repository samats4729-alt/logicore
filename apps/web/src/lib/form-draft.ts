import dayjs from 'dayjs';

/**
 * Черновик формы — в браузере, пока её не отправили.
 *
 * Жалоба владельца: начал заводить заявку, отошёл в другой раздел проверить
 * контрагента или адрес, вернулся — всё набранное пропало, вписывай заново.
 * Черновик лежит в браузере этого человека: на сервер не уходит, другим не
 * виден и не считается заявкой — это просто незаконченная форма.
 *
 * Хранилище браузера может быть недоступно (приватный режим, запрет
 * сайтам хранить данные) — тогда черновика просто нет, а форма работает как
 * раньше. Поэтому каждое обращение — в try/catch.
 */

/** Версия формата: поменяется — старые черновики не подставятся криво, а пропадут. */
const ВЕРСИЯ = 1;

/** Метка даты внутри черновика: даты в форме — объекты dayjs, JSON их не знает. */
const ДАТА = '__dayjs';

interface Запись<T> {
    v: number;
    savedAt: string;
    data: T;
}

/**
 * Черновик, если он есть и не устарел. Устаревший или испорченный удаляется:
 * подставлять заявку месячной давности — значит путать, а не помогать.
 */
export function readDraft<T>(key: string, maxAgeMs: number): { savedAt: string; data: T } | null {
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const запись = JSON.parse(raw) as Запись<T>;
        const возраст = Date.now() - new Date(запись.savedAt).getTime();
        if (запись.v !== ВЕРСИЯ || !запись.data || !(возраст >= 0 && возраст <= maxAgeMs)) {
            window.localStorage.removeItem(key);
            return null;
        }
        return { savedAt: запись.savedAt, data: запись.data };
    } catch {
        return null;
    }
}

/** Сохранить черновик. Возвращает время сохранения или `null`, если хранилище недоступно. */
export function writeDraft<T>(key: string, data: T): string | null {
    try {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(key, JSON.stringify({ v: ВЕРСИЯ, savedAt, data } satisfies Запись<T>));
        return savedAt;
    } catch {
        return null;
    }
}

export function clearDraft(key: string) {
    try {
        window.localStorage.removeItem(key);
    } catch {
        /* хранилище недоступно — и черновика там нет */
    }
}

/**
 * Значения формы — в вид, который переживёт JSON.
 *
 * Даты antd — объекты dayjs. `JSON.stringify` превращает их в строку раньше,
 * чем это видно снаружи, и при восстановлении поле даты получило бы строку
 * вместо даты. Поэтому дату помечаем: `{ __dayjs: '2026-09-24T…' }`.
 */
export function serializeFormValues(values: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(values, function (this: any, key, value) {
        const исходное = key === '' ? value : this[key];
        if (dayjs.isDayjs(исходное)) return { [ДАТА]: исходное.toISOString() };
        return value;
    }) ?? '{}');
}

/** Обратно: помеченные даты — снова dayjs. */
export function reviveFormValues(values: Record<string, unknown>): Record<string, unknown> {
    const оживить = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(оживить);
        if (value && typeof value === 'object') {
            const объект = value as Record<string, unknown>;
            const ключи = Object.keys(объект);
            if (ключи.length === 1 && ключи[0] === ДАТА && typeof объект[ДАТА] === 'string') {
                const дата = dayjs(объект[ДАТА] as string);
                return дата.isValid() ? дата : undefined;
            }
            return Object.fromEntries(ключи.map((k) => [k, оживить(объект[k])]));
        }
        return value;
    };
    return (оживить(values) as Record<string, unknown>) ?? {};
}

/**
 * Пусто ли в форме по сравнению с тем, как она открылась.
 *
 * Значения по умолчанию (валюта «KZT», тип оплаты) — не ввод человека:
 * иначе черновик сохранялся бы от одного открытия формы, и в следующий раз
 * человек видел бы «восстановили незаконченную заявку» с пустыми полями.
 */
export function formValuesEmpty(values: Record<string, unknown>, initial: Record<string, unknown>): boolean {
    const пусто = (v: unknown) => v === undefined || v === null || v === ''
        || (Array.isArray(v) && v.length === 0);
    return Object.entries(values).every(([key, value]) =>
        пусто(value) || JSON.stringify(value) === JSON.stringify(initial[key]));
}
