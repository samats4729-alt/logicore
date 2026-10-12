import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { TripFuel as Fuel, exchangeApi, деньги, ответ } from '@/lib/exchange';
import { Badge, Button, Section } from '@/components/kit';
import { CapturedPhoto, DocumentCapture } from '@/components/DocumentCapture';

const STATUS: Record<Fuel['receipts']['items'][number]['status'], { label: string; tone: 'orange' | 'green' | 'red' }> = {
    PENDING: { label: 'На проверке', tone: 'orange' },
    ACCEPTED: { label: 'Принят', tone: 'green' },
    REJECTED: { label: 'Отклонён', tone: 'red' },
};

const date = (d: string) => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Топливо в рейсе водителя парка (решение владельца 12.10.2026).
 *
 * Доехал до заправки — звонит менеджеру парка; тот оплачивает сам или
 * переводит деньги. Кассир пробивает чек на БИН парка — он здесь крупно,
 * чтобы показать на кассе. Водитель фотографирует чек и вписывает сумму.
 * Сразу видно, сколько парк уже дал на топливо и сколько останется в конце.
 *
 * Рейс по прежнему расчёту (до 12.10.2026) — раздела нет: сервер отвечает
 * отказом, и мы молча ничего не рисуем.
 */
export function TripFuel({ orderId }: { orderId: string }) {
    const { colors } = useAppTheme();
    const [fuel, setFuel] = useState<Fuel | null>(null);
    const [capture, setCapture] = useState(false);
    const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        exchangeApi.tripFuel(orderId).then(setFuel).catch(() => setFuel(null));
    }, [orderId]);
    // При каждом возврате на экран: парк мог дать денег на топливо или принять чек.
    useFocusEffect(load);

    if (!fuel) return null;

    const send = async (amount: number) => {
        if (!photo) return;
        setBusy(true);
        try {
            setFuel(await exchangeApi.addFuelReceipt(orderId, amount, photo.uri));
            setPhoto(null);
            Alert.alert('Чек отправлен', 'Парк проверит его и примет. Сумма засчитается в топливо по рейсу.');
        } catch (e) {
            Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз'));
        } finally {
            setBusy(false);
        }
    };

    const remove = (id: string) => {
        Alert.alert('Убрать чек?', 'Пока парк его не проверил, можно убрать и сфотографировать заново.', [
            { text: 'Отмена', style: 'cancel' },
            {
                text: 'Убрать', style: 'destructive',
                onPress: async () => {
                    try { setFuel(await exchangeApi.removeFuelReceipt(id)); } catch (e) { Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз')); }
                },
            },
        ]);
    };

    const bin = fuel.park?.bin;
    const phone = fuel.park?.phone;
    const noReceipt = Math.max(0, fuel.issued.total - fuel.receipts.accepted - fuel.receipts.pending);

    return (
        <Section title="Топливо" icon="speedometer-outline" right={fuel.fuelEstimate ? `≈ ${деньги(fuel.fuelEstimate)}` : undefined}>
            {/* БИН — крупно: водитель показывает его кассиру. */}
            <View style={[styles.binBox, { backgroundColor: colors.surface2, borderColor: colors.border2 }]}>
                <Text style={[styles.binLabel, { color: colors.textTertiary }]}>ЧЕК — НА БИН ПАРКА</Text>
                <Text selectable style={[styles.bin, { color: colors.text }]}>{bin || 'БИН не указан'}</Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                    {fuel.park?.name ? `${fuel.park.name}. ` : ''}Покажите кассиру — он пробьёт чек на парк. Без этого с денег на топливо будет налог.
                </Text>
            </View>

            {/* Друг под другом: в половину ширины телефона подписи не помещаются. */}
            <View style={styles.actions}>
                {!fuel.locked && (
                    <Button title="Сфотографировать чек" icon="camera-outline" onPress={() => setCapture(true)} />
                )}
                {!!phone && (
                    <Button title="Позвонить в парк" icon="call-outline" variant="secondary" onPress={() => Linking.openURL(`tel:${phone}`)} />
                )}
            </View>

            <View style={[styles.sums, { borderTopColor: colors.border2 }]}>
                {fuel.driverTotal != null && <Line label="Договорились, на руки" value={деньги(fuel.driverTotal)} />}
                <Line label="Парк дал на топливо" value={fuel.issued.total ? деньги(fuel.issued.total) : '—'} />
                {fuel.toPay != null && <Line label="Вам останется" value={деньги(fuel.toPay)} strong />}
                {fuel.receipts.pending > 0 && (
                    <Text style={[styles.note, { color: colors.textSecondary }]}>
                        Чеки на {деньги(fuel.receipts.pending)} — на проверке у парка.
                    </Text>
                )}
                {/* Тревожно — только то, на что чека нет вовсе: ждущие проверки — не в счёт. */}
                {noReceipt > 0 && (
                    <Text style={[styles.warn, { color: colors.danger }]}>
                        Нет чека на {деньги(noReceipt)} — с этой суммы будет налог. Отправьте чек.
                    </Text>
                )}
                {fuel.locked && (
                    <Text style={[styles.note, { color: colors.textSecondary, marginTop: 6 }]}>Выплата по рейсу запрошена — топливо по нему закрыто.</Text>
                )}
            </View>

            {fuel.receipts.items.length > 0 && (
                <View style={{ marginTop: 10 }}>
                    {fuel.receipts.items.map((r) => (
                        <View key={r.id} style={[styles.receipt, { borderTopColor: colors.border2 }]}>
                            <Ionicons name="receipt-outline" size={18} color={colors.textSecondary} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14.5 }}>{деньги(r.amount)}</Text>
                                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>{date(r.createdAt)}</Text>
                                {r.status === 'REJECTED' && !!r.rejectReason && (
                                    <Text style={{ color: colors.danger, fontSize: 12.5, marginTop: 2 }}>{r.rejectReason}</Text>
                                )}
                            </View>
                            <Badge label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
                            {r.status === 'PENDING' && !fuel.locked && (
                                <Pressable onPress={() => remove(r.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Убрать чек">
                                    <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                                </Pressable>
                            )}
                        </View>
                    ))}
                </View>
            )}

            <DocumentCapture
                visible={capture}
                title="Чек на топливо"
                hint="Чек целиком: видны сумма и БИН парка"
                onClose={() => setCapture(false)}
                onDone={(p) => { setCapture(false); setPhoto(p); }}
            />
            <AmountSheet visible={!!photo} busy={busy} onSubmit={send} onClose={() => setPhoto(null)} />
        </Section>
    );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    const { colors } = useAppTheme();
    return (
        <View style={styles.line}>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{label}</Text>
            <Text style={{ color: colors.text, fontSize: strong ? 16 : 14.5, fontWeight: strong ? '800' : '700' }}>{value}</Text>
        </View>
    );
}

