import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** У react-native в этом проекте нет описаний типов (declarations.d.ts) — стиль описываем сами. */
type ViewStyle = Record<string, unknown>;
type TextInputProps = Record<string, any>;
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FONT, RADIUS, SHADOW, selectedColors, statusMeta, statusTone } from '@/lib/theme';

/**
 * Кирпичики экранов приложения — в языке кабинета logicore.kz: Unbounded в
 * заголовках, Inter в тексте, белые карточки с тонкой рамкой и мягкой тенью,
 * графитовые кнопки. Кнопки крупные — под палец в перчатке.
 */

type IconName = keyof typeof Ionicons.glyphMap;

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
    const { colors, isDark } = useAppTheme();
    const body = (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && SHADOW, style]}>{children}</View>
    );
    if (!onPress) return body;
    return (
        <Pressable onPress={onPress} style={({ pressed }: { pressed: boolean }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
            {body}
        </Pressable>
    );
}

/**
 * Карточка с шапкой, как блоки кабинета: серая полоса сверху, значок и
 * название шрифтом Unbounded, справа — счётчик или действие.
 */
export function Section({ title, icon, right, children, style, padded = true }: {
    title: string;
    icon?: IconName;
    right?: ReactNode;
    children: ReactNode;
    style?: ViewStyle;
    padded?: boolean;
}) {
    const { colors, isDark } = useAppTheme();
    return (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && SHADOW, style]}>
            <View style={[styles.sectionHead, { backgroundColor: colors.surface2, borderBottomColor: colors.border2 }]}>
                {icon && <Ionicons name={icon} size={15} color={colors.textSecondary} />}
                <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
                {typeof right === 'string'
                    ? <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{right}</Text>
                    : right}
            </View>
            <View style={padded ? styles.sectionBody : undefined}>{children}</View>
        </View>
    );
}

/** Шапка экрана: надстрочник и крупный заголовок, как «Кабинет парка / Выплаты водителям». */
export function ScreenHeader({ eyebrow, title, right, onBack }: {
    eyebrow?: string;
    title: string;
    right?: ReactNode;
    onBack?: () => void;
}) {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    return (
        <View style={[styles.screenHeader, { paddingTop: Math.max(insets.top, 12) + 14 }]}>
            {onBack && (
                <Pressable
                    onPress={onBack}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Назад"
                    style={({ pressed }: { pressed: boolean }) => [styles.backButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                >
                    <Ionicons name="chevron-back" size={20} color={colors.text} />
                </Pressable>
            )}
            <View style={{ flex: 1 }}>
                {!!eyebrow && <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{eyebrow}</Text>}
                <Text style={[styles.screenTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            </View>
            {right}
        </View>
    );
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
    const { colors } = useAppTheme();
    return (
        <View style={{ marginBottom: 16 }}>
            <Text style={[styles.title, { color: colors.text }]}>{children}</Text>
            {!!sub && <Text style={[styles.sub, { color: colors.textSecondary }]}>{sub}</Text>}
        </View>
    );
}

export function Eyebrow({ children }: { children: ReactNode }) {
    const { colors } = useAppTheme();
    return <Text style={[styles.eyebrow, { color: colors.textTertiary, marginBottom: 8 }]}>{children}</Text>;
}

/** Квадратик со значком — у пунктов меню и строк карточки. */
export function IconTile({ icon, tone = 'neutral', size = 38 }: { icon: IconName; tone?: 'neutral' | 'dark' | 'danger' | 'accent'; size?: number }) {
    const { colors } = useAppTheme();
    const p = {
        neutral: { bg: colors.surface2, fg: colors.text, border: colors.border2 },
        dark: { bg: colors.primary, fg: colors.primaryFg, border: colors.primary },
        danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
        accent: { bg: colors.accentSoft, fg: colors.accent, border: colors.accentSoft },
    }[tone];
    return (
        <View style={[styles.iconTile, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: p.bg, borderColor: p.border }]}>
            <Ionicons name={icon} size={Math.round(size * 0.47)} color={p.fg} />
        </View>
    );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'dark';

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style }: {
    title: string;
    onPress: () => void;
    variant?: Variant;
    icon?: IconName;
    loading?: boolean;
    disabled?: boolean;
    style?: ViewStyle;
}) {
    const { colors } = useAppTheme();
    // Необратимое — красной рамкой и надписью, без заливки: залитая красная
    // кнопка притягивает нажатие сильнее безопасных соседей (правило кабинета).
    const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
        primary: { bg: colors.primary, fg: colors.primaryFg, border: colors.primary },
        dark: { bg: colors.primary, fg: colors.primaryFg, border: colors.primary },
        secondary: { bg: colors.card, fg: colors.text, border: colors.border },
        danger: { bg: colors.card, fg: colors.danger, border: colors.danger + '55' },
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
                { backgroundColor: p.bg, borderColor: p.border, opacity: off ? 0.5 : pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
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
        <View style={[{ marginBottom: 14 }, style as ViewStyle]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
            <TextInput
                placeholderTextColor={colors.textTertiary}
                {...input}
                style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: error ? colors.danger : colors.border }]}
            />
            {!!(error || hint) && <Text style={[styles.hint, { color: error ? colors.danger : colors.textTertiary }]}>{error || hint}</Text>}
        </View>
    );
}

