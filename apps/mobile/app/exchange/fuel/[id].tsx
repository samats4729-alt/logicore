import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { exchangeApi, ответ } from '@/lib/exchange';
import { BRAND } from '@/lib/theme';
import { Button, Empty } from '@/components/kit';
import { TripFuel } from '@/components/TripFuel';

/**
 * Топливо по довезённому рейсу (шеф, 27.10.2026): водитель заправился уже
 * после рейса — на обратном пути — и прикрепляет чек отсюда. Тот же блок,
 * что в «Мой рейс»; прикрепить можно, пока не запрошена выплата по рейсу.
 */
export default function TripFuelScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors } = useAppTheme();
    const [state, setState] = useState<'loading' | 'ok' | string>('loading');

    useFocusEffect(useCallback(() => {
        exchangeApi.tripFuel(id).then(() => setState('ok')).catch((e) => setState(ответ(e, 'Рейс недоступен')));
    }, [id]));

    if (state === 'loading') return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={BRAND.primary} />;
    if (state !== 'ok') {
        return <Empty icon="alert-circle-outline" title="Топливо недоступно" text={state} action={<Button title="Назад" onPress={() => router.back()} />} />;
    }
    return (
        <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <TripFuel orderId={id} />
        </ScrollView>
    );
}
