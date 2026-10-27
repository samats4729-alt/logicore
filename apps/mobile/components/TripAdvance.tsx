import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AdvanceKind, AdvanceStatus, TripAdvances, exchangeApi, деньги, ответ } from '@/lib/exchange';
import { Badge, Button, Chip, Field, Section } from '@/components/kit';
import { FONT } from '@/lib/theme';

const KIND: Record<AdvanceKind, string> = { FUEL: 'На топливо', ADVANCE: 'Предоплата' };
const STATUS: Record<AdvanceStatus, { label: string; tone: 'orange' | 'green' | 'red' | 'gray' }> = {
    REQUESTED: { label: 'Ждёт парка', tone: 'orange' },
    CHECK: { label: 'На доп. проверке', tone: 'orange' },
    REUPLOAD: { label: 'Перезагрузите документы', tone: 'red' },
    APPROVED: { label: 'Выдано', tone: 'green' },
    REJECTED: { label: 'Отказ', tone: 'red' },
    CANCELLED: { label: 'Отозван', tone: 'gray' },
};
const OPEN: AdvanceStatus[] = ['REQUESTED', 'CHECK', 'REUPLOAD'];

const date = (d: string) => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Деньги заранее: на топливо или предоплата по рейсу (задачи шефа, Q17).
 *
 * Раньше попросить можно было только всё «на руки» и только после рейса.
 * Теперь в рейсе — заранее, и два вида отдельно (шеф, 27.10.2026): на
 * топливо — в пределах лимита по километражу, предоплату — из суммы на
 * руки, не больше доли, что задал парк (обычно 50 %). Запрос уходит в
 * кабинет парка; выданное вычтется из выплаты в конце, топливо — с учётом
 * чеков. Если парк просит перезагрузить документы — причина видна здесь, а
 * после загрузки запрос отправляется снова.
 */
