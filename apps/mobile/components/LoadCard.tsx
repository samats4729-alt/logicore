import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { ExchangeOrder, груз, деньги, когдаПросто, черезТочки } from '@/lib/exchange';
import { Badge, Card, Route } from '@/components/kit';

/** Заявка в ленте: маршрут, когда, что везём, цена. Нажатие — карточка. */
export function LoadCard({ order, onPress }: { order: ExchangeOrder; onPress: () => void }) {
    const { colors } = useAppTheme();
    const via = черезТочки(order);
    return (
        <Card onPress={onPress}>
            <View style={styles.top}>
                <View style={styles.date}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.dateText, { color: colors.textSecondary }]}>{когдаПросто(order.loadingDate)}</Text>
                </View>
                <Text style={[styles.price, { color: colors.text }]}>{order.price != null ? деньги(order.price) : 'договорная'}</Text>
            </View>
            <Route from={order.from} fromAddress={via} to={order.to} />
            <View style={[styles.bottom, { borderTopColor: colors.border }]}>
                <Text style={[styles.cargo, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[order.cargoDescription, груз(order)].filter(Boolean).join(' · ') || 'Груз не описан'}
                </Text>
                {order.myOfferStatus === 'ACTIVE' && <Badge label="Вы откликнулись" tone="blue" />}
                {order.myOfferStatus === 'ACCEPTED' && <Badge label="Вас выбрали" tone="green" />}
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
});
