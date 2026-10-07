import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useIntro, type Measurable } from '@/lib/intro';
import { useStore } from '@/store';

/** У VideoView в проекте не видно поля style (типы react-native отключены) — добавляем его. */
const Video = VideoView as unknown as React.ComponentType<React.ComponentProps<typeof VideoView> & { style?: object }>;

const VIDEO = require('../assets/intro.mp4');
const MARK = require('../assets/logo-mark-intro.png');

/**
 * Последний кадр ролика (1080×1920): фон #FAFAFA, по центру чёрный знак шириной 178 px.
 * Наш знак ставим ровно туда же, чтобы смена ролика на анимацию была незаметна.
 */
const FRAME = { w: 1080, h: 1920, markW: 178 };
/** Цвет первого кадра — им же залита системная заставка, пока ролик загружается. */
const START_BG = '#F0F2F4';
const END_BG = '#FAFAFA';
/** Фон экрана входа: заставка темнеет ровно до него. */
const DARK = '#030712';
const MARK_BLACK = '#09090b';
/** Если ролик почему-то не доиграл (нет кодека, сбой), заставка не держит водителя дольше этого. */
const VIDEO_TIMEOUT_MS = 8000;
/** Сколько ждать, пока приложение решит, куда вести (вход или рейс), после перехода в чёрное. */
const READY_TIMEOUT_MS = 2500;

type Phase = 'video' | 'invert' | 'handoff';

/**
 * Заставка при запуске.
 *
 * 1. Ролик: камера едет по Алматы, в конце остаётся чёрный знак на белом. Нажатие — пропустить.
 * 2. Из-под знака расходится тёмный круг и закрывает экран; когда край круга проходит знак, знак белеет.
 * 3. Знак летит на своё место в шапке экрана входа, а сам экран входа проявляется сверху вниз.
 *    Если водитель уже вошёл — знак мягко уходит, открывается его рейс.
 */
