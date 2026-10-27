import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { TripMoney, деньги } from '@/lib/exchange';
import { FONT } from '@/lib/theme';

/** «≈ 1 200 км · ≈ 360 л» — из чего лимит на топливо. */
export function откудаТопливо(distanceKm?: number | null, liters?: number | null): string {
    return [
        distanceKm ? `≈ ${Math.round(distanceKm).toLocaleString('ru-RU').replace(/,/g, ' ')} км` : null,
        liters ? `≈ ${liters.toLocaleString('ru-RU').replace(/,/g, ' ')} л` : null,
    ].filter(Boolean).join(' · ');
}

/**
 * Сумма за рейс по частям (шеф, 27.10.2026): на руки, топливо и пенсионные —
 * всё это деньги водителя. Топливо — лимит на заправку по рейсу: налоговая
 * сверяет расход с пробегом, поэтому заправляться — в его пределах. Один и
 * тот же вид в заявке и в своём отклике.
 */
export function TripMoneyLines({ money, opvPct, distanceKm, liters }: {
    money: TripMoney;
    opvPct?: number;
    distanceKm?: number | null;
    liters?: number | null;
}) {
    const { colors } = useAppTheme();
    const fuelFrom = откудаТопливо(distanceKm, liters);
    return (
        <View style={[styles.box, { borderTopColor: colors.border2 }]}>
            <Part label="Вам на руки" value={money.onHand} strong />
            <Part
                label="Топливо (ГСМ)"
                value={money.fuel}
                hint={money.fuel > 0
                    ? `Лимит на заправку по рейсу${fuelFrom ? ` (${fuelFrom})` : ''}: заправляйтесь в пределах этой суммы, чек — на БИН парка`
                    : 'Топливо по рейсу не посчитано — договоритесь с парком'}
            />
            <Part
                label={`Пенсионные (ОПВ)${opvPct ? ` ${opvPct} %` : ''}`}
                value={money.opv}
                hint="Копятся на вашем пенсионном счёте"
            />
        </View>
    );
}

function Part({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
    const { colors } = useAppTheme();
    return (
        <View style={styles.part}>
            <View style={styles.line}>
                <Text style={{ flex: 1, color: strong ? colors.text : colors.textSecondary, fontSize: 14.5, fontFamily: strong ? FONT.semibold : FONT.regular }}>{label}</Text>
                <Text style={{ color: colors.text, fontSize: strong ? 16 : 14.5, fontFamily: FONT.bold, fontVariant: ['tabular-nums'] }}>{деньги(value)}</Text>
            </View>
            {!!hint && <Text style={[styles.hint, { color: colors.textTertiary }]}>{hint}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    box: { marginTop: 12, paddingTop: 4, borderTopWidth: 1 },
    part: { paddingTop: 8 },
    line: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
    hint: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
});
