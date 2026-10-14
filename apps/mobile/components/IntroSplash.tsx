import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIntro, type Measurable } from '@/lib/intro';
import { ACCENT, INK, LOGO_BOX, SPLASH_BG } from '@/lib/cargo-splash';
import { FONT } from '@/lib/theme';
import { useStore } from '@/store';
import { CargoMark } from '@/components/CargoMark';

const MARK = require('../assets/logo-mark-white.png');
/** Ширина знака на заставке. */
const MARK_W = 118;
const MARK_H = (MARK_W * LOGO_BOX.h) / LOGO_BOX.w;

/** Когда появляется название: груз уже почти на месте. */
const NAME_AT = 1650;
/** Сколько заставка видна как минимум: вся «погрузка» и пауза, чтобы прочитать название. */
const MIN_SHOW_MS = 2700;
/** Сколько ждать, пока приложение решит, куда вести (вход или рейс). */
const READY_TIMEOUT_MS = 2500;

/**
 * Заставка при запуске — «Погрузка» (выбор владельца, 14.10.2026).
 *
 * 1. Белый экран. Знак LogiCore рисуется контуром, как кузов, заливается,
 *    справа заезжает груз, загорается синяя точка; появляется «LogiCore
 *    Driver · Приложение водителя». Под заставкой тем временем грузятся
 *    шрифты, проверяется вход и открывается нужный экран.
 * 2. Передача экрану входа (он тёмный): знак летит на своё место в шапке и
 *    из чёрного становится белым, белый фон растворяется. Если водитель уже
 *    вошёл — знак и название мягко уходят, открывается его рейс.
 */
