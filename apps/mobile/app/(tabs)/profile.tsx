import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { api, API_URL, getAuthHeader } from '@/lib/api';
import { FONT, RADIUS, SHADOW } from '@/lib/theme';
import { Button, ListRow, ScreenHeader, Section } from '@/components/kit';

export default function ProfileScreen() {
    const { user, logout } = useStore();
    const { colors, isDark } = useAppTheme();
    const [avatarVersion, setAvatarVersion] = useState(Date.now());
    const [avatarFailed, setAvatarFailed] = useState(false);
    const [uploading, setUploading] = useState(false);

    const handleLogout = () => {
        Alert.alert('Выход', 'Вы уверены, что хотите выйти?', [
            { text: 'Отмена', style: 'cancel' },
            {
                text: 'Выйти',
                style: 'destructive',
                onPress: async () => {
                    await logout();
                    router.replace('/login');
                },
            },
        ]);
    };

    const pickAvatar = async () => {
        try {
            const picker = await ImagePicker.launchImageLibraryAsync({
                quality: 0.7,
                allowsEditing: true,
                aspect: [1, 1],
            });
            if (picker.canceled || !picker.assets?.[0]) return;

            setUploading(true);
            const formData = new FormData();
            formData.append('avatar', {
                uri: picker.assets[0].uri,
                name: 'avatar.jpg',
                type: 'image/jpeg',
            } as any);

            await api.post('/users/me/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setAvatarFailed(false);
            setAvatarVersion(Date.now());
            Alert.alert('Готово', 'Фото профиля обновлено');
        } catch (error: any) {
            Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось загрузить фото');
        } finally {
            setUploading(false);
        }
    };

    const initials = ((user?.lastName?.[0] || '') + (user?.firstName?.[0] || '')).toUpperCase() || '?';

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 124 }}>
            <ScreenHeader eyebrow="Аккаунт" title="Профиль" />

            <View style={styles.body}>
                {/* Кто вы: фото, имя, телефон, компания */}
                <View style={[styles.identity, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && SHADOW]}>
                    <TouchableOpacity onPress={pickAvatar} disabled={uploading} style={styles.avatarWrap} accessibilityLabel="Сменить фото профиля">
                        {!avatarFailed ? (
                            <Image
                                source={{
                                    uri: `${API_URL}/users/me/avatar?v=${avatarVersion}`,
                                    headers: getAuthHeader(),
                                }}
                                style={[styles.avatarImage, { backgroundColor: colors.hover }]}
                                onError={() => setAvatarFailed(true)}
                            />
                        ) : (
                            <View style={[styles.avatarFallback, { backgroundColor: colors.feature }]}>
                                <Text style={[styles.avatarInitials, { color: colors.featureFg }]}>{initials}</Text>
                            </View>
                        )}
                        <View style={[styles.avatarBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                            {uploading
                                ? <ActivityIndicator size="small" color={colors.primaryFg} />
                                : <Ionicons name="camera" size={12} color={colors.primaryFg} />}
                        </View>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
                            {user?.lastName} {user?.firstName}
                        </Text>
                        <Text style={[styles.phone, { color: colors.textSecondary }]}>{user?.phone}</Text>
                        <View style={styles.tags}>
                            <View style={[styles.rolePill, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                                <Ionicons name="id-card-outline" size={12} color={colors.textSecondary} />
                                <Text style={[styles.rolePillText, { color: colors.textSecondary }]}>Водитель</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {!!user?.company?.name && (
                    <Section title="Компания" icon="business-outline">
                        <Text style={[styles.companyName, { color: colors.text }]}>{user.company.name}</Text>
                        <Text style={[styles.companyHint, { color: colors.textTertiary }]}>Рейсы назначает диспетчер этой компании</Text>
                    </Section>
                )}

                {/* Транспорт */}
                {!!user?.vehiclePlate && (
                    <Section title="Транспорт" icon="car-outline">
                        <View style={styles.vehicleRow}>
                            <View style={[styles.plate, { borderColor: colors.text }]}>
                                <Text style={[styles.plateText, { color: colors.text }]}>{user.vehiclePlate}</Text>
                            </View>
                            {!!user.vehicleModel && (
                                <Text style={[styles.vehicleModel, { color: colors.textSecondary }]} numberOfLines={1}>{user.vehicleModel}</Text>
                            )}
                        </View>
                        {!!user.trailerNumber && (
                            <Text style={[styles.trailer, { color: colors.textSecondary }]}>Прицеп: {user.trailerNumber}</Text>
                        )}
                    </Section>
                )}

                {/* Меню */}
                <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && SHADOW]}>
                    <ListRow icon="documents-outline" label="История рейсов" desc="Все ваши рейсы и их статусы" onPress={() => router.push('/(tabs)/orders')} />
                    <ListRow icon="settings-outline" label="Настройки" desc="Тема оформления, проверка GPS" onPress={() => router.push('/settings')} last />
                </View>

                {/* Выход */}
                <Button title="Выйти из аккаунта" icon="log-out-outline" variant="danger" onPress={handleLogout} style={{ marginTop: 4 }} />

                <Text style={[styles.version, { color: colors.textTertiary }]}>LogiCore Driver · версия 1.1.0</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { paddingHorizontal: 16 },
    identity: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 18,
        borderRadius: 22,
        borderWidth: 1,
        marginBottom: 12,
    },
    avatarWrap: { position: 'relative' },
    avatarImage: {
        width: 76,
        height: 76,
        borderRadius: 38,
    },
    avatarFallback: {
        width: 76,
        height: 76,
        borderRadius: 38,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarInitials: { fontFamily: FONT.display, fontSize: 24, letterSpacing: -0.5 },
    avatarBadge: {
        position: 'absolute',
        right: -1,
        bottom: -1,
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    name: { fontFamily: FONT.display, fontSize: 18, letterSpacing: -0.7, lineHeight: 23 },
    phone: { fontFamily: FONT.regular, fontSize: 14, marginTop: 4, fontVariant: ['tabular-nums'] },
    tags: { flexDirection: 'row', marginTop: 10 },
    rolePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
    },
    rolePillText: { fontFamily: FONT.semibold, fontSize: 11.5 },

    companyName: { fontFamily: FONT.semibold, fontSize: 16, letterSpacing: -0.2 },
    companyHint: { fontFamily: FONT.regular, fontSize: 12.5, marginTop: 4 },

    vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    plate: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    plateText: { fontFamily: FONT.bold, fontSize: 15, letterSpacing: 1, fontVariant: ['tabular-nums'] },
    vehicleModel: { flex: 1, fontFamily: FONT.medium, fontSize: 14.5 },
    trailer: { fontFamily: FONT.regular, fontSize: 13, marginTop: 10 },

    menu: {
        borderRadius: RADIUS.card,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 12,
    },
    version: { fontFamily: FONT.regular, textAlign: 'center', fontSize: 11.5, marginTop: 16 },
});
