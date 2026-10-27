import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Pension, exchangeApi, деньги, когда } from '@/lib/exchange';
import { Card } from '@/components/kit';
import { FONT } from '@/lib/theme';

/** Сколько столбиков роста видно — последние рейсы. */
const BARS = 12;
/** Рейсов в списке, пока не раскрыли. */
const SHORT = 3;

/**
 * Пенсионные (ОПВ) по всем рейсам — отдельной ячейкой в профиле (шеф,
 * 27.10.2026): итог крупно и столбики, как он рос от рейса к рейсу, — у
 * водителя появляется чувство пассивного дохода. Ниже — прибавка с каждого
 * рейса и честно: что уже на пенсионном счёте, а что уйдёт с выплатой.
 *
 * Только для водителей парка: у водителя со своим ИП взносы — его забота.
 * Старый сервер такого раздела не знает — тогда ячейки нет.
 */
export function PensionCard() {
    const { colors } = useAppTheme();
    const [data, setData] = useState<Pension | null>(null);
    const [all, setAll] = useState(false);

    useFocusEffect(useCallback(() => {
        exchangeApi.pension().then(setData).catch(() => setData(null));
    }, []));

    if (!data) return null;
    const last = data.trips[0];
    // Столбики — от старых к новым: последний справа и выделен.
    const bars = data.trips.slice(0, BARS).reverse();
    const max = Math.max(...bars.map((t) => t.total), 1);
    const shown = all ? data.trips : data.trips.slice(0, SHORT);

    return (
        <Card>
            <View style={styles.head}>
                <Ionicons name="trending-up" size={18} color={colors.pos} />
                <Text style={[styles.label, { color: colors.textTertiary }]}>ПЕНСИОННЫЕ (ОПВ)</Text>
            </View>
            <View style={styles.totalRow}>
                <Text style={[styles.total, { color: colors.text }]}>{деньги(data.total)}</Text>
                {!!last && (
                    <View style={[styles.plus, { backgroundColor: colors.posSoft }]}>
                        <Text style={{ color: colors.pos, fontFamily: FONT.bold, fontSize: 13, fontVariant: ['tabular-nums'] }}>+{деньги(last.opv)}</Text>
                    </View>
                )}
            </View>
            <Text style={[styles.note, { color: colors.textSecondary }]}>
                {data.trips.length
                    ? `${data.opvPct} % с каждого рейса — на ваш пенсионный счёт.`
                    : `${data.opvPct} % с каждого рейса будет копиться здесь.`}
            </Text>

            {bars.length > 0 && (
                <View style={styles.bars} accessibilityLabel={`Рост за последние ${bars.length} рейсов`}>
                    {bars.map((t, i) => (
                        <View
                            key={t.orderId}
                            style={[styles.bar, {
                                height: `${Math.max(6, (t.total / max) * 100)}%`,
                                backgroundColor: i === bars.length - 1 ? colors.pos : colors.border,
                            }]}
                        />
                    ))}
                    {/* Пустые места — следующие рейсы: столбики одной ширины, и видно, куда расти. */}
                    {Array.from({ length: BARS - bars.length }, (_, i) => (
                        <View key={`next-${i}`} style={[styles.bar, { height: '6%', backgroundColor: colors.border2 }]} />
                    ))}
                </View>
            )}

            <View style={[styles.split, { borderTopColor: colors.border2 }]}>
                <Split label="Перечислено" value={data.paid} />
                <Split label="С ближайшей выплатой" value={data.waiting} />
                {data.upcoming > 0 && <Split label="За рейс в пути" value={data.upcoming} plus />}
            </View>

            {shown.length > 0 && (
                <View style={{ marginTop: 6 }}>
                    {shown.map((t) => (
                        <View key={t.orderId} style={[styles.trip, { borderTopColor: colors.border2 }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.pos, fontFamily: FONT.bold, fontSize: 14.5, fontVariant: ['tabular-nums'] }}>+{деньги(t.opv)}</Text>
                                <Text style={{ color: colors.textTertiary, fontSize: 12.5 }} numberOfLines={1}>
                                    {когда(t.completedAt)} · {t.paid ? 'перечислено' : 'с выплатой'} · {t.route}
                                </Text>
                            </View>
                            <Text style={{ color: colors.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>стало {деньги(t.total)}</Text>
                        </View>
                    ))}
                    {data.trips.length > SHORT && (
                        <Pressable onPress={() => setAll(!all)} accessibilityRole="button" style={styles.more}>
                            <Text style={{ color: colors.accent, fontFamily: FONT.semibold, fontSize: 14 }}>
                                {all ? 'Свернуть' : `Все рейсы (${data.trips.length})`}
                            </Text>
                        </Pressable>
                    )}
                </View>
            )}
        </Card>
    );
}

function Split({ label, value, plus }: { label: string; value: number; plus?: boolean }) {
    const { colors } = useAppTheme();
    return (
        <View style={styles.splitLine}>
            <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13.5 }}>{label}</Text>
            <Text style={{ color: plus ? colors.pos : colors.text, fontSize: 14, fontFamily: FONT.bold, fontVariant: ['tabular-nums'] }}>
                {plus ? '+' : ''}{деньги(value)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { fontSize: 11, fontFamily: FONT.bold, letterSpacing: 1.1 },
    totalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    total: { fontSize: 30, fontFamily: FONT.bold, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
    plus: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    note: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
    bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 56, marginTop: 12 },
    bar: { flex: 1, borderRadius: 3 },
    split: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, gap: 6 },
    splitLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    trip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1 },
    more: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
