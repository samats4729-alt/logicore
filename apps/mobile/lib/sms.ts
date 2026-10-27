import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { api } from '@/lib/api';
import { ответ } from '@/lib/exchange';

/**
 * Код из СМС для регистрации и входа (решение владельца 25.10.2026, вопрос 26).
 *
 * Пока сервис СМС на сервере не подключён, сервер отвечает «выключено», и
 * экраны выглядят как раньше: вход и регистрация по номеру и паролю.
 */
export type CodePurpose = 'REGISTER' | 'LOGIN';

export async function smsEnabled(): Promise<boolean> {
    try {
        const { data } = await api.get('/auth/sms/status');
        return !!data?.enabled;
    } catch {
        return false;
    }
}

/** Отправка кода и отсчёт до повторной отправки — общее для входа и регистрации. */
export function useSmsCode(purpose: CodePurpose) {
    const [enabled, setEnabled] = useState(false);
    const [sending, setSending] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [wait, setWait] = useState(0);

    useEffect(() => { smsEnabled().then(setEnabled); }, []);
    useEffect(() => {
        if (wait <= 0) return;
        const t = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(t);
    }, [wait]);

    const send = async (phone: string): Promise<boolean> => {
        setSending(true);
        try {
            const { data } = await api.post('/auth/sms/send-code', { phone, purpose });
            setSentTo(phone);
            setWait(Number(data?.resendIn) || 60);
            return true;
        } catch (e) {
            Alert.alert('Код не отправлен', ответ(e, 'Проверьте номер и интернет и попробуйте ещё раз'));
            return false;
        } finally {
            setSending(false);
        }
    };

    return { enabled, sending, sentTo, wait, send };
}
