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
    const { colors } = useAppTheme();
    const body = (
        <View style={[styles.card, { backgroundColor: colors.card }, style]}>{children}</View>
    );
    if (!onPress) return body;
    return (
        <Pressable onPress={onPress} style={({ pressed }: { pressed: boolean }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
            {body}
        </Pressable>
    );
}

/**
 * Раздел по образцу владельца («Delivery Details», 14.10.2026): серый
 * контейнер, сверху значок и название, под ними белый блок с содержимым.
 * Справа от названия — счётчик или действие.
 */
export function Section({ title, icon, right, children, style, padded = true }: {
    title: string;
    icon?: IconName;
    right?: ReactNode;
    children: ReactNode;
    style?: ViewStyle;
    padded?: boolean;
}) {
    const { colors } = useAppTheme();
    return (
        <View style={[styles.section, { backgroundColor: colors.card }, style]}>
            <View style={styles.sectionHead}>
                {icon && <Ionicons name={icon} size={18} color={colors.textSecondary} />}
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]} numberOfLines={1}>{title}</Text>
                {typeof right === 'string'
                    ? <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{right}</Text>
                    : right}
            </View>
            <View style={[styles.sectionInner, { backgroundColor: colors.surface2 }, padded && styles.sectionBody]}>{children}</View>
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
                    style={({ pressed }: { pressed: boolean }) => [styles.backButton, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
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
        neutral: { bg: colors.surface2, fg: colors.text, border: colors.border },
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
        secondary: { bg: colors.card, fg: colors.text, border: colors.card },
        danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
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
                style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: error ? colors.danger : colors.card }]}
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
                backgroundColor: selected ? colors.surface2 : colors.card,
                borderColor: selected ? colors.text : colors.card,
                borderWidth: 1.5,
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
                borderColor: active ? sel.bg : colors.card,
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
 * Плашка статуса рейса по образцу владельца («In Transit», 14.10.2026):
 * мягкая пилюля цвета статуса и подпись тем же цветом. Знак в кружке
 * остаётся — статус читается и без цвета (на солнце, при дальтонизме).
 */
export function StatusPill({ status }: { status: string }) {
    const { colors, isDark } = useAppTheme();
    const meta = statusMeta(status);
    const tone = statusTone(status, isDark);
    return (
        <View style={[styles.statusPill, { backgroundColor: isDark ? colors.surface2 : meta.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: tone }]}>
                <MaterialCommunityIcons name={STATUS_GLYPH[status] || 'file-document-outline'} size={10} color={isDark ? colors.background : '#ffffff'} />
            </View>
            <Text style={[styles.statusText, { color: tone }]}>{meta.label}</Text>
        </View>
    );
}

export function Row({ label, value, icon }: { label: string; value: ReactNode; icon?: IconName }) {
    const { colors } = useAppTheme();
    return (
        <View style={styles.row}>
            {icon && <Ionicons name={icon} size={16} color={colors.textTertiary} style={{ marginTop: 2 }} />}
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
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
    const { colors } = useAppTheme();
    return (
        <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.card, borderColor: colors.card }]}>
                <Ionicons name={icon} size={30} color={colors.text} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
            {!!text && <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{text}</Text>}
            {action}
        </View>
    );
}

/**
 * Приветствие вверху главного экрана (по образцу владельца, 14.10.2026):
 * кружок с инициалами, «Здравствуйте, Имя», под ним строка с компанией или
 * машиной; справа — круглая кнопка.
 */
export function Greeting({ firstName, lastName, sub, subIcon = 'business-outline', right }: {
    firstName?: string | null;
    lastName?: string | null;
    sub?: string | null;
    subIcon?: IconName;
    right?: ReactNode;
}) {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const initials = [firstName, lastName].map((s) => (s || '').trim()[0] || '').join('').toUpperCase() || '·';
    return (
        <View style={[styles.greeting, { paddingTop: Math.max(insets.top, 12) + 12 }]}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={[styles.avatarText, { color: colors.primaryFg }]}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.greetingTitle, { color: colors.text }]} numberOfLines={1}>
                    Здравствуйте{firstName ? `, ${firstName}` : ''}
                </Text>
                {!!sub && (
                    <View style={styles.greetingSubRow}>
                        <Ionicons name={subIcon} size={13} color={colors.textTertiary} />
                        <Text style={[styles.greetingSub, { color: colors.textTertiary }]} numberOfLines={1}>{sub}</Text>
                    </View>
                )}
            </View>
            {right}
        </View>
    );
}

