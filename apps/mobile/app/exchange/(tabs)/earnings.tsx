import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Earnings, PayoutStatus, exchangeApi, деньги, ответ, вКавычках } from '@/lib/exchange';
import { BRAND, FONT } from '@/lib/theme';
import { Badge, Button, Card, Empty, Field, HeroCard, HeroPill, Section } from '@/components/kit';
import { useTabBarSpace } from '@/components/TabBar';

/**
 * Три состояния денег — словами задачи владельца (09.10.2026): «Начислено»
 * (рейс довезён, выплату ещё не просили), «Ожидает выплаты» (запрошена;
 * парк может уже переводить) и «Выплачено». Отклонённая выплата — отдельно:
 * её рейсы снова в «Начислено».
 */
const STATUS: Record<PayoutStatus, { label: string; tone: 'blue' | 'orange' | 'green' | 'red' }> = {
    REQUESTED: { label: 'Ожидает выплаты', tone: 'orange' },
    EXPORTED: { label: 'Ожидает выплаты', tone: 'orange' },
    PAID: { label: 'Выплачено', tone: 'green' },
    REJECTED: { label: 'Отклонена', tone: 'red' },
};

const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('ru-RU') : '');

/**
 * Баланс водителя парка (был «Заработок»).
 *
 * Крупно — «Начислено»: сколько придёт на карту за довезённые рейсы. Под
 * ним — откуда эта цифра. По расчёту «на руки» (рейсы с 12.10.2026):
 * договорились, минус что парк дал на топливо; налоги парк платит сверху и
 * из суммы не вычитает. По прежнему расчёту: начислено, комиссия парка, ОПВ,
 * ВОСМС, ИПН. И
 * ещё две суммы: сколько ждёт выплаты и сколько уже выплачено. Ниже — счёт
 * (IBAN), «Запросить выплату» и история выплат. Платит парк — так решил
 * владелец; другого способа вывода экран не обещает.
 */
