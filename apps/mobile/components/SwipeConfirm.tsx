import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FONT } from '@/lib/theme';

const KNOB = 54;
const PAD = 5;
/** Сколько пути надо протащить, чтобы шаг засчитался. */
const DONE_AT = 0.82;

/**
 * Подтверждение свайпом вправо: «смахните, чтобы…». Случайное касание в
 * кармане или на кочке шаг не сменит — нужно протащить кружок до конца.
 * Отпустил раньше — кружок возвращается, ничего не происходит.
 */
export function SwipeConfirm({ label, hint = 'Смахните вправо', onConfirm }: {
    label: string;
    hint?: string;
    onConfirm: () => Promise<void> | void;
}) {
    const { colors } = useAppTheme();
    const [width, setWidth] = useState(0);
    const [busy, setBusy] = useState(false);
    const x = useRef(new Animated.Value(0)).current;
    const max = Math.max(0, width - KNOB - PAD * 2);

    // PanResponder создаётся один раз — свежие значения берёт из ссылок.
    const maxRef = useRef(max);
    const busyRef = useRef(false);
    const confirmRef = useRef(onConfirm);
    useEffect(() => { maxRef.current = max; }, [max]);
    useEffect(() => { confirmRef.current = onConfirm; }, [onConfirm]);

    const back = () => Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();

    const finish = async () => {
        busyRef.current = true;
        setBusy(true);
        Animated.timing(x, { toValue: maxRef.current, duration: 120, useNativeDriver: false }).start();
        try {
            await confirmRef.current();
        } finally {
            busyRef.current = false;
            setBusy(false);
            back();
        }
    };

    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => !busyRef.current,
        onMoveShouldSetPanResponder: (_e: unknown, g: { dx: number }) => !busyRef.current && Math.abs(g.dx) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e: unknown, g: { dx: number }) => {
            x.setValue(Math.min(Math.max(0, g.dx), maxRef.current));
        },
        onPanResponderRelease: (_e: unknown, g: { dx: number }) => {
            if (maxRef.current > 0 && g.dx >= maxRef.current * DONE_AT) finish();
            else back();
        },
        onPanResponderTerminate: back,
    })).current;

    const fade = x.interpolate({ inputRange: [0, Math.max(1, max * 0.55)], outputRange: [1, 0], extrapolate: 'clamp' });
    const fill = x.interpolate({ inputRange: [0, Math.max(1, max)], outputRange: [KNOB + PAD * 2, Math.max(KNOB + PAD * 2, width)], extrapolate: 'clamp' });

    return (
        <View
            style={[styles.track, { backgroundColor: colors.primary }]}
            onLayout={(e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width)}
            accessible
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Двойное касание — сменить шаг"
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={() => { if (!busyRef.current) finish(); }}
        >
            <Animated.View style={[styles.fill, { width: fill, backgroundColor: colors.primaryFg }]} />
            <Animated.View style={[styles.labelWrap, { opacity: fade }]} pointerEvents="none">
                <Text style={[styles.hint, { color: colors.primaryFg }]}>{hint}</Text>
                <Text style={[styles.label, { color: colors.primaryFg }]} numberOfLines={1}>{label}</Text>
            </Animated.View>
            <View style={styles.chevrons} pointerEvents="none">
                <Ionicons name="chevron-forward" size={16} color={colors.primaryFg} style={{ opacity: 0.25 }} />
                <Ionicons name="chevron-forward" size={16} color={colors.primaryFg} style={{ opacity: 0.45, marginLeft: -8 }} />
                <Ionicons name="chevron-forward" size={16} color={colors.primaryFg} style={{ opacity: 0.7, marginLeft: -8 }} />
            </View>
            <Animated.View
                {...pan.panHandlers}
                style={[styles.knob, { backgroundColor: colors.primaryFg, transform: [{ translateX: x }] }]}
            >
                {busy
                    ? <ActivityIndicator color={colors.primary} />
                    : <Ionicons name="arrow-forward" size={22} color={colors.primary} />}
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        height: KNOB + PAD * 2,
        borderRadius: (KNOB + PAD * 2) / 2,
        justifyContent: 'center',
        overflow: 'hidden',
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 22,
        elevation: 8,
    },
    fill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        borderRadius: (KNOB + PAD * 2) / 2,
        opacity: 0.1,
    },
    labelWrap: {
        position: 'absolute',
        left: KNOB + PAD * 2 + 6,
        right: 44,
        alignItems: 'center',
    },
    hint: { fontFamily: FONT.medium, fontSize: 11, opacity: 0.55 },
    label: { fontFamily: FONT.semibold, fontSize: 16, letterSpacing: -0.3, marginTop: 1 },
    chevrons: { position: 'absolute', right: 18, flexDirection: 'row' },
    knob: {
        position: 'absolute',
        left: PAD,
        width: KNOB,
        height: KNOB,
        borderRadius: KNOB / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