/**
 * Чёрная главная карточка экрана — как «Your Balance» на образце владельца:
 * на ней главное (маршрут рейса, сумма к выплате) и светлые пилюли действий.
 */
export function HeroCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
    const { colors, isDark } = useAppTheme();
    return (
        <View style={[styles.hero, { backgroundColor: colors.feature }, isDark && { borderWidth: 1, borderColor: colors.border }, style]}>
            {children}
        </View>
    );
}

/** Светлая пилюля на чёрной карточке — «New Shipping / Track Shipping» на образце. */
export function HeroPill({ title, icon, onPress, disabled, loading, label }: {
    title: string;
    icon?: IconName;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    /** Подпись для чтения с экрана, если надпись на кнопке короче смысла. */
    label?: string;
}) {
    const off = disabled || loading;
    return (
        <Pressable
            onPress={onPress}
            disabled={off}
            accessibilityRole="button"
            accessibilityLabel={label ?? title}
            accessibilityState={{ disabled: !!off }}
            style={({ pressed }: { pressed: boolean }) => [styles.heroPill, { opacity: off ? 0.55 : pressed ? 0.85 : 1 }]}
        >
            {loading ? <ActivityIndicator color="#0b0d12" /> : (
                <>
                    {icon && <Ionicons name={icon} size={18} color="#0b0d12" />}
                    <Text style={styles.heroPillText} numberOfLines={1}>{title}</Text>
                </>
            )}
        </Pressable>
    );
}

