import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

/** У react-native в этом проекте нет описаний типов (declarations.d.ts) — стиль описываем сами. */
type ViewStyle = Record<string, unknown>;
type TextInputProps = Record<string, any>;
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { BRAND, RADIUS, selectedColors } from '@/lib/theme';

/**
 * Кирпичики экранов приложения — в языке платформы: светлые карточки,
 * радиус 20, синий акцент, крупные кнопки под палец в перчатке.
 */

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
    const { colors } = useAppTheme();
    const body = (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>
    );
    if (!onPress) return body;
    return (
        <Pressable onPress={onPress} style={({ pressed }: { pressed: boolean }) => [{ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
            {body}
        </Pressable>
    );
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
    const { colors } = useAppTheme();
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={[styles.title, { color: colors.text }]}>{children}</Text>
            {!!sub && <Text style={[styles.sub, { color: colors.textSecondary }]}>{sub}</Text>}
        </View>
    );
}

export function Eyebrow({ children }: { children: ReactNode }) {
    const { colors } = useAppTheme();
    return <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{children}</Text>;
}

type Variant = 'primary' | 'secondary' | 'danger' | 'dark';

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style }: {
    title: string;
    onPress: () => void;
    variant?: Variant;
    icon?: keyof typeof Ionicons.glyphMap;
    loading?: boolean;
    disabled?: boolean;
    style?: ViewStyle;
}) {
    const { colors } = useAppTheme();
    const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
        primary: { bg: BRAND.primary, fg: '#fff', border: BRAND.primary },
        dark: { bg: BRAND.dark, fg: '#fff', border: BRAND.dark },
        secondary: { bg: colors.card, fg: colors.text, border: colors.border },
        danger: { bg: colors.card, fg: colors.danger, border: colors.border },
    };
    const p = palette[variant];
    const off = disabled || loading;
    return (
        <Pressable
            onPress={onPress}
            disabled={off}
            accessibilityRole="button"
            accessibilityLabel={title}
            style={({ pressed }: { pressed: boolean }) => [
                styles.button,
                { backgroundColor: p.bg, borderColor: p.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
                style,
            ]}
        >
            {loading ? <ActivityIndicator color={p.fg} /> : (
                <>
                    {icon && <Ionicons name={icon} size={19} color={p.fg} />}
                    <Text style={[styles.buttonText, { color: p.fg }]}>{title}</Text>
                </>
            )}
        </Pressable>
    );
}

export function Field({ label, hint, error, style, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
    const { colors } = useAppTheme();
    return (
        <View style={[{ marginBottom: 12 }, style as ViewStyle]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
            <TextInput
                placeholderTextColor={colors.textTertiary}
                {...input}
                style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: error ? colors.danger : colors.border }]}
            />
            {!!(error || hint) && <Text style={[styles.hint, { color: error ? colors.danger : colors.textTertiary }]}>{error || hint}</Text>}
        </View>
    );
}

