import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from '@/lib/secure';
import { BRAND } from '@/lib/theme';
import { PARK_INVITE_KEY } from '@/lib/exchange';

/**
 * Ссылка-приглашение парка (logcomp://park-invite/КОД). Запоминаем код и
 * идём обычным путём: вход через Google → анкета, где код подставится сам.
 */
export default function ParkInviteLink() {
    const { code } = useLocalSearchParams<{ code: string }>();
    useEffect(() => {
        (async () => {
            if (code) await SecureStore.setItemAsync(PARK_INVITE_KEY, String(code).toUpperCase());
            router.replace('/');
        })();
    }, [code]);
    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={BRAND.primary} />
        </View>
    );
}
