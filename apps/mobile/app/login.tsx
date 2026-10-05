import { useEffect, useState } from 'react';
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
import * as SecureStore from '@/lib/secure';
import { GOOGLE_WEB_CLIENT_ID, isExchangeDriver, useStore } from '@/store';
import { api, setAuthToken } from '@/lib/api';
import { exchangeApi, ответ } from '@/lib/exchange';
import { BRAND, RADIUS } from '@/lib/theme';

export default function LoginScreen() {
    const { login, loginWithGoogle } = useStore();
    const [phone, setPhone] = useState('+7');
    /* Биржа включена на сервере — показываем вход водителя биржи. Старый
       сервер без биржи ответит «нет», и раздела не будет вовсе. */
    const [exchangeOn, setExchangeOn] = useState(false);
    const [googleBusy, setGoogleBusy] = useState(false);
    const [devToken, setDevToken] = useState('');

    useEffect(() => {
        exchangeApi.publicStatus().then(setExchangeOn);
    }, []);

    const handleGoogle = async () => {
        setGoogleBusy(true);
        try {
            const ok = await loginWithGoogle();
            if (ok) router.replace('/exchange');
        } catch (error: any) {
            Alert.alert('Не удалось войти через Google', ответ(error, error?.message || 'Попробуйте ещё раз'));
        } finally {
            setGoogleBusy(false);
        }
    };

    /** Только в тестовой сборке: вход по пропуску со стенда разработчика. */
    const handleDevToken = async () => {
        try {
            await setAuthToken(devToken.trim());
            const { data: user } = await api.post('/auth/me');
            await SecureStore.setItemAsync('user', JSON.stringify(user));
            useStore.setState({ user, isAuthenticated: true });
            router.replace(isExchangeDriver(user) ? '/exchange' : '/(tabs)');
        } catch (error: any) {
            Alert.alert('Пропуск не подошёл', ответ(error, 'Проверьте пропуск'));
        }
    };
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

                {exchangeOn && !!GOOGLE_WEB_CLIENT_ID && (
                    <View style={styles.exchangeCard}>
                        <Text style={styles.exchangeEyebrow}>БИРЖА ГРУЗОВ</Text>
                        <Text style={styles.exchangeTitle}>Работаете сами?</Text>
                        <Text style={styles.exchangeText}>
                            Со своим ИП или через парк — берите грузы с биржи. Регистрация займёт 5 минут.
                        </Text>
                        <TouchableOpacity
                            style={[styles.googleButton, googleBusy && { opacity: 0.7 }]}
                            onPress={handleGoogle}
                            disabled={googleBusy}
                            accessibilityLabel="Войти через Google"
                        >
                            {googleBusy ? <ActivityIndicator color="#0b0d12" /> : (
                                <>
                                    <Ionicons name="logo-google" size={18} color="#0b0d12" />
                                    <Text style={styles.googleText}>Войти через Google</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

                {__DEV__ && (
                    <View style={styles.devBox}>
                        <Text style={styles.devTitle}>Тестовая сборка: вход по пропуску</Text>
                        <TextInput
                            style={styles.devInput}
                            placeholder="Пропуск со стенда"
                            placeholderTextColor="#6b7280"
                            value={devToken}
                            onChangeText={setDevToken}
                            autoCapitalize="none"
                        />
                        <TouchableOpacity onPress={handleDevToken} style={styles.devButton}>
                            <Text style={styles.devButtonText}>Войти</Text>
                        </TouchableOpacity>
                    </View>
                )}
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
    exchangeCard: {
        marginTop: 14,
        borderRadius: RADIUS.card + 4,
        padding: 22,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    exchangeEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 3, color: 'rgba(255,255,255,0.45)' },
    exchangeTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', marginTop: 8, letterSpacing: -0.4 },
    exchangeText: { fontSize: 13.5, lineHeight: 19, color: 'rgba(255,255,255,0.6)', marginTop: 6, marginBottom: 16 },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        height: 52,
        borderRadius: RADIUS.button,
        backgroundColor: '#ffffff',
    },
    googleText: { color: '#0b0d12', fontSize: 16, fontWeight: '700' },
    devBox: { marginTop: 14, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#374151', borderStyle: 'dashed' },
    devTitle: { color: '#9ca3af', fontSize: 12, marginBottom: 8 },
    devInput: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#374151', color: '#fff', paddingHorizontal: 10, fontSize: 12 },
    devButton: { marginTop: 8, height: 40, borderRadius: 10, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
    devButtonText: { color: '#fff', fontWeight: '700' },
});
