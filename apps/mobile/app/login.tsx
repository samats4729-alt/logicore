import { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '@/store';
import { BRAND, RADIUS } from '@/lib/theme';

export default function LoginScreen() {
    const { login } = useStore();
    const [phone, setPhone] = useState('+7');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        const cleanPhone = phone.replace(/[\s\-()]/g, '');
        if (!/^(\+7|8)\d{10}$/.test(cleanPhone)) {
            Alert.alert('Проверьте телефон', 'Формат номера: +7XXXXXXXXXX');
            return;
        }
        if (!password) {
            Alert.alert('Введите пароль', 'Пароль для входа выдаёт ваша компания');
            return;
        }

        setLoading(true);
        try {
            await login(cleanPhone, password);
            router.replace('/(tabs)');
        } catch (error: any) {
            Alert.alert(
                'Не удалось войти',
                error.response?.data?.message || 'Проверьте телефон, пароль и подключение к интернету',
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                {/* Бренд-шапка в редакционном стиле лендинга */}
                <View style={styles.hero}>
                    <Text style={styles.brand}>
                        Logi<Text style={styles.brandAccent}>Core</Text>
                    </Text>
                    <Text style={styles.eyebrow}>(ПРИЛОЖЕНИЕ ВОДИТЕЛЯ)</Text>
                    <Text style={styles.title}>Рейс под {'\n'}контролем.</Text>
                    <Text style={styles.subtitle}>
                        Маршрут, статусы и документы вашего рейса — в одном приложении.
                    </Text>
                </View>

                {/* Карточка входа */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Вход для водителя</Text>
                    <Text style={styles.cardSub}>Телефон и пароль выдаёт ваша компания</Text>

                    <View style={styles.inputWrap}>
                        <Ionicons name="call-outline" size={18} color="#8a91a0" />
                        <TextInput
                            style={styles.input}
                            placeholder="+7 700 123 45 67"
                            placeholderTextColor="#b0b6c3"
                            keyboardType="phone-pad"
                            value={phone}
                            onChangeText={setPhone}
                            autoCapitalize="none"
                            editable={!loading}
                        />
                    </View>

                    <View style={styles.inputWrap}>
                        <Ionicons name="lock-closed-outline" size={18} color="#8a91a0" />
                        <TextInput
                            style={styles.input}
                            placeholder="Пароль"
                            placeholderTextColor="#b0b6c3"
                            secureTextEntry={!showPassword}
                            value={password}
                            onChangeText={setPassword}
                            autoCapitalize="none"
                            editable={!loading}
                            onSubmitEditing={handleLogin}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#8a91a0" />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.button, loading && { opacity: 0.7 }]}
                        onPress={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Text style={styles.buttonText}>Войти</Text>
                                <Ionicons name="arrow-forward" size={18} color="#fff" />
                            </>
                        )}
                    </TouchableOpacity>

                    <Text style={styles.hint}>
                        Нет доступа? Обратитесь к диспетчеру вашей компании — он выдаст пароль в карточке водителя.
                    </Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#030712',
    },
    scroll: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 20,
        paddingTop: 72,
    },
    hero: {
        marginBottom: 28,
    },
    brand: {
        fontSize: 20,
        fontWeight: '800',
        color: '#ffffff',
        letterSpacing: -0.5,
        marginBottom: 26,
    },
    brandAccent: {
        color: BRAND.primary,
    },
    eyebrow: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 4,
        color: 'rgba(255,255,255,0.45)',
        marginBottom: 12,
    },
    title: {
        fontSize: 34,
        fontWeight: '800',
        color: '#ffffff',
        letterSpacing: -1,
        lineHeight: 38,
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 14,
        lineHeight: 21,
        color: 'rgba(255,255,255,0.55)',
        maxWidth: 300,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: RADIUS.card + 4,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.45,
        shadowRadius: 40,
        elevation: 12,
    },
    cardTitle: {
        fontSize: 19,
        fontWeight: '800',
        color: '#0b0d12',
        letterSpacing: -0.3,
    },
    cardSub: {
        fontSize: 12.5,
        color: '#6b7280',
        marginTop: 4,
        marginBottom: 18,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: RADIUS.button,
        paddingHorizontal: 14,
        height: 52,
        marginBottom: 12,
        backgroundColor: '#fafbfc',
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: '#0b0d12',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: BRAND.primary,
        borderRadius: RADIUS.button,
        height: 52,
        marginTop: 4,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
    hint: {
        fontSize: 12,
        lineHeight: 17,
        color: '#8a91a0',
        marginTop: 16,
        textAlign: 'center',
    },
});
