import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { api, API_URL, getAuthHeader } from '@/lib/api';
import { BRAND, RADIUS } from '@/lib/theme';

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
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 120 }}>
            {/* Шапка профиля */}
            <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity onPress={pickAvatar} disabled={uploading} style={styles.avatarWrap}>
                    {!avatarFailed ? (
                        <Image
                            source={{
                                uri: `${API_URL}/users/me/avatar?v=${avatarVersion}`,
                                headers: getAuthHeader(),
                            }}
                            style={styles.avatarImage}
                            onError={() => setAvatarFailed(true)}
                        />
                    ) : (
                        <View style={[styles.avatarFallback, { backgroundColor: BRAND.primary }]}>
                            <Text style={styles.avatarInitials}>{initials}</Text>
                        </View>
                    )}
                    <View style={[styles.avatarBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        {uploading
                            ? <ActivityIndicator size="small" color={BRAND.primary} />
                            : <Ionicons name="camera" size={14} color={BRAND.primary} />}
                    </View>
                </TouchableOpacity>
                <Text style={[styles.name, { color: colors.text }]}>
                    {user?.lastName} {user?.firstName}
                </Text>
                <Text style={[styles.phone, { color: colors.textSecondary }]}>{user?.phone}</Text>
                <View style={[styles.rolePill, { backgroundColor: isDark ? colors.hover : '#e8f0fe' }]}>
                    <Text style={styles.rolePillText}>Водитель</Text>
                </View>
            </View>

            {/* Транспорт */}
            {!!user?.vehiclePlate && (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.cardRow}>
                        <View style={[styles.cardIcon, { backgroundColor: isDark ? colors.hover : '#e6f4ff' }]}>
                            <Ionicons name="car" size={20} color={BRAND.primary} />
                        </View>
                        <View style={styles.cardContent}>
                            <Text style={[styles.cardLabel, { color: colors.textTertiary }]}>ТРАНСПОРТ</Text>
                            <Text style={[styles.cardValue, { color: colors.text }]}>
                                {[user.vehicleModel, user.vehiclePlate].filter(Boolean).join(' · ')}
                            </Text>
                            {!!user.trailerNumber && (
                                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Прицеп: {user.trailerNumber}</Text>
                            )}
                        </View>
                    </View>
                </View>
            )}

            {/* Меню */}
            <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                    style={[styles.menuItem, { borderBottomColor: colors.border }]}
                    onPress={() => router.push('/(tabs)/orders')}
                >
                    <Ionicons name="documents-outline" size={22} color={colors.text} />
                    <Text style={[styles.menuText, { color: colors.text }]}>История рейсов</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.menuItem, { borderBottomColor: 'transparent' }]}
                    onPress={() => router.push('/settings')}
                >
                    <Ionicons name="settings-outline" size={22} color={colors.text} />
                    <Text style={[styles.menuText, { color: colors.text }]}>Настройки</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
            </View>

            {/* Выход */}
            <TouchableOpacity
                style={[styles.logoutButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={handleLogout}
            >
                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                <Text style={[styles.logoutText, { color: colors.danger }]}>Выйти из аккаунта</Text>
            </TouchableOpacity>

            <Text style={[styles.version, { color: colors.textTertiary }]}>LogiCore Driver · версия 1.1.0</Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerCard: {
        alignItems: 'center',
        margin: 14,
        marginBottom: 0,
        paddingVertical: 26,
        borderRadius: RADIUS.card,
        borderWidth: 1,
    },
    avatarWrap: { position: 'relative', marginBottom: 12 },
    avatarImage: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#e5e7eb',
    },
    avatarFallback: {
        width: 96,
        height: 96,
        borderRadius: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarInitials: { color: '#fff', fontSize: 32, fontWeight: '800' },
    avatarBadge: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    name: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
    phone: { fontSize: 13.5, marginTop: 3 },
    rolePill: {
        marginTop: 10,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: RADIUS.pill,
    },
    rolePillText: { color: '#1d4ed8', fontSize: 12, fontWeight: '700' },

    card: {
        margin: 14,
        marginBottom: 0,
        padding: 14,
        borderRadius: RADIUS.card,
        borderWidth: 1,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardIcon: {
        width: 42,
        height: 42,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardContent: { flex: 1 },
    cardLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
    cardValue: { fontSize: 15.5, fontWeight: '700', marginTop: 3 },
    cardSub: { fontSize: 12.5, marginTop: 2 },

    menu: {
        margin: 14,
        marginBottom: 0,
        borderRadius: RADIUS.card,
        borderWidth: 1,
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        gap: 12,
        borderBottomWidth: 1,
    },
    menuText: { flex: 1, fontSize: 15, fontWeight: '500' },

    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        margin: 14,
        marginBottom: 8,
        padding: 15,
        borderRadius: RADIUS.card,
        borderWidth: 1,
    },
    logoutText: { fontSize: 15, fontWeight: '700' },
    version: { textAlign: 'center', fontSize: 11.5, marginTop: 4 },
});
