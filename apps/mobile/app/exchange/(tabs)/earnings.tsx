import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Earnings, PayoutStatus, exchangeApi, деньги, ответ, вКавычках } from '@/lib/exchange';
import { BRAND } from '@/lib/theme';
import { Badge, Button, Card, Empty, Field } from '@/components/kit';

const STATUS: Record<PayoutStatus, { label: string; tone: 'blue' | 'orange' | 'green' | 'red' }> = {
    REQUESTED: { label: 'Запрошена', tone: 'blue' },
    EXPORTED: { label: 'Парк платит', tone: 'orange' },
    PAID: { label: 'Выплачено', tone: 'green' },
    REJECTED: { label: 'Отклонена', tone: 'red' },
};

const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('ru-RU') : '');

/**
 * Заработок водителя парка.
 *
 * Крупно — сколько придёт на карту за довезённые рейсы. Под ним — откуда
 * эта цифра: начислено, комиссия парка, ОПВ, ВОСМС, ИПН. Ниже — счёт
 * (IBAN), кнопка «Запросить выплату» и история: запрошена → парк платит →
 * выплачено. Отклонил парк — видна причина, рейсы снова к выплате.
 */
export default function EarningsScreen() {
    const { colors } = useAppTheme();
    const [data, setData] = useState<Earnings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [iban, setIban] = useState('');
    const [bank, setBank] = useState('');
    const [editAccount, setEditAccount] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setError(null);
            const e = await exchangeApi.earnings();
            setData(e);
            setIban(e.iban ?? '');
            setBank(e.bank ?? '');
            setEditAccount(!e.iban);
        } catch (e) {
            setError(ответ(e, 'Не удалось загрузить заработок'));
        }
    }, []);
    useFocusEffect(useCallback(() => { load(); }, [load]));
    const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

    const saveAccount = async () => {
        setBusy(true);
        try {
            await exchangeApi.setPayoutAccount(iban, bank);
            await load();
        } catch (e) {
            Alert.alert('Счёт не сохранён', ответ(e, 'Проверьте IBAN'));
        } finally {
            setBusy(false);
        }
    };

    const request = () => {
        if (!data) return;
        Alert.alert(
            `Запросить ${деньги(data.available.net)}?`,
            `Парк ${вКавычках(data.parkName)} переведёт деньги на счёт ${data.iban}. Обычно — в течение нескольких рабочих дней.`,
            [
                { text: 'Отмена', style: 'cancel' },
                {
                    text: 'Запросить',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            const r = await exchangeApi.requestPayout();
                            await load();
                            Alert.alert('Выплата запрошена', `${деньги(r.net)} за ${r.trips} рейс(а). Статус — ниже, в истории.`);
                        } catch (e) {
                            Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз'));
                        } finally {
                            setBusy(false);
                        }
                    },
                },
            ],
        );
    };

    if (error) return <Empty icon="wallet-outline" title="Заработок недоступен" text={error} action={<Button title="Повторить" onPress={load} />} />;
    if (!data) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={BRAND.primary} />;

    const a = data.available;
    const open = data.payouts.some((p) => p.status === 'REQUESTED' || p.status === 'EXPORTED');

    return (
        <ScrollView
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
            <Card>
                <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>К ВЫПЛАТЕ НА КАРТУ</Text>
                <Text style={[styles.big, { color: colors.text }]}>{деньги(a.net)}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {data.trips.length ? `за довезённых рейсов: ${data.trips.length}` : 'Довезите рейс — здесь появится сумма к выплате'}
                </Text>
                {data.trips.length > 0 && (
                    <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
                        <Line label="Начислено за рейсы" value={деньги(a.gross)} colors={colors} />
                        <Line label={`Комиссия парка ${data.rates.commissionPct}%`} value={`− ${деньги(a.commission)}`} colors={colors} />
                        <Line label={`Пенсионные (ОПВ) ${data.rates.opvPct}%`} value={`− ${деньги(a.opv)}`} colors={colors} />
                        <Line label={`Медстрахование (ВОСМС) ${data.rates.vosmsPct}%`} value={`− ${деньги(a.vosms)}`} colors={colors} />
                        <Line label={`Подоходный налог (ИПН) ${data.rates.ipnPct}%`} value={`− ${деньги(a.ipn)}`} colors={colors} />
                        <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
                            Налоги и взносы парк платит за вас по закону — это идёт в ваш пенсионный счёт и медстраховку.
                        </Text>
                    </View>
                )}
            </Card>

            <Card>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Счёт для выплаты</Text>
                {editAccount ? (
                    <>
                        <Field
                            label="IBAN"
                            hint="20 знаков, начинается с KZ — есть в приложении банка"
                            value={iban}
                            onChangeText={(v: string) => setIban(v.toUpperCase())}
                            autoCapitalize="characters"
                            placeholder="KZ00 0000 0000 0000 0000"
                        />
                        <Field label="Банк" hint="Необязательно" value={bank} onChangeText={setBank} placeholder="Например: Kaspi" />
                        <Button title="Сохранить счёт" loading={busy} onPress={saveAccount} />
                    </>
                ) : (
                    <View style={styles.accountRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{data.iban}</Text>
                            {!!data.bank && <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{data.bank}</Text>}
                        </View>
                        <Button title="Изменить" variant="secondary" onPress={() => setEditAccount(true)} style={{ height: 40, paddingHorizontal: 14 }} />
                    </View>
                )}
            </Card>

            {data.trips.length > 0 && !editAccount && (
                <Button
                    title={open ? 'Прошлая выплата ещё идёт' : `Запросить ${деньги(a.net)}`}
                    icon="wallet-outline"
                    loading={busy}
                    disabled={open}
                    onPress={request}
                    style={{ marginBottom: 12 }}
                />
            )}

            {data.trips.length > 0 && (
                <>
                    <Text style={[styles.section, { color: colors.textTertiary }]}>РЕЙСЫ К ВЫПЛАТЕ</Text>
                    {data.trips.map((t) => (
                        <Card key={t.orderId} style={{ paddingVertical: 12 }}>
                            <View style={styles.row}>
                                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, flex: 1 }}>{t.route}</Text>
                                <Text style={{ color: colors.text, fontWeight: '800' }}>{деньги(t.net)}</Text>
                            </View>
                            <Text style={{ color: colors.textTertiary, fontSize: 12.5 }}>
                                Заявка {t.orderNumber}{t.completedAt ? ` · довёз ${date(t.completedAt)}` : ''} · начислено {деньги(t.gross)}
                            </Text>
                        </Card>
                    ))}
                </>
            )}

            {data.payouts.length > 0 && (
                <>
                    <Text style={[styles.section, { color: colors.textTertiary }]}>ИСТОРИЯ ВЫПЛАТ</Text>
                    {data.payouts.map((p) => (
                        <Card key={p.id} style={{ paddingVertical: 12 }}>
                            <View style={styles.row}>
                                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 }}>{деньги(p.net)}</Text>
                                <Badge label={STATUS[p.status].label} tone={STATUS[p.status].tone} />
                            </View>
                            <Text style={{ color: colors.textTertiary, fontSize: 12.5 }}>
                                Запрошена {date(p.requestedAt)}{p.paidAt ? ` · выплачено ${date(p.paidAt)}` : ''}{p.trips ? ` · рейсов: ${p.trips}` : ''}
                            </Text>
                            {!!p.rejectReason && (
                                <Text style={{ color: colors.danger, fontSize: 13, marginTop: 4 }}>
                                    Парк отклонил: {p.rejectReason}. Рейсы снова к выплате.
                                </Text>
                            )}
                        </Card>
                    ))}
                </>
            )}
        </ScrollView>
    );
}

function Line({ label, value, colors }: { label: string; value: string; colors: { text: string; textSecondary: string } }) {
    return (
        <View style={styles.line}>
            <Text style={{ color: colors.textSecondary, fontSize: 13.5, flex: 1 }}>{label}</Text>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600' }}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    big: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
    breakdown: { marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
    line: { flexDirection: 'row', paddingVertical: 3 },
    cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
    accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    section: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginTop: 12, marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
});
