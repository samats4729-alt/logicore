import { useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GOOGLE_WEB_CLIENT_ID, useStore } from '@/store';
import { exchangeApi, ответ } from '@/lib/exchange';
import { FONT, RADIUS } from '@/lib/theme';
import { DRIVER_KINDS } from '@/lib/driver-kinds';

type Kind = 'PARK' | 'IP';

/** Как на сервере (auth/password-policy.ts) — чтобы не узнавать об этом после отправки. */
const MIN_PASSWORD = 8;

/**
 * Регистрация водителя биржи (владелец, 13.10.2026: «кнопка „Регистрация“
 * под кнопкой „Войти“, и там выбираешь — и сбор информации»).
 *
 * Главный путь — номер телефона и пароль (задача от 14.10.2026). Пока без
 * подтверждения по СМС: сервис рассылки ещё не выбран, номер проверяет парк
 * звонком перед допуском. Когда СМС появится, между «Зарегистрироваться» и
 * анкетой встанет шаг с кодом. Google остаётся вторым путём для тех, кому так
 * удобнее. После регистрации выбор «парк / ИП» уже записан в анкету, и она
 * открывается с первого шага: о себе, машина, парк, фото, договор.
 */
export default function RegisterScreen() {
    const insets = useSafeAreaInsets();
    const registerByPhone = useStore((s) => s.registerByPhone);
    const loginWithGoogle = useStore((s) => s.loginWithGoogle);
    const [kind, setKind] = useState<Kind>('PARK');
    const [phone, setPhone] = useState('+7');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState<'phone' | 'google' | null>(null);

    const failed = (error: any) => {
        const text = ответ(error, error?.message || 'Проверьте интернет и попробуйте ещё раз');
        // Номер уже есть — человеку нужен вход, а не повтор регистрации.
        if (/уже (есть|зарегистрирован)/.test(text)) {
            Alert.alert('Номер уже зарегистрирован', text, [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Войти', onPress: () => router.replace('/login') },
            ]);
            return;
        }
        Alert.alert('Не удалось зарегистрироваться', text);
    };

    const registerPhone = async () => {
        const cleanPhone = phone.replace(/[\s\-()]/g, '');
        if (!/^(\+7|8)\d{10}$/.test(cleanPhone)) {
            Alert.alert('Проверьте номер', 'Казахстанский мобильный, например +7 701 123 45 67');
            return;
        }
        if (password.length < MIN_PASSWORD) {
            Alert.alert('Пароль короткий', `Нужно не меньше ${MIN_PASSWORD} символов`);
            return;
        }
        setBusy('phone');
        try {
            await registerByPhone(cleanPhone, password, kind);
            router.replace('/exchange');
        } catch (error: any) {
            failed(error);
        } finally {
            setBusy(null);
        }
    };

    const registerGoogle = async () => {
        setBusy('google');
        try {
            const ok = await loginWithGoogle();
            if (!ok) return;
            // Выбор с этого экрана — в анкету, если человек её ещё не заполнял.
            // Уже зарегистрированного не трогаем: он просто вошёл.
            try {
                const me = await exchangeApi.me();
                if (!me.kind) await exchangeApi.update({ kind });
            } catch { /* анкета спросит сама */ }
            router.replace('/exchange');
        } catch (error: any) {
            failed(error);
        } finally {
            setBusy(null);
        }
    };

    const steps = kind === 'PARK'
        ? ['Номер и пароль — ваш вход в приложение.', 'Анкета: о себе, машина, парк, фото документов, договор с парком.', 'Парк позвонит, проверит анкету и допустит — откроются грузы.']
        : ['Номер и пароль — ваш вход в приложение.', 'Анкета: о себе, ИП и машина.', 'Отправите анкету — откроются грузы.'];

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
                keyboardShouldPersistTaps="handled"
            >
                <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Назад ко входу" style={styles.back}>
                    <Ionicons name="arrow-back" size={22} color="#ffffff" />
                </Pressable>

                <Text style={styles.eyebrow}>(02 — Регистрация)</Text>
                <Text style={styles.title}>Работаете{'\n'}сами?</Text>
                <Text style={styles.subtitle}>
                    Регистрация водителя биржи — 5 минут. Вход — по номеру телефона и паролю.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Как вы будете работать</Text>
                    {DRIVER_KINDS.map((k) => {
                        const on = kind === k.kind;
                        return (
                            <Pressable
                                key={k.kind}
                                onPress={() => setKind(k.kind)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                style={[styles.choice, on && styles.choiceOn]}
                            >
                                <View style={[styles.choiceIcon, on && styles.choiceIconOn]}>
                                    <Ionicons name={k.icon} size={20} color={on ? '#ffffff' : '#0b0d12'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.choiceTitle}>{k.title}</Text>
                                    <Text style={styles.choiceText}>{k.text}</Text>
                                </View>
                                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? '#0b0d12' : '#b0b6c3'} />
                            </Pressable>
                        );
                    })}

                    <Text style={[styles.cardTitle, { marginTop: 14 }]}>Ваш вход</Text>
                    <Text style={styles.fieldLabel}>Номер телефона</Text>
                    <View style={styles.inputWrap}>
                        <Ionicons name="call-outline" size={18} color="#868e9c" />
                        <TextInput
                            style={styles.input}
                            placeholder="+7 700 123 45 67"
                            placeholderTextColor="#b0b6c3"
                            keyboardType="phone-pad"
                            textContentType="telephoneNumber"
                            autoComplete="tel"
                            value={phone}
                            onChangeText={setPhone}
                            editable={!busy}
                            accessibilityLabel="Номер телефона"
                        />
                    </View>

                    <Text style={styles.fieldLabel}>Придумайте пароль</Text>
                    <View style={styles.inputWrap}>
                        <Ionicons name="lock-closed-outline" size={18} color="#868e9c" />
                        <TextInput
                            style={styles.input}
                            placeholder={`Не меньше ${MIN_PASSWORD} символов`}
                            placeholderTextColor="#b0b6c3"
                            secureTextEntry={!showPassword}
                            textContentType="newPassword"
                            autoComplete="password-new"
                            autoCapitalize="none"
                            value={password}
                            onChangeText={setPassword}
                            editable={!busy}
                            onSubmitEditing={registerPhone}
                            accessibilityLabel="Пароль"
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8} accessibilityLabel={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>
                            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#868e9c" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.fieldHint}>Запомните его — по номеру и паролю вы будете входить в приложение.</Text>

                    <TouchableOpacity
                        style={[styles.button, !!busy && { opacity: 0.7 }]}
                        onPress={registerPhone}
                        disabled={!!busy}
                        accessibilityRole="button"
                        accessibilityLabel="Зарегистрироваться"
                        activeOpacity={0.88}
                    >
                        {busy === 'phone' ? <ActivityIndicator color="#ffffff" /> : (
                            <>
                                <Text style={styles.buttonText}>Зарегистрироваться</Text>
                                <View style={styles.buttonArrow}>
                                    <Ionicons name="arrow-forward" size={16} color="#0b0d12" />
                                </View>
                            </>
                        )}
                    </TouchableOpacity>

                    {!!GOOGLE_WEB_CLIENT_ID && (
                        <>
                            <View style={styles.orRow}>
                                <View style={styles.orLine} />
                                <Text style={styles.orText}>или</Text>
                                <View style={styles.orLine} />
                            </View>
                            <TouchableOpacity
                                style={[styles.secondaryButton, !!busy && { opacity: 0.7 }]}
                                onPress={registerGoogle}
                                disabled={!!busy}
                                accessibilityRole="button"
                                accessibilityLabel="Зарегистрироваться через Google"
                                activeOpacity={0.88}
                            >
                                {busy === 'google' ? <ActivityIndicator color="#0b0d12" /> : (
                                    <>
                                        <Ionicons name="logo-google" size={18} color="#0b0d12" />
                                        <Text style={styles.secondaryText}>Через Google</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </>
                    )}

                    <Text style={[styles.cardTitle, { marginTop: 22 }]}>Что дальше</Text>
                    {steps.map((s, i) => (
                        <View key={i} style={styles.step}>
                            <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                            <Text style={styles.stepText}>{s}</Text>
                        </View>
                    ))}
                    {kind === 'PARK' && (
                        <View style={styles.note}>
                            <Ionicons name="link-outline" size={16} color="#868e9c" />
                            <Text style={styles.noteText}>
                                Есть приглашение от парка? Откройте ссылку из сообщения — парк подставится сам. Или введите код парка в анкете.
                            </Text>
                        </View>
                    )}
                </View>

                <Pressable onPress={() => router.replace('/login')} accessibilityRole="button" style={styles.loginLink}>
                    <Text style={styles.loginLinkText}>Уже зарегистрированы? <Text style={{ color: '#ffffff', fontFamily: FONT.semibold }}>Войти</Text></Text>
                </Pressable>
                <Text style={styles.footer}>
                    Водитель компании? Регистрироваться не нужно — телефон и пароль выдаёт диспетчер.
                </Text>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

/* Поля, кнопки и «или» — те же размеры и цвета, что на экране входа: два
   соседних экрана одного сценария должны выглядеть одним продуктом. */
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#030712' },
    scroll: { paddingHorizontal: 20 },
    back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 18 },
    eyebrow: { fontFamily: FONT.displayMedium, fontSize: 11, letterSpacing: 0.6, color: 'rgba(255,255,255,0.45)' },
    title: { fontFamily: FONT.display, fontSize: 34, lineHeight: 38, color: '#ffffff', letterSpacing: -1.4, marginTop: 10 },
    subtitle: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.58)', marginTop: 10, marginBottom: 20 },
    card: { backgroundColor: '#ffffff', borderRadius: 26, padding: 20 },
    cardTitle: { fontFamily: FONT.display, fontSize: 17, color: '#0b0d12', letterSpacing: -0.6, marginBottom: 10 },
    choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#e6e8ec', marginBottom: 10, backgroundColor: '#ffffff' },
    choiceOn: { borderColor: '#0b0d12', borderWidth: 1.5, backgroundColor: '#f7f8fa' },
    choiceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f2f5' },
    choiceIconOn: { backgroundColor: '#0b0d12' },
    choiceTitle: { fontFamily: FONT.semibold, fontSize: 16, color: '#0b0d12' },
    choiceText: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, color: '#4c5460', marginTop: 2 },
    fieldLabel: { fontFamily: FONT.medium, fontSize: 12.5, color: '#4c5460', marginBottom: 7 },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#e6e8ec', borderRadius: RADIUS.input,
        paddingHorizontal: 14, height: 54, marginBottom: 14, backgroundColor: '#f7f8fa',
    },
    input: { flex: 1, fontFamily: FONT.regular, fontSize: 16, color: '#0b0d12' },
    fieldHint: { fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: '#868e9c', marginTop: -6, marginBottom: 4 },
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, height: 56, borderRadius: RADIUS.button, backgroundColor: '#0b0d12', marginTop: 14 },
    buttonText: { fontFamily: FONT.semibold, color: '#ffffff', fontSize: 16, letterSpacing: -0.2 },
    buttonArrow: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
    orLine: { flex: 1, height: 1, backgroundColor: '#eceef2' },
    orText: { fontFamily: FONT.regular, fontSize: 12.5, color: '#9aa1ad' },
    secondaryButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54,
        borderRadius: RADIUS.button, borderWidth: 1, borderColor: '#dfe2e7', backgroundColor: '#ffffff',
    },
    secondaryText: { fontFamily: FONT.semibold, color: '#0b0d12', fontSize: 16 },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
    stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0d12', marginTop: 1 },
    stepNumText: { fontFamily: FONT.semibold, fontSize: 12, color: '#ffffff' },
    stepText: { flex: 1, fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: '#0b0d12' },
    note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#f7f8fa', marginTop: 6 },
    noteText: { flex: 1, fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: '#4c5460' },
    loginLink: { alignItems: 'center', paddingVertical: 16 },
    loginLinkText: { fontFamily: FONT.regular, fontSize: 14.5, color: 'rgba(255,255,255,0.6)' },
    footer: { fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingHorizontal: 12 },
});
