import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function SettingsScreen() {
    const { mapTheme, setMapTheme } = useStore();
    const { colors } = useAppTheme();

    const options = [
        { label: 'Автоматически (по времени)', value: 'auto', icon: 'time-outline' },
        { label: 'Светлая', value: 'light', icon: 'sunny-outline' },
        { label: 'Темная', value: 'dark', icon: 'moon-outline' },
    ] as const;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>Настройки</Text>
            </View>

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Тема карты</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {options.map((option, index) => (
                        <View key={option.value}>
                            <TouchableOpacity
                                style={styles.option}
                                onPress={() => setMapTheme(option.value)}
                            >
                                <View style={styles.optionLeft}>
                                    <Ionicons name={option.icon} size={24} color={colors.text} />
                                    <Text style={[styles.optionText, { color: colors.text }]}>{option.label}</Text>
                                </View>
                                {mapTheme === option.value && (
                                    <Ionicons name="checkmark" size={24} color={colors.primary} />
                                )}
                            </TouchableOpacity>
                            {index !== options.length - 1 && (
                                <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 52 }} />
                            )}
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        paddingTop: 60,
    },
    backButton: {
        marginRight: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    section: {
        marginTop: 24,
    },
    sectionTitle: {
        fontSize: 14,
        marginLeft: 16,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    card: {
        borderTopWidth: 1,
        borderBottomWidth: 1,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    optionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    optionText: {
        fontSize: 16,
    },
});
