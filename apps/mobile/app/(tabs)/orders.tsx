import { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Pressable,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
    const { orders, ordersLoading, fetchOrders, currentOrder } = useStore();
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
        // Нажимается только рейс, который сейчас открыт на вкладке «Рейс»:
        // у остальных отдельного экрана нет, и карточка не должна казаться кнопкой.
        const isCurrent = !!currentOrder && currentOrder.id === item.id;
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
                <Pressable
                    disabled={!isCurrent}
                    onPress={() => router.navigate('/')}
                    accessibilityRole={isCurrent ? 'button' : undefined}
                    accessibilityLabel={isCurrent ? `Открыть текущий рейс № ${item.orderNumber}` : undefined}
                    style={({ pressed }: { pressed: boolean }) => [
                        styles.card,
                        isActive
                            ? [{ backgroundColor: colors.card, borderColor: isCurrent ? colors.text : colors.border }, !isDark && SHADOW]
                            : { backgroundColor: 'transparent', borderColor: colors.border },
                        isCurrent && { borderWidth: 1.5 },
                        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                    ]}
                >
                    <View style={styles.cardTop}>
                        <Text style={[styles.orderNumber, { color: isActive ? colors.text : colors.textSecondary }]}>№ {item.orderNumber}</Text>
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
                            <Text style={[styles.place, { color: isActive ? colors.text : colors.textSecondary }]} numberOfLines={1}>{from}</Text>
                            <Text style={[styles.place, { color: isActive ? colors.text : colors.textSecondary }]} numberOfLines={1}>{to}</Text>
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
                    {isCurrent && (
                        <View style={[styles.openRow, { borderTopColor: colors.border2 }]}>
                            <Text style={[styles.openText, { color: colors.text }]}>Текущий рейс — открыть</Text>
                            <Ionicons name="chevron-forward" size={16} color={colors.text} />
                        </View>
                    )}
                </Pressable>
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
            ListHeaderComponent={<ScreenHeader eyebrow="Все рейсы" title="История" />}
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
    openRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        paddingVertical: 12,
        marginTop: -2,
    },
    openText: { fontFamily: FONT.semibold, fontSize: 13.5 },
    empty: {
        flex: 1,
        justifyContent: 'center',
        paddingBottom: 60,
    },
});