export function TripAdvance({ orderId }: { orderId: string }) {
    const { colors } = useAppTheme();
    const [data, setData] = useState<TripAdvances | null>(null);
    const [kind, setKind] = useState<AdvanceKind>('FUEL');
    const [amount, setAmount] = useState('');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        exchangeApi.tripAdvances(orderId).then(setData).catch(() => setData(null));
    }, [orderId]);
    // При каждом возврате на экран: парк мог решить запрос.
    useFocusEffect(load);

    // Рейс без расчёта суммы водителю (прежняя схема) — блока нет.
    if (!data?.limit) return null;
    const limit = data.limit;
    const of = (k: AdvanceKind) => (k === 'FUEL' ? limit.fuel : limit.advance);
    // По одному запросу каждого вида: пока парк решает прошлый, такой же не отправить.
    const pending = data.requests.some((r) => r.kind === kind && OPEN.includes(r.status));
    const current = of(kind);

    const send = async () => {
        const sum = Number(amount.replace(/\D/g, ''));
        if (!(sum > 0)) { Alert.alert('Сумма', 'Впишите, сколько нужно'); return; }
        setBusy(true);
        try {
            setData(await exchangeApi.requestAdvance(orderId, { kind, amount: sum, comment: comment.trim() || undefined }));
            setAmount('');
            setComment('');
            Alert.alert('Запрос отправлен', 'Парк проверит рейс и документы и ответит здесь же.');
        } catch (e) {
            Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз'));
        } finally {
            setBusy(false);
        }
    };

    const act = async (fn: () => Promise<TripAdvances>, done: string) => {
        try {
            setData(await fn());
            Alert.alert(done);
        } catch (e) {
            Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз'));
        }
    };

    const pretty = amount ? Number(amount).toLocaleString('ru-RU').replace(/,/g, ' ') : '';

    return (
        <Section title="Деньги заранее" icon="wallet-outline">
            <View style={styles.limits}>
                <LimitLine label="На топливо" value={limit.fuel.available} hint={limit.fuel.cap ? `лимит по километражу ${деньги(limit.fuel.cap)}` : 'топливо по рейсу не посчитано'} />
                <LimitLine label="Предоплата" value={limit.advance.available} hint={`${limit.pct} % от суммы на руки ${деньги(limit.onHand)}`} />
            </View>
            <Text style={[styles.note, { color: colors.textSecondary }]}>
                Столько ещё можно попросить — уже выданное и ждущее решения вычтено. Выданное вычтут из выплаты в конце; на топливо — с учётом чеков.
            </Text>

            <View style={[styles.chips, { marginTop: 12 }]}>
                {(['FUEL', 'ADVANCE'] as const).map((k) => (
                    <Chip key={k} label={KIND[k]} active={kind === k} onPress={() => { setKind(k); setAmount(''); }} />
                ))}
            </View>
            {current.available > 0 && !pending && (
                <View>
                    <Field
                        label="Сколько нужно, ₸"
                        value={pretty}
                        onChangeText={(v: string) => setAmount(v.replace(/\D/g, '').slice(0, 9))}
                        keyboardType="number-pad"
                        placeholder={`до ${деньги(current.available)}`}
                    />
                    <Field
                        label="Комментарий"
                        hint="Необязательно: на что и где"
                        value={comment}
                        onChangeText={setComment}
                        maxLength={300}
                    />
                    <Button title="Попросить" icon="paper-plane-outline" loading={busy} onPress={send} />
                </View>
            )}
            {pending ? (
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                    Пока парк решает прошлый запрос {kind === 'FUEL' ? 'на топливо' : 'на предоплату'}, такой же новый не отправить.
                </Text>
            ) : current.available <= 0 && (
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                    {kind === 'FUEL'
                        ? current.cap ? 'Лимит на топливо по рейсу уже выдан или ждёт решения парка.' : 'Топливо по рейсу не посчитано — о деньгах на топливо договоритесь с парком по телефону.'
                        : 'Предоплата по рейсу уже выдана или ждёт решения парка.'}
                </Text>
            )}

            {data.requests.map((r) => (
                <View key={r.id} style={[styles.item, { borderTopColor: colors.border2 }]}>
                    <View style={styles.head}>
                        <Text style={{ flex: 1, color: colors.text, fontFamily: FONT.bold, fontSize: 14.5 }}>
                            {KIND[r.kind]} · {деньги(r.issuedAmount ?? r.amount)}
                        </Text>
                        <Badge label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
                    </View>
                    <View>
                        <Text style={{ color: colors.textTertiary, fontSize: 12 }}>{date(r.createdAt)}</Text>
                        {!!r.parkNote && (
                            <Text style={{ color: r.status === 'REJECTED' || r.status === 'REUPLOAD' ? colors.danger : colors.textSecondary, fontSize: 12.5, marginTop: 2 }}>
                                Парк: {r.parkNote}
                            </Text>
                        )}
                        {r.status === 'REUPLOAD' && (
                            <View style={{ marginTop: 8, gap: 6 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>
                                    Загрузите документы заново в разделе «Документы» этого рейса, затем отправьте запрос снова.
                                </Text>
                                <Button
                                    title="Отправить снова"
                                    icon="refresh-outline"
                                    variant="secondary"
                                    onPress={() => act(() => exchangeApi.resubmitAdvance(r.id), 'Запрос снова у парка')}
                                />
                            </View>
                        )}
                        {OPEN.includes(r.status) && (
                            <Text
                                onPress={() => Alert.alert('Отозвать запрос?', 'Парк его больше не увидит.', [
                                    { text: 'Отмена', style: 'cancel' },
                                    { text: 'Отозвать', style: 'destructive', onPress: () => act(() => exchangeApi.cancelAdvance(r.id), 'Запрос отозван') },
                                ])}
                                style={{ color: colors.textTertiary, fontSize: 12.5, marginTop: 6 }}
                            >
                                Отозвать
                            </Text>
                        )}
                    </View>
                </View>
            ))}
        </Section>
    );
}

/** Сколько ещё можно попросить этого вида — и откуда лимит. */
function LimitLine({ label, value, hint }: { label: string; value: number; hint: string }) {
    const { colors } = useAppTheme();
    return (
        <View style={styles.limitLine}>
            <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14.5, fontFamily: FONT.semibold }}>{label}</Text>
                <Text style={{ color: colors.textTertiary, fontSize: 12.5 }}>{hint}</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 16, fontFamily: FONT.bold, fontVariant: ['tabular-nums'] }}>до {деньги(value)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    limits: { gap: 10, marginBottom: 8 },
    limitLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    note: { fontSize: 13, lineHeight: 18 },
    chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    item: { paddingVertical: 10, borderTopWidth: 1, marginTop: 10 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
});
