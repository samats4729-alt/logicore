import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/store';
import { exchangeApi, ответ } from '@/lib/exchange';
import { FONT, RADIUS } from '@/lib/theme';

type Kind = 'PARK' | 'IP';

const KINDS: { kind: Kind; icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
    {
        kind: 'PARK',
        icon: 'business-outline',
        title: 'Через парк',
        text: 'Без ИП. Парк заключит с вами договор, заплатит налоги и переведёт деньги. Нужны фото документов.',
    },
    {
        kind: 'IP',
        icon: 'briefcase-outline',
        title: 'Со своим ИП',
        text: 'Вы сами себе перевозчик — фото документов для допуска не нужны.',
    },
];

/**
 * Регистрация водителя биржи (владелец, 13.10.2026: «кнопка „Регистрация“
 * под кнопкой „Войти“, и там выбираешь — и сбор информации»).
 *
 * Здесь — выбор, как человек будет работать, и что его ждёт дальше. Аккаунт —
 * его Google: пароль придумывать не нужно, а вход по СМС ждёт выбора
 * платного сервиса (решение владельца). После входа выбор записывается в
 * анкету, и она открывается с первого шага — дальше всё как было: о себе,
 * машина, парк, фото документов, договор, проверка парком.
 */
export default function RegisterScreen() {
    const insets = useSafeAreaInsets();
    const loginWithGoogle = useStore((s) => s.loginWithGoogle);
    const [kind, setKind] = useState<Kind>('PARK');
    const [busy, setBusy] = useState(false);

    const register = async () => {
        setBusy(true);
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
            Alert.alert('Не удалось зарегистрироваться', ответ(error, error?.message || 'Попробуйте ещё раз'));
        } finally {
            setBusy(false);
        }
    };

    const steps = kind === 'PARK'
        ? ['Вход через Google — это ваш аккаунт в приложении.', 'Анкета: о себе, машина, парк, фото документов, договор с парком.', 'Парк проверит анкету и допустит — откроются грузы.']
        : ['Вход через Google — это ваш аккаунт в приложении.', 'Анкета: о себе, ИП и машина.', 'Отправите анкету — откроются грузы.'];

    return (
        <View style={styles.root}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
                <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Назад ко входу" style={styles.back}>
                    <Ionicons name="arrow-back" size={22} color="#ffffff" />
                </Pressable>

                <Text style={styles.eyebrow}>(02 — Регистрация)</Text>
                <Text style={styles.title}>Работаете{'\n'}сами?</Text>
                <Text style={styles.subtitle}>
                    Регистрация водителя биржи — 5 минут. Аккаунт — ваш Google, пароль придумывать не нужно.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Как вы будете работать</Text>
                    {KINDS.map((k) => {
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

                    <Text style={[styles.cardTitle, { marginTop: 18 }]}>Что дальше</Text>
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

                    <TouchableOpacity
                        style={[styles.button, busy && { opacity: 0.7 }]}
                        onPress={register}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel="Зарегистрироваться через Google"
                        activeOpacity={0.88}
                    >
                        {busy ? <ActivityIndicator color="#ffffff" /> : (
                            <>
                                <Ionicons name="logo-google" size={18} color="#ffffff" />
                                <Text style={styles.buttonText}>Зарегистрироваться через Google</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                <Pressable onPress={() => router.replace('/login')} accessibilityRole="button" style={styles.loginLink}>
                    <Text style={styles.loginLinkText}>Уже зарегистрированы? <Text style={{ color: '#ffffff', fontFamily: FONT.semibold }}>Войти</Text></Text>
                </Pressable>
                <Text style={styles.footer}>
                    Водитель компании? Регистрироваться не нужно — телефон и пароль выдаёт диспетчер.
                </Text>
            </ScrollView>
        </View>
    );
}

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
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
    stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0d12', marginTop: 1 },
    stepNumText: { fontFamily: FONT.semibold, fontSize: 12, color: '#ffffff' },
    stepText: { flex: 1, fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: '#0b0d12' },
    note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#f7f8fa', marginTop: 6 },
    noteText: { flex: 1, fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: '#4c5460' },
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: RADIUS.button, backgroundColor: '#0b0d12', marginTop: 18 },
    buttonText: { fontFamily: FONT.semibold, color: '#ffffff', fontSize: 16, letterSpacing: -0.2 },
    loginLink: { alignItems: 'center', paddingVertical: 16 },
    loginLinkText: { fontFamily: FONT.regular, fontSize: 14.5, color: 'rgba(255,255,255,0.6)' },
    footer: { fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingHorizontal: 12 },
});
