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

/**
 * Попросить разрешение и сообщить серверу адрес телефона. Повторный вызов
 * безвреден. Не вышло (отказ, эмулятор, нет связи) — молча: уведомления —
 * удобство, без них приложение работает.
 */
export async function registerPush(): Promise<void> {
    try {
        if (Platform.OS === 'web' || !Device.isDevice) return;
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Рейсы и выплаты',
                importance: Notifications.AndroidImportance.HIGH,
                sound: 'default',
            });
        }
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') return;
        const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? Constants.easConfig?.projectId;
        const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        await api.post('/notifications/push-devices', {
            token,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            deviceId: await getDeviceId(),
        });
        await SecureStore.setItemAsync(TOKEN_KEY, token);
    } catch {
        // Нет Firebase в сборке, нет связи — без уведомлений.
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