/** Круглая кнопка со значком — справа в приветствии, как колокольчик на образце. */
export function RoundButton({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
    const { colors, isDark } = useAppTheme();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={6}
            style={({ pressed }: { pressed: boolean }) => [
                styles.roundButton,
                { backgroundColor: colors.surface2, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                !isDark && SHADOW,
            ]}
        >
            <Ionicons name={icon} size={20} color={colors.text} />
        </Pressable>
    );
}

/** Три этапа рейса для водителя: какие статусы к какому этапу относятся и где на линии стоит рейс. */
const STAGES: { label: string; part: Record<string, number> }[] = [
    { label: 'Погрузка', part: { ASSIGNED: 0.1, EN_ROUTE_PICKUP: 0.3, AT_PICKUP: 0.55, LOADING: 0.8 } },
    { label: 'В пути', part: { IN_TRANSIT: 0.45 } },
    { label: 'Выгрузка', part: { AT_DELIVERY: 0, UNLOADING: 0 } },
];

/**
 * Ход рейса в три шага — «Погрузка → В пути → Выгрузка», как трекинг посылки
 * на образце владельца. Пройденные шаги — чёрные кружки с галочкой, текущий —
 * чёрное кольцо, будущие — серые. Под шагами — даты погрузки и выгрузки,
 * если они есть в заявке. Восемь статусов рейса водителю знать не нужно:
 * точный статус — в плашке рядом.
 */
export function TripStepper({ status, from, to }: { status: string; from?: string | null; to?: string | null }) {
    const { colors } = useAppTheme();
    const done = status === 'COMPLETED';
    let stage = STAGES.findIndex((s) => status in s.part);
    if (stage < 0) stage = done ? STAGES.length : Math.min(2, Math.floor(statusMeta(status).progress / 40));
    const sub = stage < STAGES.length ? STAGES[stage].part[status] ?? 0 : 0;
    const fill = done ? 1 : Math.min(1, (stage + (stage < STAGES.length - 1 ? sub : 0)) / (STAGES.length - 1));
    const dates = [from, null, to];
    return (
        <View>
            <View style={styles.stepTrack}>
                <View style={[styles.stepLine, { backgroundColor: colors.border }]}>
                    <View style={[styles.stepLineFill, { backgroundColor: colors.text, width: `${fill * 100}%` }]} />
                </View>
                {STAGES.map((s, i) => {
                    const passed = done || i < stage;
                    const current = !done && i === stage;
                    return (
                        <View
                            key={s.label}
                            accessibilityLabel={`${s.label}: ${passed ? 'пройдено' : current ? 'сейчас' : 'впереди'}`}
                            style={[
                                styles.stepNode,
                                passed && { backgroundColor: colors.text, borderColor: colors.text },
                                current && { backgroundColor: colors.surface2, borderColor: colors.text, borderWidth: 2.5 },
                                !passed && !current && { backgroundColor: colors.border, borderColor: colors.border },
                            ]}
                        >
                            {passed && <Ionicons name="checkmark" size={14} color={colors.background} />}
                            {current && <View style={[styles.stepNodeDot, { backgroundColor: colors.text }]} />}
                        </View>
                    );
                })}
            </View>
            <View style={styles.stepLabels}>
                {STAGES.map((s, i) => (
                    <View key={s.label} style={{ flex: 1, alignItems: i === 0 ? 'flex-start' : i === 1 ? 'center' : 'flex-end' }}>
                        <Text style={[styles.stepLabel, { color: !done && i > stage ? colors.textTertiary : colors.text }]}>{s.label}</Text>
                        {!!dates[i] && <Text style={[styles.stepDate, { color: colors.textTertiary }]}>{dates[i]}</Text>}
                    </View>
                ))}
            </View>
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
    card: { borderRadius: RADIUS.card, padding: 18, marginBottom: 12 },
    section: { borderRadius: RADIUS.card, marginBottom: 12, padding: 8 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12 },
    sectionTitle: { flex: 1, fontFamily: FONT.medium, fontSize: 15.5, letterSpacing: -0.2 },
    sectionCount: { fontFamily: FONT.semibold, fontSize: 12.5 },
    sectionInner: { borderRadius: RADIUS.inner, overflow: 'hidden' },
    sectionBody: { padding: 16 },
    screenHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
    backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
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
    choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: RADIUS.inner + 2, marginBottom: 10 },
    choiceTitle: { fontFamily: FONT.semibold, fontSize: 16, letterSpacing: -0.2 },
    choiceText: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
    chip: { paddingHorizontal: 15, height: 36, borderRadius: RADIUS.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.pill },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
        height: 32, paddingLeft: 6, paddingRight: 13, borderRadius: RADIUS.pill,
    },
    statusDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    statusText: { fontFamily: FONT.semibold, fontSize: 13, letterSpacing: -0.1 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8 },
    rowLabel: { fontFamily: FONT.regular, fontSize: 14 },
    rowValue: { flex: 1, fontFamily: FONT.semibold, fontSize: 14.5, textAlign: 'right' },
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
    hero: { borderRadius: 28, padding: 20, paddingBottom: 18, marginBottom: 12, overflow: 'hidden' },
    heroPill: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: 54, borderRadius: 27, backgroundColor: '#eeeff2', borderWidth: 1, borderColor: '#ffffff', paddingHorizontal: 14,
    },
    heroPillText: { fontFamily: FONT.semibold, fontSize: 15.5, letterSpacing: -0.2, color: '#0b0d12' },
    greeting: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 18 },
    avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: FONT.semibold, fontSize: 16, letterSpacing: 0.3 },
    greetingTitle: { fontFamily: FONT.semibold, fontSize: 17, letterSpacing: -0.3 },
    greetingSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    greetingSub: { flex: 1, fontFamily: FONT.regular, fontSize: 12.5 },
    roundButton: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    stepTrack: { height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepLine: { position: 'absolute', left: 12, right: 12, height: 4, borderRadius: 2, overflow: 'hidden' },
    stepLineFill: { height: 4, borderRadius: 2 },
    stepNode: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    stepNodeDot: { width: 8, height: 8, borderRadius: 4 },
    stepLabels: { flexDirection: 'row', marginTop: 10 },
    stepLabel: { fontFamily: FONT.semibold, fontSize: 13, letterSpacing: -0.1 },
    stepDate: { fontFamily: FONT.regular, fontSize: 11.5, marginTop: 2 },
});
