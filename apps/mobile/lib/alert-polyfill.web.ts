import { Alert } from 'react-native';

/**
 * Предпросмотр в браузере: Alert из react-native-web ничего не показывает,
 * и подтверждения («Беру», «Доставил», «Выйти») молча не срабатывают.
 * Подменяем окнами браузера: одна кнопка — alert, две — confirm,
 * больше — prompt с номерами вариантов. В сборку для телефона не попадает.
 */
type Btn = { text?: string; onPress?: () => void; style?: string };
const w = globalThis as unknown as {
    alert(m: string): void;
    confirm(m: string): boolean;
    prompt(m: string): string | null;
};

Alert.alert = (title: string, message?: string, buttons?: Btn[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons ?? [];
    const actions = list.filter((b) => b.style !== 'cancel');
    if (actions.length <= 1 && list.length <= 1) {
        w.alert(text);
        list[0]?.onPress?.();
        return;
    }
    if (actions.length === 1) {
        if (w.confirm(`${text}\n\nОК — «${actions[0].text}»`)) actions[0].onPress?.();
        return;
    }
    const answer = w.prompt(`${text}\n\n${actions.map((b, i) => `${i + 1}. ${b.text}`).join('\n')}\n\nНомер варианта:`);
    const chosen = actions[Number(answer) - 1];
    chosen?.onPress?.();
};
