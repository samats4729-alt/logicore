import { Alert, Linking } from 'react-native';

/**
 * Ссылка на чат WhatsApp с номером: только цифры, с кодом страны. Казахстанский
 * номер с восьмёркой («8 701…») — в международный вид («7701…»).
 */
export function whatsappUrl(phone: string, text?: string): string | null {
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (digits.length === 10) digits = `7${digits}`;
    if (digits.length < 11) return null;
    return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Открыть чат: WhatsApp, а нет приложения — его веб-страница. */
export async function openWhatsApp(phone: string, text?: string) {
    const url = whatsappUrl(phone, text);
    if (!url) { Alert.alert('WhatsApp', 'Номер указан неверно — позвоните в парк'); return; }
    try {
        await Linking.openURL(url);
    } catch {
        Alert.alert('WhatsApp', 'Не удалось открыть WhatsApp');
    }
}