export default function EarningsScreen() {
    const { colors } = useAppTheme();
    const tabBarSpace = useTabBarSpace();
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
    const waiting = data.payouts.filter((p) => p.status === 'REQUESTED' || p.status === 'EXPORTED');
    const open = waiting.length > 0;
    const waitingSum = waiting.reduce((s, p) => s + p.net, 0);
    const paidSum = data.payouts.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.net, 0);
    // Все рейсы к выплате — по расчёту «на руки»: показываем его расшифровку.
    const onHand = data.trips.length > 0 && data.trips.every((t) => t.driverTotal != null);
    const agreedSum = data.trips.reduce((s, t) => s + (t.driverTotal ?? 0), 0);
    const fuelSum = data.trips.reduce((s, t) => s + (t.fuelIssued ?? 0), 0);
    // Чеки на топливо засчитываются обратно — без этой строки итог не сходится с «Начислено».
    const receiptsSum = data.trips.reduce((s, t) => s + (t.fuelReceipts ?? 0), 0);

    return (
        <ScrollView
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={{ padding: 16, paddingBottom: tabBarSpace + 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
            {/* Сумма к выплате — на чёрной карточке, как баланс на образце владельца;
                «Запросить» — пилюлей на ней же. */}
            <HeroCard>
                <Text style={[styles.eyebrow, { color: colors.featureFg }]}>Начислено — можно запросить</Text>
                <Text style={[styles.big, { color: colors.featureFg }]}>{деньги(a.net)}</Text>
                <Text style={[styles.heroSub, { color: colors.featureFg }]}>
                    {data.trips.length ? `за довезённых рейсов: ${data.trips.length}` : 'Довезите рейс — здесь появится сумма к выплате'}
                </Text>
                {data.trips.length > 0 && !editAccount && (
                    <View style={styles.heroActions}>
                        <HeroPill
                            title={open ? 'Прошлая выплата ещё идёт' : 'Запросить выплату'}
                            icon="wallet-outline"
                            loading={busy}
                            disabled={open}
                            onPress={request}
                        />
                    </View>
                )}
            </HeroCard>

            <Section title={data.trips.length ? 'Откуда сумма' : 'Выплаты'} icon="receipt-outline">
                {onHand && (
                    <View>
                        <Line label="Договорились, на руки" value={деньги(agreedSum)} colors={colors} />
                        <Line label="Выдано: топливо и предоплата" value={`− ${деньги(fuelSum)}`} colors={colors} />
                        {receiptsSum > 0 && <Line label="Чеки на топливо" value={`+ ${деньги(receiptsSum)}`} colors={colors} />}
                        <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
                            Налоги и взносы за вас парк платит сверху — из вашей суммы они не вычитаются и идут в ваш пенсионный счёт и медстраховку.
                        </Text>
                    </View>
                )}
                {data.trips.length > 0 && !onHand && (
                    <View>
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
                {/* Два других состояния денег — под расшифровкой, чтобы она
                    осталась рядом со своей суммой. */}
                <View style={[styles.states, data.trips.length > 0 && { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border2 }]}>
                    <StateLine label="Ожидает выплаты" value={деньги(waitingSum)} hint={open ? `запрошено выплат: ${waiting.length}` : 'запросов нет'} colors={colors} />
                    <StateLine label="Выплачено" value={деньги(paidSum)} hint="за всё время" colors={colors} />
                    {/* ОПВ копится — водитель видит, сколько уже на пенсионном счёте (задачи шефа, Q14). */}
                    {data.opvSaved && (
                        <StateLine
                            label="На ваш пенсионный счёт (ОПВ)"
                            value={деньги(data.opvSaved.total)}
                            hint={`${data.rates.opvPct}% с оплаты за работу · в ${data.opvSaved.year} году — ${деньги(data.opvSaved.thisYear)}`}
                            colors={colors}
                        />
                    )}
                </View>
            </Section>

            <Section title="Счёт для выплаты" icon="card-outline">
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
                            <Text style={{ color: colors.text, fontSize: 15, fontFamily: FONT.semibold }}>{data.iban}</Text>
                            {!!data.bank && <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{data.bank}</Text>}
                        </View>
                        <Button title="Изменить" variant="secondary" onPress={() => setEditAccount(true)} style={{ height: 40, paddingHorizontal: 14 }} />
                    </View>
                )}
            </Section>

            {data.trips.length > 0 && (
                <>
                    <Text style={[styles.section, { color: colors.text }]}>Начислено за рейсы</Text>
                    {data.trips.map((t) => (
                        <Card key={t.orderId} style={{ paddingVertical: 12 }}>
                            <View style={styles.row}>
                                <Text style={{ color: colors.text, fontFamily: FONT.semibold, fontSize: 15, flex: 1 }}>{t.route}</Text>
                                <Text style={{ color: colors.text, fontFamily: FONT.bold, fontSize: 15, fontVariant: ['tabular-nums'] }}>{деньги(t.net)}</Text>
                            </View>
                            <Text style={{ color: colors.textTertiary, fontSize: 12.5 }}>
                                Заявка {t.orderNumber}{t.completedAt ? ` · довёз ${date(t.completedAt)}` : ''}
                                {t.driverTotal != null
                                    ? ` · договорились ${деньги(t.driverTotal)}${t.fuelIssued ? `, выдано ${деньги(t.fuelIssued)}` : ''}`
                                    : ` · начислено ${деньги(t.gross)}`}
                            </Text>
                        </Card>
                    ))}
                </>
            )}

            {data.payouts.length > 0 && (
                <>
                    <Text style={[styles.section, { color: colors.text }]}>История выплат</Text>
                    {data.payouts.map((p) => (
                        <Card key={p.id} style={{ paddingVertical: 12 }}>
                            <View style={styles.row}>
                                <Text style={{ color: colors.text, fontFamily: FONT.bold, fontSize: 16, flex: 1, fontVariant: ['tabular-nums'] }}>{деньги(p.net)}</Text>
                                <Badge label={STATUS[p.status].label} tone={STATUS[p.status].tone} />
                            </View>
                            <Text style={{ color: colors.textTertiary, fontSize: 12.5 }}>
                                Запрошена {date(p.requestedAt)}{p.status === 'EXPORTED' ? ' · парк уже переводит' : ''}{p.paidAt ? ` · выплачено ${date(p.paidAt)}` : ''}{p.trips ? ` · рейсов: ${p.trips}` : ''}
                            </Text>
                            {p.status !== 'REJECTED' && (
                                <Text style={{ color: colors.textTertiary, fontSize: 12.5, marginTop: 2 }}>
                                    {p.fuelIssued != null
                                        ? `Выдано ${деньги(p.fuelIssued)} · налоги за вас платит парк`
                                        : `Начислено ${деньги(p.gross)} · удержано ${деньги(p.gross - p.net)} — комиссия и налоги`}
                                </Text>
                            )}
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

/** Строка состояния под крупной суммой: «Ожидает выплаты», «Выплачено». */
function StateLine({ label, value, hint, colors }: { label: string; value: string; hint: string; colors: { text: string; textSecondary: string; textTertiary: string } }) {
    return (
        <View style={styles.stateLine}>
            <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontFamily: FONT.medium }}>{label}</Text>
                <Text style={{ color: colors.textTertiary, fontSize: 12, fontFamily: FONT.regular }}>{hint}</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 15, fontFamily: FONT.semibold, fontVariant: ['tabular-nums'] }}>{value}</Text>
        </View>
    );
}

function Line({ label, value, colors }: { label: string; value: string; colors: { text: string; textSecondary: string } }) {
    return (
        <View style={styles.line}>
            <Text style={{ color: colors.textSecondary, fontSize: 13.5, flex: 1, fontFamily: FONT.regular }}>{label}</Text>
            <Text style={{ color: colors.text, fontSize: 13.5, fontFamily: FONT.semibold, fontVariant: ['tabular-nums'] }}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    eyebrow: { fontFamily: FONT.regular, fontSize: 13.5, opacity: 0.65 },
    big: { fontFamily: FONT.display, fontSize: 34, letterSpacing: -1.4, marginTop: 8, fontVariant: ['tabular-nums'] },
    heroSub: { fontFamily: FONT.regular, fontSize: 13, opacity: 0.6, marginTop: 4 },
    heroActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
    states: { gap: 6 },
    stateLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
    line: { flexDirection: 'row', paddingVertical: 3 },
    accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    section: { fontFamily: FONT.medium, fontSize: 15.5, marginTop: 12, marginBottom: 10, marginLeft: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
});