/** Выбор одного из крупных вариантов — «свой ИП / через парк». */
export function Choice({ title, text, icon, selected, onPress }: {
    title: string;
    text: string;
    icon: IconName;
    selected: boolean;
    onPress: () => void;
}) {
    const { colors } = useAppTheme();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.choice, {
                backgroundColor: colors.card,
                borderColor: selected ? colors.text : colors.border,
                borderWidth: selected ? 1.5 : 1,
            }]}
        >
            <IconTile icon={icon} tone={selected ? 'dark' : 'neutral'} size={44} />
            <View style={{ flex: 1 }}>
                <Text style={[styles.choiceTitle, { color: colors.text }]}>{title}</Text>
                <Text style={[styles.choiceText, { color: colors.textSecondary }]}>{text}</Text>
            </View>
            <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.text : colors.textTertiary} />
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
            <Text style={{ color: active ? sel.fg : colors.textSecondary, fontSize: 13, fontFamily: active ? FONT.semibold : FONT.medium }}>{label}</Text>
        </Pressable>
    );
}

export function Badge({ label, tone }: { label: string; tone: 'blue' | 'green' | 'orange' | 'red' | 'gray' }) {
    const { colors } = useAppTheme();
    const tones = {
        blue: { bg: colors.accentSoft, fg: colors.accent },
        green: { bg: colors.posSoft, fg: colors.pos },
        orange: { bg: colors.warnSoft, fg: colors.warn },
        red: { bg: colors.dangerSoft, fg: colors.danger },
        gray: { bg: colors.hover, fg: colors.textSecondary },
    }[tone];
    return (
        <View style={[styles.badge, { backgroundColor: tones.bg }]}>
            <Text style={{ color: tones.fg, fontSize: 11.5, fontFamily: FONT.semibold }}>{label}</Text>
        </View>
    );
}

/**
 * Знак в кружке статуса — те же, что в кабинете: статус читается и без цвета
 * (на солнце, при дальтонизме).
 */
const STATUS_GLYPH: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
    DRAFT: 'file-document-outline',
    PENDING: 'clock-outline',
    ASSIGNED: 'account',
    EN_ROUTE_PICKUP: 'arrow-right',
    AT_PICKUP: 'arrow-down',
    LOADING: 'arrow-down',
    IN_TRANSIT: 'truck',
    AT_DELIVERY: 'arrow-up',
    UNLOADING: 'arrow-up',
    COMPLETED: 'check-bold',
    CANCELLED: 'close-thick',
    PROBLEM: 'exclamation-thick',
};

/**
 * Плашка статуса рейса — как в кабинете (StatusPill): белая плашка с тонкой
 * рамкой, слева выпуклый цветной кружок со знаком, рядом тёмная подпись.
 */
export function StatusPill({ status }: { status: string }) {
    const { colors, isDark } = useAppTheme();
    const meta = statusMeta(status);
    return (
        <View style={[styles.statusPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.statusDot, { backgroundColor: statusTone(status, isDark) }]}>
                {/* Блик сверху — кружок выпуклый, как в кабинете. Три полупрозрачных слоя
                    разной высоты дают плавный переход вместо резкой границы. */}
                {[11, 7, 4].map((h) => (
                    <View key={h} style={[styles.statusDotShine, { height: h, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.11)' }]} />
                ))}
                <MaterialCommunityIcons name={STATUS_GLYPH[status] || 'file-document-outline'} size={11} color={isDark ? colors.background : '#ffffff'} />
            </View>
            <Text style={[styles.statusText, { color: colors.text }]}>{meta.label}</Text>
        </View>
    );
}

export function Row({ label, value, icon }: { label: string; value: ReactNode; icon?: IconName }) {
    const { colors } = useAppTheme();
    return (
        <View style={styles.row}>
            {icon && <Ionicons name={icon} size={16} color={colors.textTertiary} style={{ marginTop: 1 }} />}
            <Text style={[styles.rowLabel, { color: colors.textTertiary }]}>{label}</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
        </View>
    );
}

/** Строка меню: значок, подпись, пояснение и стрелка. */
export function ListRow({ icon, label, desc, onPress, last, right, tone }: {
    icon: IconName;
    label: string;
    desc?: string;
    onPress?: () => void;
    last?: boolean;
    right?: ReactNode;
    tone?: 'neutral' | 'danger';
}) {
    const { colors } = useAppTheme();
    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }: { pressed: boolean }) => [styles.listRow, { backgroundColor: pressed ? colors.hover : 'transparent' }]}
        >
            <IconTile icon={icon} tone={tone === 'danger' ? 'danger' : 'neutral'} size={36} />
            <View style={[styles.listRowText, !last && { borderBottomWidth: 1, borderBottomColor: colors.border2 }]}>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.listRowLabel, { color: tone === 'danger' ? colors.danger : colors.text }]}>{label}</Text>
                    {!!desc && <Text style={[styles.listRowDesc, { color: colors.textTertiary }]} numberOfLines={1}>{desc}</Text>}
                </View>
                {right ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} /> : null)}
            </View>
        </Pressable>
    );
}

