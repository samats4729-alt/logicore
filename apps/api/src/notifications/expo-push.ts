/**
 * Отправка push-уведомлений через сервис Expo (решение владельца 25.10.2026,
 * вопрос 26: push — сейчас, бесплатно).
 *
 * Expo сам передаёт уведомление в Google (FCM) или Apple: серверу не нужны
 * ни ключи Firebase, ни библиотека Google — только адрес телефона
 * («ExponentPushToken[…]»), который приложение получило от Expo. Ключ
 * Firebase владелец один раз кладёт в настройки проекта на expo.dev.
 *
 * Модуль не ходит в базу: на вход — сообщения, на выход — что ответил Expo.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo принимает не больше ста сообщений за запрос. */
const CHUNK = 100;

export interface PushMessage {
    to: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
}

/** Ответ Expo на одно сообщение: принято или почему нет. */
export interface PushTicket {
    status: 'ok' | 'error';
    id?: string;
    message?: string;
    details?: { error?: string };
}

/** Адрес телефона в Expo: «ExponentPushToken[…]» (или более новое «ExpoPushToken[…]»). */
export function isExpoPushToken(token: unknown): token is string {
    return typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]\s]{10,200}\]$/.test(token);
}

/**
 * Отправить сообщения. Возвращает ответы Expo в том же порядке, что
 * сообщения; не дошедший запрос — ответ-ошибка на каждое сообщение пачки,
 * без исключения: уведомление не должно ломать действие, которое его вызвало.
 */
export async function sendExpoPush(
    messages: PushMessage[],
    options: { url?: string; accessToken?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<PushTicket[]> {
    const doFetch = options.fetchImpl ?? fetch;
    const tickets: PushTicket[] = [];
    for (let i = 0; i < messages.length; i += CHUNK) {
        const chunk = messages.slice(i, i + CHUNK).map((m) => ({
            ...m,
            sound: 'default',
            priority: 'high',
            // Канал создаёт приложение при запуске («Рейсы и выплаты»).
            channelId: 'default',
        }));
        try {
            const res = await doFetch(options.url || EXPO_PUSH_URL, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
                },
                body: JSON.stringify(chunk),
            });
            const json: any = await res.json().catch(() => null);
            const data: PushTicket[] | undefined = Array.isArray(json?.data) ? json.data : undefined;
            if (!res.ok || !data || data.length !== chunk.length) {
                const why = json?.errors?.[0]?.message || `ответ ${res.status}`;
                tickets.push(...chunk.map(() => ({ status: 'error' as const, message: why })));
                continue;
            }
            tickets.push(...data);
        } catch (e: any) {
            tickets.push(...chunk.map(() => ({ status: 'error' as const, message: e?.message || 'нет связи с Expo' })));
        }
    }
    return tickets;
}
