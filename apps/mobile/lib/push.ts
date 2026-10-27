import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from '@/lib/secure';
import { router } from 'expo-router';
import { api, getDeviceId } from '@/lib/api';

/**
 * Push-уведомления водителю (решение владельца 25.10.2026, вопрос 26):
 * выбрали на рейс, анкета проверена, выплата, чек на топливо, новый рейс.
 *
 * Адрес телефона выдаёт сервис Expo (бесплатно), сервер шлёт на него через
 * Expo. На Android Expo доставляет через Google: для этого в сборке нужен
 * файл Firebase (`google-services.json`, см. app.config.js), а ключ Firebase
 * лежит в настройках проекта на expo.dev. Без них приложение работает как
 * раньше, просто без уведомлений.
 */

const TOKEN_KEY = 'pushToken';

// Уведомление, пришедшее при открытом приложении, тоже показываем сверху.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

/** Чем кончилась попытка: записан, человек запретил, телефон не умеет, сбой. */
export type PushRegistration = 'ok' | 'denied' | 'unavailable' | 'error';

/**
 * Попросить разрешение и сообщить серверу адрес телефона. Повторный вызов
 * безвреден. Не вышло (отказ, эмулятор, нет связи) — без шума: уведомления —
 * удобство, без них приложение работает.
 */
export async function registerPush(): Promise<PushRegistration> {
    try {
        if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Рейсы и выплаты',
                importance: Notifications.AndroidImportance.HIGH,
                sound: 'default',
            });
        }
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') return 'denied';
        const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? Constants.easConfig?.projectId;
        const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        await api.post('/notifications/push-devices', {
            token,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            deviceId: await getDeviceId(),
        });
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        return 'ok';
    } catch {
        // Нет Firebase в сборке, нет связи — без уведомлений.
        return 'error';
    }
}

/**
 * Кнопка «Проверить уведомления»: записать телефон заново и попросить
 * сервер прислать проверочное. Ответ — словами для водителя.
 */
export async function testPush(): Promise<{ ok: boolean; message: string }> {
    const reg = await registerPush();
    if (reg === 'denied') return { ok: false, message: 'Уведомления запрещены. Разрешите их: Настройки телефона → Приложения → LogiCore Водитель → Уведомления.' };
    if (reg === 'unavailable') return { ok: false, message: 'Уведомления работают только в приложении на телефоне.' };
    if (reg === 'error') return { ok: false, message: 'Телефон не удалось записать для уведомлений. Проверьте интернет и попробуйте ещё раз.' };
    try {
        const { data } = await api.post('/notifications/push-devices/test');
        return data?.sent
            ? { ok: true, message: 'Отправили проверочное уведомление — оно появится через несколько секунд.' }
            : { ok: false, message: 'Сервер не смог отправить уведомление. Попробуйте позже.' };
    } catch {
        return { ok: false, message: 'Нет связи с сервером. Попробуйте ещё раз.' };
    }
}

/** Выход из приложения: на этот телефон больше не слать. Звать, пока вход ещё действует. */
export async function unregisterPush(): Promise<void> {
    try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!token) return;
        await api.post('/notifications/push-devices/remove', { token });
        await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
        // Сервер не ответил — не беда: при следующем входе адрес перейдёт к новому владельцу.
    }
}

/** Открыть экран из уведомления — только свои пути внутри приложения. */
function openFrom(response: Notifications.NotificationResponse | null) {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as any);
}

/**
 * Нажатие на уведомление открывает нужный экран: и когда приложение
 * запущено, и когда уведомление его запустило. Возвращает отписку.
 */
export function listenPushTaps(): () => void {
    if (Platform.OS === 'web') return () => {};
    Notifications.getLastNotificationResponseAsync().then(openFrom).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => sub.remove();
}
