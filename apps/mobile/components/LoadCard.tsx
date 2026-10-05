import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Load, груз, деньги, когдаПросто } from '@/lib/exchange';
import { Card, Route } from '@/components/kit';

/** Груз в ленте: маршрут, когда, что везём, цена. Нажатие — карточка. */
export function LoadCard({ load, onPress }: { load: Load; onPress: () => void }) {
    const { colors } = useAppTheme();
    return (
        <Card onPress={onPress}>
            <View style={styles.top}>
                <View style={styles.date}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.dateText, { color: colors.textSecondary }]}>{когдаПросто(load)}</Text>
                </View>
                <Text style={[styles.price, { color: colors.text }]}>{деньги(load.price)}</Text>
            </View>
            <Route from={load.originCityName} to={load.destinationCityName} />
            <View style={[styles.bottom, { borderTopColor: colors.border }]}>
                <Text style={[styles.cargo, { color: colors.textSecondary }]} numberOfLines={1}>
                    {load.cargoDescription} · {груз(load)}
                </Text>
                {load.photoIds.length > 0 && (
                    <View style={styles.photos}>
                        <Ionicons name="images-outline" size={14} color={colors.textTertiary} />
                        <Text style={{ color: colors.textTertiary, fontSize: 12 }}>{load.photoIds.length}</Text>
                    </View>
                )}
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    date: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateText: { fontSize: 13.5, fontWeight: '600' },
    price: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
    bottom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
    cargo: { flex: 1, fontSize: 13.5 },
    photos: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
