import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIntro, type Measurable } from '@/lib/intro';
import { SPLASH_BASE } from '@/lib/iridescence';
import { FONT } from '@/lib/theme';
import { useStore } from '@/store';
import { Iridescence } from '@/components/Iridescence';

const MARK = require('../assets/logo-mark-white.png');
/** Пропорции знака (ширина к высоте), как у картинки. */
const MARK_RATIO = 602 / 559;
const MARK_W = 62;
const DISC = 128;

/** Сколько заставка видна как минимум: меньше — мелькнёт и не прочитается. */
const MIN_SHOW_MS = 1900;
/** Сколько ждать, пока приложение решит, куда вести (вход или рейс). */
const READY_TIMEOUT_MS = 2500;

/**
 * Заставка при запуске (задача владельца, 14.10.2026: «как в CashCraft»).
 *
 * 1. Живой переливающийся фон в цветах LogiCore, по центру — знак в стеклянной
 *    плашке, под ним надпись и строка «Рейс под контролем», внизу — тонкая
 *    полоса загрузки. Под заставкой тем временем грузятся шрифты, проверяется
 *    вход и открывается нужный экран.
 * 2. Передача экрану входа: знак летит на своё место в шапке, всё остальное
 *    растворяется, экран входа проявляется. Если водитель уже вошёл — знак
 *    мягко уходит, открывается его рейс.
 *
 * Раньше здесь был видеоролик (полёт над Алматы) — он весил 3 МБ и на слабых
 * телефонах стартовал с задержкой.
 */
export function IntroSplash({ onDone, fontsReady }: { onDone: () => void; fontsReady: boolean }) {
    const insets = useSafeAreaInsets();
    const markRef = useRef<Measurable>(null);
    const [handing, setHanding] = useState(false);
    const [flight, setFlight] = useState({ dx: 0, dy: 0, scale: 1 });

    const appear = useRef(new Animated.Value(0)).current;
    const text = useRef(new Animated.Value(0)).current;
    const progress = useRef(new Animated.Value(0)).current;
    // Перелёт знака: 0 — в плашке, 1 — на месте знака экрана входа.
    const fly = useRef(new Animated.Value(0)).current;
    // Всё, кроме знака: фон, плашка, надписи — растворяются при передаче.
    const veil = useRef(new Animated.Value(1)).current;
    const markFade = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.timing(appear, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        const loop = Animated.loop(
            Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        );
        loop.start();
        const t = setTimeout(waitAndHandoff, MIN_SHOW_MS);
        return () => { loop.stop(); clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Надписи — когда загрузились шрифты, иначе мелькнёт системный шрифт.
    useEffect(() => {
        if (!fontsReady) return;
        Animated.timing(text, { toValue: 1, duration: 700, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, [fontsReady, text]);

    /** Ждём, пока приложение поймёт, куда вести, и экран входа сообщит, где у него знак. */
    const waitAndHandoff = () => {
        const started = Date.now();
        const tick = () => {
            const { isLoading, isAuthenticated } = useStore.getState();
            const { target } = useIntro.getState();
            const ready = !isLoading && (isAuthenticated || target !== null);
            if (ready || Date.now() - started > READY_TIMEOUT_MS) handoff();
            else setTimeout(tick, 80);
        };
        tick();
    };

    const handoff = () => {
        const { target } = useIntro.getState();
        const loggedIn = useStore.getState().isAuthenticated;
        useIntro.getState().setState('handoff');
        setHanding(true);

        const mark = markRef.current;
        if (target && !loggedIn && mark) {
            // Знак летит из плашки в шапку входа и там уменьшается до своего размера.
            mark.measureInWindow((x: number, y: number, w: number, h: number) => {
                setFlight({
                    dx: target.x + target.width / 2 - (x + w / 2),
                    dy: target.y + target.height / 2 - (y + h / 2),
                    scale: w > 0 ? target.width / w : 1,
                });
                requestAnimationFrame(() => requestAnimationFrame(() =>
                    Animated.parallel([
                        Animated.timing(fly, { toValue: 1, duration: 760, easing: Easing.bezier(0.65, 0, 0.25, 1), useNativeDriver: true }),
                        Animated.timing(veil, { toValue: 0, duration: 560, delay: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                    ]).start(finish),
                ));
            });
        } else {
            // Водитель уже вошёл: знак уменьшается и тает, заставка растворяется.
            setFlight({ dx: 0, dy: 0, scale: 0.7 });
            requestAnimationFrame(() => requestAnimationFrame(() =>
                Animated.parallel([
                    Animated.timing(fly, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
                    Animated.timing(markFade, { toValue: 0, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
                    Animated.timing(veil, { toValue: 0, duration: 560, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                ]).start(finish),
            ));
        }
    };

    const finish = () => {
        useIntro.getState().setState('done');
        onDone();
    };

    const rise = (v: InstanceType<typeof Animated.Value>, dy: number) => ({
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }],
    });

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents={handing ? 'none' : 'auto'}>
            <StatusBar style="light" />

            <Animated.View style={[StyleSheet.absoluteFill, { opacity: veil, backgroundColor: SPLASH_BASE }]}>
                <Iridescence />
            </Animated.View>

            <View style={styles.center} pointerEvents="none">
                <View style={styles.discBox}>
                <Animated.View
                    style={[StyleSheet.absoluteFill, styles.disc, {
                        opacity: Animated.multiply(appear, veil),
                        transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
                    }]}
                />
                {/* Знак — отдельно от плашки: при передаче он улетает, а плашка тает на месте. */}
                <Animated.View
                    style={[styles.markWrap, {
                        opacity: Animated.multiply(appear, markFade),
                        transform: [
                            { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, flight.dx] }) },
                            { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, flight.dy] }) },
                            { scale: fly.interpolate({ inputRange: [0, 1], outputRange: [1, flight.scale] }) },
                        ],
                    }]}
                >
                    <View ref={markRef} collapsable={false}>
                        <Animated.Image source={MARK} style={styles.mark} resizeMode="contain" accessibilityLabel="LogiCore" />
                    </View>
                </Animated.View>
                </View>

                <Animated.View style={[styles.textBlock, { opacity: Animated.multiply(text, veil) }]}>
                    <Animated.View style={rise(text, 8)}>
                        <Text style={styles.wordmark}>LOGICORE</Text>
                        <Text style={styles.tagline}>Рейс под контролем</Text>
                    </Animated.View>
                </Animated.View>
            </View>

            <Animated.View style={[styles.progressTrack, { bottom: insets.bottom + 64, opacity: veil }]}>
                <Animated.View
                    style={[styles.progressBar, {
                        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-28, 56] }) }],
                    }]}
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    discBox: { width: DISC, height: DISC },
    disc: {
        borderRadius: 40,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    markWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    mark: { width: MARK_W, height: MARK_W / MARK_RATIO },
    textBlock: { marginTop: 32, alignItems: 'center' },
    wordmark: {
        fontFamily: FONT.displayBold,
        fontSize: 19,
        letterSpacing: 8,
        marginRight: -8, // межбуквенный отступ последней буквы не должен сдвигать надпись
        color: '#ffffff',
        textAlign: 'center',
    },
    tagline: { fontFamily: FONT.regular, fontSize: 13.5, color: 'rgba(255,255,255,0.58)', marginTop: 10, textAlign: 'center', letterSpacing: 0.2 },
    progressTrack: {
        position: 'absolute',
        alignSelf: 'center',
        width: 56,
        height: 3,
        borderRadius: 2,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    progressBar: { width: 28, height: 3, borderRadius: 2, backgroundColor: '#ffffff' },
});
