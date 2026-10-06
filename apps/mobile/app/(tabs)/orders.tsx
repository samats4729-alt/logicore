import { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    RefreshControl,
} from 'react-native';
import { useStore, Order } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FONT, RADIUS, SHADOW } from '@/lib/theme';
import { Empty, ScreenHeader, StatusPill } from '@/components/kit';

function routeEnds(order: Order): { from: string; to: string } {
    const pts = order.routePoints || [];
    const from = pts.find(p => p.pointType !== 'DELIVERY')?.location;
    const to = [...pts].reverse().find(p => p.pointType === 'DELIVERY')?.location;
    return {
        from: from?.name || from?.address || '?',
        to: to?.name || to?.address || '?',
    };
}

export default function OrdersScreen() {
    const { orders, ordersLoading, fetchOrders } = useStore();
    const { colors, isDark } = useAppTheme();
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

    const renderItem = ({ item, index }: { item: Order; index: number }) => {
        const isActive = !['COMPLETED', 'CANCELLED'].includes(item.status);
        const { from, to } = routeEnds(item);
        // Подпись группы — над первым рейсом «в работе» и над первым завершённым.
        const groupTitle = index === 0
            ? (isActive ? `В работе · ${active.length}` : `Завершённые · ${finished.length}`)
            : index === active.length ? `Завершённые · ${finished.length}` : null;

        return (
            <View>
                {!!groupTitle && (
                    <Text style={[styles.group, { color: colors.textTertiary }, index > 0 && { marginTop: 14 }]}>{groupTitle}</Text>
                )}
                <View style={[
                    styles.card,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    !isDark && SHADOW,
                    !isActive && { opacity: 0.92 },
                ]}>
                    <View style={styles.cardTop}>
                        <Text style={[styles.orderNumber, { color: colors.text }]}>№ {item.orderNumber}</Text>
                        <StatusPill status={item.status} />
                    </View>
                    {!!item.customerCompany?.name && (
                        <Text style={[styles.customer, { color: colors.textTertiary }]} numberOfLines={1}>{item.customerCompany.name}</Text>
                    )}

                    <View style={styles.route}>
                        <View style={styles.rail}>
                            <View style={[styles.dot, { backgroundColor: colors.text }]} />
                            <View style={[styles.railLine, { backgroundColor: colors.border }]} />
                            <View style={[styles.dot, { borderWidth: 2, borderColor: colors.text }]} />
                        </View>
                        <View style={{ flex: 1, gap: 8 }}>
                            <Text style={[styles.place, { color: colors.text }]} numberOfLines={1}>{from}</Text>
                            <Text style={[styles.place, { color: colors.text }]} numberOfLines={1}>{to}</Text>
                        </View>
                    </View>

                    <View style={[styles.cardBottom, { borderTopColor: colors.border2 }]}>
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
            </View>
        );
    };

    return (
        <FlatList
            style={{ flex: 1, backgroundColor: colors.background }}
            // Поля по бокам у списка, а шапка — во всю ширину, как на остальных экранах.
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 124, flexGrow: 1 }}
            data={sections}
            keyExtractor={(item: Order) => item.id}
            renderItem={renderItem}
            ListHeaderComponent={<ScreenHeader eyebrow="История" title="Мои рейсы" />}
            ListHeaderComponentStyle={{ marginHorizontal: -16 }}
            refreshControl={
                <RefreshControl refreshing={refreshing || ordersLoading} onRefresh={handleRefresh} tintColor={colors.text} />
            }
            ListEmptyComponent={
                <View style={styles.empty}>
                    <Empty icon="documents-outline" title="Рейсов пока нет" text="Здесь появится история ваших рейсов" />
                </View>
            }
        />
    );
}

const styles = StyleSheet.create({
    group: { fontFamily: FONT.displayMedium, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 },
    card: {
        borderRadius: RADIUS.card,
        borderWidth: 1,
        paddingTop: 15,
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    cardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
    },
    orderNumber: { fontFamily: FONT.semibold, fontSize: 15, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
    customer: { fontFamily: FONT.regular, fontSize: 13, marginTop: 3 },
    route: { flexDirection: 'row', gap: 12, marginTop: 14 },
    rail: { alignItems: 'center', paddingTop: 6, paddingBottom: 6 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    railLine: { width: 1.5, flex: 1, marginVertical: 3 },
    place: { fontFamily: FONT.medium, fontSize: 15, letterSpacing: -0.2 },
    cardBottom: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 14,
        paddingVertical: 12,
        borderTopWidth: 1,
        gap: 10,
    },
    cargo: { fontFamily: FONT.regular, fontSize: 13, flex: 1 },
    date: { fontFamily: FONT.medium, fontSize: 12, fontVariant: ['tabular-nums'] },
    empty: {
        flex: 1,
        justifyContent: 'center',
        paddingBottom: 60,
    },
});