/** Выбор одного из крупных вариантов — «свой ИП / через парк». */
export function Choice({ title, text, icon, selected, onPress }: {
    title: string;
    text: string;
    icon: keyof typeof Ionicons.glyphMap;
    selected: boolean;
    onPress: () => void;
}) {
    const { colors, isDark } = useAppTheme();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.choice, {
                backgroundColor: colors.card,
                borderColor: selected ? BRAND.primary : colors.border,
                borderWidth: selected ? 2 : 1,
            }]}
        >
            <View style={[styles.choiceIcon, { backgroundColor: selected ? BRAND.primary : isDark ? colors.hover : '#eef4ff' }]}>
                <Ionicons name={icon} size={22} color={selected ? '#fff' : BRAND.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.choiceTitle, { color: colors.text }]}>{title}</Text>
                <Text style={[styles.choiceText, { color: colors.textSecondary }]}>{text}</Text>
            </View>
            <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? BRAND.primary : colors.textTertiary} />
        </Pressable>
    );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    const { colors, isDark } = useAppTheme();
    const sel = selectedColors(isDark);
    return (
        <Pressable
            onPress={onPress}
            style={[styles.chip, {
                backgroundColor: active ? sel.bg : colors.card,
                borderColor: active ? sel.bg : colors.border,
            }]}
        >
            <Text style={{ color: active ? sel.fg : colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        </Pressable>
    );
}

export function Badge({ label, tone }: { label: string; tone: 'blue' | 'green' | 'orange' | 'red' | 'gray' }) {
    const tones = {
        blue: { bg: '#e8f0fe', fg: '#1d4ed8' },
        green: { bg: '#e7f8ef', fg: '#15803d' },
        orange: { bg: '#fff4e5', fg: '#b45309' },
        red: { bg: '#fee2e2', fg: '#dc2626' },
        gray: { bg: '#f1f2f4', fg: '#5f6672' },
    }[tone];
    return (
        <View style={[styles.badge, { backgroundColor: tones.bg }]}>
            <Text style={{ color: tones.fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
        </View>
    );
}

export function Row({ label, value, icon }: { label: string; value: ReactNode; icon?: keyof typeof Ionicons.glyphMap }) {
    const { colors } = useAppTheme();
    return (
        <View style={styles.row}>
            {icon && <Ionicons name={icon} size={16} color={colors.textTertiary} style={{ marginTop: 1 }} />}
            <Text style={[styles.rowLabel, { color: colors.textTertiary }]}>{label}</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
        </View>
    );
}

export function Empty({ icon, title, text, action }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    text?: string;
    action?: ReactNode;
}) {
    const { colors, isDark } = useAppTheme();
    return (
        <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: isDark ? colors.hover : '#eef4ff' }]}>
                <Ionicons name={icon} size={30} color={BRAND.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
            {!!text && <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{text}</Text>}
            {action}
        </View>
    );
}

/** Маршрут лентой: точка погрузки — закрашенная, выгрузки — полая (как на платформе). */
export function Route({ from, fromAddress, to, toAddress }: { from: string; fromAddress?: string | null; to: string; toAddress?: string | null }) {
    const { colors } = useAppTheme();
    return (
        <View>
            <View style={styles.routeRow}>
                <View style={[styles.dot, { backgroundColor: colors.text }]} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.routeCity, { color: colors.text }]}>{from}</Text>
                    {!!fromAddress && <Text style={[styles.routeAddress, { color: colors.textSecondary }]}>{fromAddress}</Text>}
                </View>
            </View>
            <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
            <View style={styles.routeRow}>
                <View style={[styles.dot, { borderWidth: 2, borderColor: colors.text, backgroundColor: 'transparent' }]} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.routeCity, { color: colors.text }]}>{to}</Text>
                    {!!toAddress && <Text style={[styles.routeAddress, { color: colors.textSecondary }]}>{toAddress}</Text>}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: { borderRadius: RADIUS.card, borderWidth: 1, padding: 16, marginBottom: 12 },
    title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
    sub: { fontSize: 14, lineHeight: 20, marginTop: 4 },
    eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 },
    button: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: 54, borderRadius: RADIUS.button, borderWidth: 1, paddingHorizontal: 18,
    },
    buttonText: { fontSize: 16, fontWeight: '700' },
    label: { fontSize: 12.5, fontWeight: '600', marginBottom: 6 },
    input: { height: 50, borderRadius: RADIUS.button, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
    hint: { fontSize: 12, marginTop: 5, lineHeight: 16 },
    choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: RADIUS.card, marginBottom: 10 },
    choiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    choiceTitle: { fontSize: 16, fontWeight: '700' },
    choiceText: { fontSize: 13, lineHeight: 18, marginTop: 2 },
    chip: { paddingHorizontal: 14, height: 36, borderRadius: RADIUS.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
    rowLabel: { width: 112, fontSize: 13.5 },
    rowValue: { flex: 1, fontSize: 14.5, fontWeight: '600' },
    empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
    emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, marginBottom: 16 },
    routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
    routeLine: { width: 2, height: 16, marginLeft: 5, marginVertical: 2 },
    routeCity: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
    routeAddress: { fontSize: 13, marginTop: 1 },
});
