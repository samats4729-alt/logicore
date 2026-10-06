import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { api } from '@/lib/api';
import { FONT, RADIUS, SHADOW } from '@/lib/theme';
import { ListRow, ScreenHeader } from '@/components/kit';

export default function SettingsScreen() {
    const { mapTheme, setMapTheme, currentOrder } = useStore();
    const { colors, isDark } = useAppTheme();

    // Диагностика GPS: права → сервисы → координаты → отправка на сервер
    const checkGps = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Нет прав', 'Разрешите доступ к местоположению: Настройки телефона → Приложения → LogiCore Driver → Разрешения.');
                return;
            }
            const enabled = await Location.hasServicesEnabledAsync();
            if (!enabled) {
                Alert.alert('GPS выключен', 'Включите геолокацию в шторке телефона.');
                return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            await api.post('/tracking/gps', {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: loc.coords.accuracy,
                speed: loc.coords.speed,
                heading: loc.coords.heading,
                orderId: currentOrder?.id,
                recordedAt: new Date().toISOString(),
            });
            Alert.alert('GPS работает', `Координаты получены и отправлены на сервер.\n${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
        } catch (e: any) {
            Alert.alert('Ошибка GPS', e.message || 'Не удалось получить координаты');
        }
    };

    const options = [
        { label: 'Автоматически', desc: 'Тёмная с 20:00 до 6:00', value: 'auto', icon: 'time-outline' },
        { label: 'Светлая', desc: 'Всегда светлая', value: 'light', icon: 'sunny-outline' },
        { label: 'Тёмная', desc: 'Всегда тёмная — меньше слепит ночью', value: 'dark', icon: 'moon-outline' },
    ] as const;

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 40 }}>
            <ScreenHeader eyebrow="Профиль" title="Настройки" onBack={() => router.back()} />

            <View style={styles.body}>
                <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>Оформление и карта</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && SHADOW]}>
                    {options.map((option, index) => (
                        <ListRow
                            key={option.value}
                            icon={option.icon}
                            label={option.label}
                            desc={option.desc}
                            onPress={() => setMapTheme(option.value)}
                            last={index === options.length - 1}
                            right={mapTheme === option.value
                                ? <Ionicons name="checkmark-circle" size={22} color={colors.text} />
                                : <Ionicons name="ellipse-outline" size={22} color={colors.border} />}
                        />
                    ))}
                </View>

                <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>Диагностика</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && SHADOW]}>
                    <ListRow icon="navigate-circle-outline" label="Проверить GPS" desc="Получить координаты и отправить диспетчеру" onPress={checkGps} last />
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    body: {
        paddingHorizontal: 16,
    },
    sectionTitle: {
        fontFamily: FONT.displayMedium,
        fontSize: 10,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
        marginLeft: 4,
        marginBottom: 10,
        marginTop: 8,
    },
    card: {
        borderRadius: RADIUS.card,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 18,
    },
});