/** Сумма из чека — крупно, цифровой клавиатурой; фото уже снято. */
function AmountSheet({ visible, busy, onSubmit, onClose }: { visible: boolean; busy: boolean; onSubmit: (amount: number) => void; onClose: () => void }) {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { if (visible) { setValue(''); setError(null); } }, [visible]);
    const pretty = value ? Number(value).toLocaleString('ru-RU').replace(/,/g, ' ') : '';
    const submit = () => {
        const amount = Number(value);
        if (!(amount > 0)) { setError('Впишите сумму из чека'); return; }
        onSubmit(amount);
    };
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
                    <Text style={[styles.sheetTitle, { color: colors.text }]}>Сумма по чеку</Text>
                    <TextInput
                        value={pretty}
                        onChangeText={(v: string) => { setValue(v.replace(/\D/g, '').slice(0, 9)); setError(null); }}
                        keyboardType="number-pad"
                        autoFocus
                        placeholder="Например: 45 000"
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.amount, { color: colors.text, borderColor: error ? colors.danger : colors.border, backgroundColor: colors.background }]}
                    />
                    {!!error && <Text style={{ color: colors.danger, fontSize: 12.5, marginTop: 4 }}>{error}</Text>}
                    <Button title="Отправить чек" icon="paper-plane-outline" loading={busy} onPress={submit} style={{ marginTop: 14 }} />
                    <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
                        {busy ? <ActivityIndicator /> : <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '700' }}>Отмена</Text>}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    binBox: { borderRadius: 14, borderWidth: 1, padding: 12 },
    binLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
    bin: { fontSize: 26, fontWeight: '800', letterSpacing: 1.5, marginTop: 2, fontVariant: ['tabular-nums'] },
    note: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
    actions: { gap: 8, marginTop: 10 },
    sums: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, gap: 6 },
    line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    warn: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
    receipt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 16 },
    sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
    amount: { height: 56, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 24, fontWeight: '800' },
    cancel: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
