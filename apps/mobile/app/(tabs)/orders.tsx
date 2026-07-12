import { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, Order } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { statusMeta, BRAND, RADIUS } from '@/lib/theme';

function routeOf(order: Order): string {
    const pts = order.routePoints || [];
    const from = pts.find(p => p.pointType !== 'DELIVERY')?.location;
    const to = [...pts].reverse().find(p => p.pointType === 'DELIVERY')?.location;
    const fromLabel = from?.name || from?.address || '?';
    const toLabel = to?.name || to?.address || '?';
    return `${fromLabel} → ${toLabel}`;
}

export default function OrdersScreen() {
    const { orders, ordersLoading, fetchOrders } = useStore();
    const { colors } = useAppTheme();
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchOrders();
    }, []);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchOrders();
        setRefreshing(false);
    };

    const active = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status));
    const finished = orders.filter(o => ['COMPLETED', 'CANCELLED'].includes(o.status));
    const sections = [...active, ...finished];

    const renderItem = ({ item }: { item: Order }) => {
        const meta = statusMeta(item.status);
        const isActive = !['COMPLETED', 'CANCELLED'].includes(item.status);

        return (
            <View style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: isActive ? 'rgba(22,119,255,0.4)' : colors.border },
            ]}>
                <View style={styles.cardTop}>
                    <Text style={[styles.orderNumber, { color: colors.text }]}>№ {item.orderNumber}</Text>
                    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.pillText, { color: meta.fg }]}>{meta.label}</Text>
                    </View>
                </View>
                <Text style={[styles.route, { color: colors.text }]} numberOfLines={1}>
                    {routeOf(item)}
                </Text>
                <View style={styles.cardBottom}>
                    <Text style={[styles.cargo, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.cargoDescription || 'Груз не указан'}
                        {item.cargoWeight ? ` · ${(item.cargoWeight / 1000).toLocaleString('ru-RU')} т` : ''}
                    </Text>
                    {!!item.createdAt && (
                        <Text style={[styles.date, { color: colors.textTertiary }]}>
                            {new Date(item.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    return (
        <FlatList
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={{ padding: 14, paddingBottom: 120, flexGrow: 1 }}
            data={sections}
            keyExtractor={(item: Order) => item.id}
            renderItem={renderItem}
            refreshControl={
                <RefreshControl refreshing={refreshing || ordersLoading} onRefresh={handleRefresh} tintColor={colors.text} />
            }
            ListEmptyComponent={
                <View style={styles.empty}>
                    <View style={[styles.emptyIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Ionicons name="documents-outline" size={40} color={BRAND.primary} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>Рейсов пока нет</Text>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        Здесь появится история ваших рейсов
                    </Text>
                </View>
            }
        />
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: RADIUS.card,
        borderWidth: 1,
        padding: 15,
        marginBottom: 10,
    },
    cardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    orderNumber: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
    pill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: RADIUS.pill,
    },
    pillText: { fontSize: 11.5, fontWeight: '700' },
    route: { fontSize: 14.5, fontWeight: '600', marginTop: 8, letterSpacing: -0.2 },
    cardBottom: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
        gap: 10,
    },
    cargo: { fontSize: 12.5, flex: 1 },
    date: { fontSize: 12 },
    empty: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 120,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 24,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    emptyTitle: { fontSize: 17, fontWeight: '800' },
    emptyText: { fontSize: 13, marginTop: 6 },
});