export function IntroSplash({ onDone }: { onDone: () => void }) {
    const win = useWindowDimensions();
    const rootRef = useRef<Measurable>(null);
    const [box, setBox] = useState({ w: win.width, h: win.height });
    const W = box.w;
    const H = box.h;
    const [phase, setPhase] = useState<Phase>('video');
    const finished = useRef(false);
    const shown = useRef(false);

    const player = useVideoPlayer(VIDEO, (p) => {
        p.muted = true;
        p.loop = false;
        p.play();
    });

    // Ролик появляется из цвета системной заставки, а не вспыхивает.
    const videoIn = useRef(new Animated.Value(0)).current;
    // Тёмный круг: 0 — точка под знаком, 1 — закрыл весь экран.
    const reveal = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(1)).current;
    // Перелёт знака в шапку входа: 0 — по центру, 1 — на месте знака входа.
    const fly = useRef(new Animated.Value(0)).current;
    // Прозрачность фона заставки — уходит, открывая экран под ней.
    const veil = useRef(new Animated.Value(1)).current;
    const markFade = useRef(new Animated.Value(1)).current;
    const [flight, setFlight] = useState({ dx: 0, dy: 0, scale: 1 });

    // Знак ролика на экране телефона: ролик растянут на весь экран (cover), центр совпадает.
    const scale = Math.max(W / FRAME.w, H / FRAME.h);
    const markW = FRAME.markW * scale;
    const markH = markW * (559 / 602);
    // Радиус круга, который из центра закрывает экран целиком, и где его край проходит знак.
    const R = Math.hypot(W, H) / 2 + 4;
    const edgeIn = Math.min(0.2, (markH / 2 / R) * 0.8);
    const edgeOut = Math.min(0.3, Math.hypot(markW, markH) / 2 / R);

    const showVideo = () => {
        if (shown.current) return;
        shown.current = true;
        Animated.timing(videoIn, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    };

    const endVideo = () => {
        if (finished.current) return;
        finished.current = true;
        setPhase('invert');
    };

    useEventListener(player, 'playToEnd', endVideo);
    useEventListener(player, 'statusChange', ({ status }) => {
        if (status === 'error') endVideo();
        // Команда «играть» могла прийти раньше, чем ролик загрузился, — повторяем, когда он готов.
        if (status === 'readyToPlay' && !finished.current && !player.playing) player.play();
    });
    // Не везде приходит сигнал «первый кадр готов» — тогда показываем ролик, как только он пошёл.
    useEventListener(player, 'playingChange', ({ isPlaying }) => {
        if (isPlaying) setTimeout(showVideo, 120);
    });

    useEffect(() => {
        const t = setTimeout(endVideo, VIDEO_TIMEOUT_MS);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Шаг 2: тёмный круг расходится из-под знака, знак белеет.
    useEffect(() => {
        if (phase !== 'invert') return;
        try {
            player.pause();
        } catch {
            /* плеер уже остановлен */
        }
        Animated.parallel([
            Animated.timing(reveal, { toValue: 1, duration: 900, delay: 220, easing: Easing.bezier(0.55, 0, 0.25, 1), useNativeDriver: true }),
            Animated.sequence([
                Animated.delay(260),
                Animated.timing(pulse, { toValue: 1.08, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 460, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
            ]),
        ]).start(() => waitAndHandoff());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

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

    // Шаг 3: передача экрану входа (или рейсу).
    const handoff = () => {
        const { target } = useIntro.getState();
        const loggedIn = useStore.getState().isAuthenticated;
        useIntro.getState().setState('handoff');
        setPhase('handoff');

        if (target && !loggedIn) {
            // Знак летит из центра в шапку входа и там уменьшается до своего размера.
            // Полёт запускаем, когда точка назначения посчитана и попала в разметку.
            const start = () =>
                Animated.parallel([
                    Animated.timing(fly, { toValue: 1, duration: 720, easing: Easing.bezier(0.65, 0, 0.25, 1), useNativeDriver: true }),
                    Animated.timing(veil, { toValue: 0, duration: 520, delay: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                ]).start(() => finish());
            const root = rootRef.current;
            if (!root) return start();
            // Координаты знака входа — относительно окна; переводим их в координаты слоя заставки.
            root.measureInWindow((ox: number, oy: number) => {
                setFlight({
                    dx: target.x - ox + target.width / 2 - W / 2,
                    dy: target.y - oy + target.height / 2 - H / 2,
                    scale: target.width / markW,
                });
                requestAnimationFrame(() => requestAnimationFrame(start));
            });
        } else {
            // Водитель уже вошёл: знак уменьшается и тает, заставка растворяется.
            setFlight({ dx: 0, dy: 0, scale: 0.6 });
            requestAnimationFrame(() =>
                requestAnimationFrame(() =>
                    Animated.parallel([
                        Animated.timing(fly, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
                        Animated.timing(markFade, { toValue: 0, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
                        Animated.timing(veil, { toValue: 0, duration: 560, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                    ]).start(() => finish()),
                ),
            );
        }
    };

    const finish = () => {
        useIntro.getState().setState('done');
        onDone();
    };

    const flyX = fly.interpolate({ inputRange: [0, 1], outputRange: [0, flight.dx] });
    const flyY = fly.interpolate({ inputRange: [0, 1], outputRange: [0, flight.dy] });
    const flyScale = fly.interpolate({ inputRange: [0, 1], outputRange: [1, flight.scale] });
    const circle = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] });
    const black = reveal.interpolate({ inputRange: [0, edgeIn, edgeOut, 1], outputRange: [1, 1, 0, 0] });
    const white = reveal.interpolate({ inputRange: [0, edgeIn, edgeOut, 1], outputRange: [0, 0, 1, 1] });

    return (
        <View
            ref={rootRef}
            style={StyleSheet.absoluteFill}
            pointerEvents={phase === 'handoff' ? 'none' : 'auto'}
            onLayout={(e: { nativeEvent: { layout: { width: number; height: number } } }) =>
                setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
            }
        >
            <StatusBar style={phase === 'video' ? 'dark' : 'light'} />

            {/* Фон заставки: светлый, тёмный круг поверх него, потом всё растворяется */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: veil, overflow: 'hidden' }]}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: phase === 'video' ? START_BG : END_BG }]} />
                {phase !== 'video' && (
                    <Animated.View
                        style={{
                            position: 'absolute',
                            left: W / 2 - R,
                            top: H / 2 - R,
                            width: R * 2,
                            height: R * 2,
                            borderRadius: R,
                            backgroundColor: DARK,
                            transform: [{ scale: circle }],
                        }}
                    />
                )}
            </Animated.View>

            {phase === 'video' && (
                <Pressable style={StyleSheet.absoluteFill} onPress={endVideo} accessibilityLabel="Пропустить заставку">
                    <Animated.View style={[StyleSheet.absoluteFill, { opacity: videoIn }]}>
                        <Video
                            player={player}
                            // Ширина и высота явно: в веб-версии видео иначе рисуется в своём размере, а не во весь экран.
                            style={styles.video}
                            contentFit="cover"
                            nativeControls={false}
                            surfaceType="textureView"
                            onFirstFrameRender={showVideo}
                        />
                    </Animated.View>
                </Pressable>
            )}

            {phase !== 'video' && (
                <Animated.View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: (W - markW) / 2,
                        top: (H - markH) / 2,
                        width: markW,
                        height: markH,
                        opacity: markFade,
                        transform: [{ translateX: flyX }, { translateY: flyY }, { scale: flyScale }, { scale: pulse }],
                    }}
                >
                    <Animated.Image source={MARK} style={[styles.mark, { tintColor: MARK_BLACK, opacity: black }]} resizeMode="contain" />
                    <Animated.Image source={MARK} style={[styles.mark, { tintColor: '#ffffff', opacity: white }]} resizeMode="contain" />
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    video: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
    mark: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
});
