import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function ProfileScreen() {
    const { user, logout } = useStore();
    const { colors, isDark } = useAppTheme();

    const handleLogout = () => {
        Alert.alert(
            'Выход',
            'Вы уверены, что хотите выйти?',
            [
                { text: 'Отмена', style: 'cancel' },
                {
                    text: 'Выйти',
                    style: 'destructive',
                    onPress: async () => {
                        await logout();
                        router.replace('/login');
                    },
                },
            ]
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Avatar */}
            <View style={[styles.avatarContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: isDark ? '#333' : '#e6f4ff' }]}>
                    <Ionicons name="person" size={48} color={colors.primary} />
                </View>
                <Text style={[styles.name, { color: colors.text }]}>
                    {user?.lastName} {user?.firstName}
                </Text>
                <Text style={[styles.phone, { color: colors.textSecondary }]}>{user?.phone}</Text>
            </View>

            {/* Vehicle Info */}
            {user?.vehiclePlate && (
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                    <View style={styles.cardRow}>
                        <Ionicons name="car" size={24} color={colors.primary} />
                        <View style={styles.cardContent}>
                            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Транспорт</Text>
                            <Text style={[styles.cardValue, { color: colors.text }]}>
                                {user.vehicleModel} • {user.vehiclePlate}
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {/* Menu Items */}
            <View style={[styles.menu, { backgroundColor: colors.card }]}>
                <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
                    <Ionicons name="document-text-outline" size={24} color={colors.text} />
                    <Text style={[styles.menuText, { color: colors.text }]}>История рейсов</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.icon} />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
                    <Ionicons name="notifications-outline" size={24} color={colors.text} />
                    <Text style={[styles.menuText, { color: colors.text }]}>Уведомления</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.icon} />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]} onPress={() => router.push('/settings')}>
                    <Ionicons name="settings-outline" size={24} color={colors.text} />
                    <Text style={[styles.menuText, { color: colors.text }]}>Настройки</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.icon} />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItem, { borderBottomColor: 'transparent' }]}>
                    <Ionicons name="help-circle-outline" size={24} color={colors.text} />
                    <Text style={[styles.menuText, { color: colors.text }]}>Помощь</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.icon} />
                </TouchableOpacity>
            </View>

            {/* Logout Button */}
            <TouchableOpacity style={[styles.logoutButton, { backgroundColor: colors.card, borderColor: colors.danger }]} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={24} color={colors.danger} />
                <Text style={[styles.logoutText, { color: colors.danger }]}>Выйти</Text>
            </TouchableOpacity>

            {/* Version */}
            <Text style={[styles.version, { color: colors.textSecondary }]}>Версия 1.0.0</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    avatarContainer: {
        alignItems: 'center',
        paddingVertical: 32,
        borderBottomWidth: 1,
    },
    avatar: {
        width: 96,
        height: 96,
        borderRadius: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    name: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    phone: {
        fontSize: 14,
        marginTop: 4,
    },
    card: {
        margin: 16,
        padding: 16,
        borderRadius: 12,
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    cardContent: {
        flex: 1,
    },
    cardLabel: {
        fontSize: 12,
    },
    cardValue: {
        fontSize: 16,
        fontWeight: '600',
        marginTop: 2,
    },
    menu: {
        marginHorizontal: 16,
        borderRadius: 12,
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
        borderBottomWidth: 1,
    },
    menuText: {
        flex: 1,
        fontSize: 16,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        margin: 16,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: '600',
    },
    version: {
        textAlign: 'center',
        fontSize: 12,
        marginTop: 8,
    },
});
