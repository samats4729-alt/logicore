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
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from '@/lib/secure';
import { GOOGLE_WEB_CLIENT_ID, isExchangeDriver, useStore } from '@/store';
import { api, setAuthToken } from '@/lib/api';
import { exchangeApi, ответ } from '@/lib/exchange';
import { FONT, RADIUS } from '@/lib/theme';

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
            {/* Фон экрана тёмный — значки часов и батареи светлые, иначе их не видно. */}
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                {/* Бренд-шапка в редакционном стиле лендинга logicore.kz */}
                <View style={styles.hero}>
                    <View style={styles.brandRow}>
                        <Image source={require('../assets/logo-mark-white.png')} style={styles.brandMark} resizeMode="contain" accessibilityLabel="Знак LogiCore" />
                        <Text style={styles.brand}>LogiCore</Text>
                    </View>
                    <Text style={styles.eyebrow}>(01 — Приложение водителя)</Text>
                    <Text style={styles.title}>Рейс{'\n'}под контролем.</Text>
                    <Text style={styles.subtitle}>
                        Маршрут, статусы и документы вашего рейса — в одном приложении.
                    </Text>
                </View>

                {/* Карточка входа */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Вход для водителя</Text>
                    <Text style={styles.cardSub}>Телефон и пароль выдаёт ваша компания</Text>

                    <Text style={styles.fieldLabel}>Телефон</Text>
                    <View style={styles.inputWrap}>
                        <Ionicons name="call-outline" size={18} color="#868e9c" />
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

                    <Text style={styles.fieldLabel}>Пароль</Text>
                    <View style={styles.inputWrap}>
                        <Ionicons name="lock-closed-outline" size={18} color="#868e9c" />
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
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8} accessibilityLabel={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>
                            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#868e9c" />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.button, loading && { opacity: 0.7 }]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.88}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Text style={styles.buttonText}>Войти</Text>
                                <View style={styles.buttonArrow}>
                                    <Ionicons name="arrow-forward" size={16} color="#0b0d12" />
                                </View>
                            </>
                        )}
                    </TouchableOpacity>

                    <View style={styles.hintRow}>
                        <Ionicons name="information-circle-outline" size={16} color="#868e9c" />
                        <Text style={styles.hint}>
                            Нет доступа? Обратитесь к диспетчеру вашей компании — он выдаст пароль в карточке водителя.
                        </Text>
                    </View>
                </View>

                {exchangeOn && !!GOOGLE_WEB_CLIENT_ID && (
                    <View style={styles.exchangeCard}>
                        <Text style={styles.exchangeEyebrow}>(02 — Биржа грузов)</Text>
                        <Text style={styles.exchangeTitle}>Работаете сами?</Text>
                        <Text style={styles.exchangeText}>
                            Со своим ИП или через парк — берите грузы с биржи. Регистрация займёт 5 минут.
                        </Text>
                        <TouchableOpacity
                            style={[styles.googleButton, googleBusy && { opacity: 0.7 }]}
                            onPress={handleGoogle}
                            disabled={googleBusy}
                            accessibilityLabel="Войти через Google"
                            activeOpacity={0.88}
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

                <Text style={styles.footer}>© LogiCore · logicore.kz</Text>
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
        paddingTop: 64,
        paddingBottom: 28,
    },
    hero: {
        marginBottom: 28,
        paddingHorizontal: 4,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 40,
    },
    brandMark: {
        width: 32,
        height: 30,
    },
    brand: {
        fontFamily: FONT.display,
        fontSize: 18,
        color: '#ffffff',
        letterSpacing: -0.6,
    },
    eyebrow: {
        fontFamily: FONT.displayMedium,
        fontSize: 10.5,
        letterSpacing: 0.6,
        color: 'rgba(255,255,255,0.45)',
        marginBottom: 14,
    },
    title: {
        fontFamily: FONT.display,
        fontSize: 34,
        color: '#ffffff',
        letterSpacing: -1.6,
        lineHeight: 40,
        marginBottom: 14,
    },
    subtitle: {
        fontFamily: FONT.regular,
        fontSize: 15,
        lineHeight: 22,
        color: 'rgba(255,255,255,0.58)',
        maxWidth: 310,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 26,
        padding: 22,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.5,
        shadowRadius: 40,
        elevation: 12,
    },
    cardTitle: {
        fontFamily: FONT.display,
        fontSize: 18,
        color: '#0b0d12',
        letterSpacing: -0.7,
    },
    cardSub: {
        fontFamily: FONT.regular,
        fontSize: 13,
        color: '#868e9c',
        marginTop: 5,
        marginBottom: 18,
    },
    fieldLabel: {
        fontFamily: FONT.medium,
        fontSize: 12.5,
        color: '#4c5460',
        marginBottom: 7,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderColor: '#e6e8ec',
        borderRadius: RADIUS.input,
        paddingHorizontal: 14,
        height: 54,
        marginBottom: 14,
        backgroundColor: '#f7f8fa',
    },
    input: {
        flex: 1,
        fontFamily: FONT.regular,
        fontSize: 16,
        color: '#0b0d12',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: '#0b0d12',
        borderRadius: RADIUS.button,
        height: 56,
        marginTop: 6,
    },
    buttonText: {
        fontFamily: FONT.semibold,
        color: '#ffffff',
        fontSize: 16,
        letterSpacing: -0.2,
    },
    buttonArrow: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    hintRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#f7f8fa',
    },
    hint: {
        flex: 1,
        fontFamily: FONT.regular,
        fontSize: 12.5,
        lineHeight: 18,
        color: '#4c5460',
    },
    exchangeCard: {
        marginTop: 14,
        borderRadius: 26,
        padding: 22,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    exchangeEyebrow: { fontFamily: FONT.displayMedium, fontSize: 10.5, letterSpacing: 0.6, color: 'rgba(255,255,255,0.45)' },
    exchangeTitle: { fontFamily: FONT.display, fontSize: 20, color: '#ffffff', marginTop: 10, letterSpacing: -0.8 },
    exchangeText: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.6)', marginTop: 6, marginBottom: 16 },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        height: 54,
        borderRadius: RADIUS.button,
        backgroundColor: '#ffffff',
    },
    googleText: { fontFamily: FONT.semibold, color: '#0b0d12', fontSize: 16 },
    devBox: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#374151', borderStyle: 'dashed' },
    devTitle: { fontFamily: FONT.regular, color: '#9ca3af', fontSize: 12, marginBottom: 8 },
    devInput: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#374151', color: '#fff', paddingHorizontal: 10, fontSize: 12 },
    devButton: { marginTop: 8, height: 40, borderRadius: 10, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
    devButtonText: { fontFamily: FONT.semibold, color: '#fff' },
    footer: { fontFamily: FONT.regular, fontSize: 11.5, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 24 },
});