export function IntroSplash({ onDone, fontsReady }: { onDone: () => void; fontsReady: boolean }) {
    const { width: W, height: H } = useWindowDimensions();
    const cx = W / 2;
    const cy = Math.round(H * 0.42);
    const markRef = useRef<Measurable>(null);
    const [handing, setHanding] = useState(false);
    const [flight, setFlight] = useState({ dx: 0, dy: 0, scale: 1 });

    const name = useRef(new Animated.Value(0)).current;
    const floor = useRef(new Animated.Value(1)).current;
    // Перелёт знака: 0 — на месте, 1 — в шапке экрана входа.
    const fly = useRef(new Animated.Value(0)).current;
    // Знак из чёрного в белый — на тёмном экране входа он белый.
    const invert = useRef(new Animated.Value(0)).current;
    // Белый фон и всё, кроме знака, — растворяются при передаче.
    const veil = useRef(new Animated.Value(1)).current;
    const markFade = useRef(new Animated.Value(1)).current;
    const mountedAt = useRef(Date.now()).current;

    useEffect(() => {
        Animated.timing(floor, { toValue: 0, duration: 400, delay: 1500, useNativeDriver: true }).start();
        const t = setTimeout(waitAndHandoff, MIN_SHOW_MS);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Название — когда загрузились шрифты, иначе мелькнёт системный шрифт.
    useEffect(() => {
        if (!fontsReady) return;
        const delay = Math.max(0, NAME_AT - (Date.now() - mountedAt));
        Animated.timing(name, { toValue: 1, duration: 650, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, [fontsReady, name, mountedAt]);

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
        // Знак из анимации меняется на картинку того же размера и места — она умеет лететь и белеть.
        setHanding(true);

        if (target && !loggedIn) {
            const go = (x: number, y: number, w: number, h: number) => {
                setFlight({
                    dx: target.x + target.width / 2 - (x + w / 2),
                    dy: target.y + target.height / 2 - (y + h / 2),
                    scale: w > 0 ? target.width / w : 1,
                });
                requestAnimationFrame(() => requestAnimationFrame(() =>
                    Animated.parallel([
                        Animated.timing(fly, { toValue: 1, duration: 760, easing: Easing.bezier(0.65, 0, 0.25, 1), useNativeDriver: true }),
                        Animated.timing(invert, { toValue: 1, duration: 420, delay: 120, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
                        Animated.timing(veil, { toValue: 0, duration: 520, delay: 80, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                    ]).start(finish),
                ));
            };
            // Картинка знака появится в следующем кадре — тогда и меряем, где она.
            requestAnimationFrame(() => {
                const mark = markRef.current;
                if (mark) mark.measureInWindow(go);
                else go(cx - MARK_W / 2, cy - MARK_H / 2, MARK_W, MARK_H);
            });
        } else {
            // Водитель уже вошёл: под заставкой светлый экран рейса — знак и название просто уходят.
            setFlight({ dx: 0, dy: 0, scale: 0.8 });
            requestAnimationFrame(() => requestAnimationFrame(() =>
                Animated.parallel([
                    Animated.timing(fly, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
                    Animated.timing(markFade, { toValue: 0, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
                    Animated.timing(veil, { toValue: 0, duration: 520, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                ]).start(finish),
            ));
        }
    };

    const finish = () => {
        useIntro.getState().setState('done');
        onDone();
    };

    const markMove = {
        transform: [
            { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, flight.dx] }) },
            { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, flight.dy] }) },
            { scale: fly.interpolate({ inputRange: [0, 1], outputRange: [1, flight.scale] }) },
        ],
    };

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents={handing ? 'none' : 'auto'}>
            <StatusBar style={handing ? 'light' : 'dark'} />
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_BG, opacity: veil }]} />

            {/* Пол «склада» под знаком — уходит, когда груз встал на место. */}
            <Animated.View style={[styles.floor, { top: cy + 70, left: cx - 135, opacity: floor }]} />

            {!handing && <CargoMark cx={cx} cy={cy} width={MARK_W} screenWidth={W} screenHeight={H} />}

            {handing && (
                <Animated.View
                    pointerEvents="none"
                    style={[styles.mark, { left: cx - MARK_W / 2, top: cy - MARK_H / 2, opacity: markFade }, markMove]}
                >
                    <View ref={markRef} collapsable={false} style={StyleSheet.absoluteFill}>
                        <Animated.Image
                            source={MARK}
                            resizeMode="contain"
                            style={[styles.markImg, { tintColor: INK, opacity: invert.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
                        />
                        <Animated.Image source={MARK} resizeMode="contain" style={[styles.markImg, { tintColor: '#ffffff', opacity: invert }]} />
                    </View>
                    {/* Синяя точка с «погрузки» — тает вместе с белым фоном, а не пропадает рывком. */}
                    <Animated.View style={[styles.dot, { opacity: veil }]} />
                </Animated.View>
            )}

            <Animated.View
                pointerEvents="none"
                style={[styles.nameBlock, {
                    top: cy + MARK_H / 2 + 44,
                    opacity: Animated.multiply(name, veil),
                    transform: [{ translateY: name.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                }]}
            >
                <Text style={styles.name}>LogiCore</Text>
                <Text style={styles.driver}>DRIVER</Text>
                <Text style={styles.tagline}>Приложение водителя</Text>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    floor: { position: 'absolute', width: 270, height: 2, borderRadius: 1, backgroundColor: '#e6e8ec' },
    mark: { position: 'absolute', width: MARK_W, height: MARK_H },
    markImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    // Там же, где точка рисуется в анимации знака (CargoMark): 0,49 и 0,347 ширины от центра.
    dot: {
        position: 'absolute',
        width: (10 * MARK_W) / 118,
        height: (10 * MARK_W) / 118,
        borderRadius: (5 * MARK_W) / 118,
        left: MARK_W / 2 + 0.49 * MARK_W - (5 * MARK_W) / 118,
        top: MARK_H / 2 - 0.347 * MARK_W - (5 * MARK_W) / 118,
        backgroundColor: ACCENT,
    },
    nameBlock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    name: { fontFamily: FONT.displayBold, fontSize: 27, letterSpacing: -0.6, color: INK },
    driver: { fontFamily: FONT.displayMedium, fontSize: 15, letterSpacing: 6, marginRight: -6, color: INK, marginTop: 6 },
    tagline: { fontFamily: FONT.regular, fontSize: 13.5, color: '#868e9c', marginTop: 14 },
});