export function Empty({ icon, title, text, action }: {
    icon: IconName;
    title: string;
    text?: string;
    action?: ReactNode;
}) {
    const { colors, isDark } = useAppTheme();
    return (
        <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && SHADOW]}>
                <Ionicons name={icon} size={30} color={colors.text} />
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
    section: { borderRadius: RADIUS.card, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 11, borderBottomWidth: 1 },
    sectionTitle: { flex: 1, fontFamily: FONT.displayMedium, fontSize: 12.5, letterSpacing: -0.3 },
    sectionCount: { fontFamily: FONT.semibold, fontSize: 12 },
    sectionBody: { padding: 16 },
    screenHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
    backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    screenTitle: { fontFamily: FONT.display, fontSize: 26, letterSpacing: -1.1, lineHeight: 32, marginTop: 6 },
    title: { fontFamily: FONT.display, fontSize: 24, letterSpacing: -1, lineHeight: 30 },
    sub: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, marginTop: 6 },
    eyebrow: { fontFamily: FONT.displayMedium, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' },
    iconTile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    button: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
        height: 56, borderRadius: RADIUS.button, borderWidth: 1, paddingHorizontal: 20,
    },
    buttonText: { fontFamily: FONT.semibold, fontSize: 16, letterSpacing: -0.2 },
    label: { fontFamily: FONT.medium, fontSize: 12.5, marginBottom: 7 },
    input: { height: 52, borderRadius: RADIUS.input, borderWidth: 1, paddingHorizontal: 14, fontSize: 16, fontFamily: FONT.regular },
    hint: { fontFamily: FONT.regular, fontSize: 12, marginTop: 6, lineHeight: 16 },
    choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: RADIUS.card, marginBottom: 10 },
    choiceTitle: { fontFamily: FONT.semibold, fontSize: 16, letterSpacing: -0.2 },
    choiceText: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
    chip: { paddingHorizontal: 15, height: 36, borderRadius: RADIUS.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.pill },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
        height: 28, paddingLeft: 4, paddingRight: 11, borderRadius: RADIUS.pill, borderWidth: 1,
    },
    statusDot: {
        width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        shadowColor: '#101828', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.22, shadowRadius: 2, elevation: 1,
    },
    statusDotShine: { position: 'absolute', top: 0, left: 0, right: 0 },
    statusText: { fontFamily: FONT.semibold, fontSize: 12.5, letterSpacing: -0.1 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 7 },
    rowLabel: { width: 112, fontFamily: FONT.regular, fontSize: 13.5 },
    rowValue: { flex: 1, fontFamily: FONT.semibold, fontSize: 14.5 },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14 },
    listRowText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingRight: 14 },
    listRowLabel: { fontFamily: FONT.medium, fontSize: 15, letterSpacing: -0.2 },
    listRowDesc: { fontFamily: FONT.regular, fontSize: 12.5, marginTop: 2 },
    empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 28 },
    emptyIcon: { width: 72, height: 72, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    emptyTitle: { fontFamily: FONT.display, fontSize: 18, letterSpacing: -0.6, textAlign: 'center' },
    emptyText: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 18, maxWidth: 300 },
    routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
    routeLine: { width: 2, height: 16, marginLeft: 5, marginVertical: 2 },
    routeCity: { fontFamily: FONT.semibold, fontSize: 17, letterSpacing: -0.3 },
    routeAddress: { fontFamily: FONT.regular, fontSize: 13, marginTop: 1 },
});
