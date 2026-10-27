import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { OfferInput, OwnOffer, деньги, суммаЗаРейс } from '@/lib/exchange';
import { Button, Chip } from '@/components/kit';
import { FONT } from '@/lib/theme';

/** Дата YYYY-MM-DD через n дней от сегодня — по часам телефона. */
function inDays(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const READY = [
    { label: 'Сегодня', value: () => inDays(0) },
    { label: 'Завтра', value: () => inDays(1) },
    { label: 'Послезавтра', value: () => inDays(2) },
];

/**
 * Своя сумма — панелью снизу: сколько хотите на руки, когда подадите машину,
 * комментарий. Цифры — крупно и числовой клавиатурой: водитель набирает одной
 * рукой. Сумма — чистыми на руки: топливо и пенсионные парк добавляет сверху,
 * налоги и комиссию — тоже, и компании уходит цена уже с ними (схема шефа,
 * 16.10.2026). Пока водитель набирает, под суммой видно, сколько выйдет за
 * рейс: на руки + топливо + ОПВ (шеф, 27.10.2026); налоги парка и цену
 * компании водитель не видит (Q14).
 */
export function OfferSheet({ visible, mine, busy, fuel, opvPct, onSubmit, onClose }: {
    visible: boolean;
    mine: OwnOffer | null | undefined;
    busy: boolean;
    /** Топливо по километражу рейса, ₸; доля ОПВ, %. Нет доли — расшифровки нет (старый сервер). */
    fuel?: number;
    opvPct?: number;
    onSubmit: (input: OfferInput) => void;
    onClose: () => void;
}) {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const [price, setPrice] = useState('');
    const [ready, setReady] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setPrice(mine && !mine.agreed ? String(mine.price) : '');
        setReady(mine?.readyDate?.slice(0, 10) ?? null);
        setComment(mine?.comment ?? '');
        setError(null);
    }, [visible, mine]);

    const pretty = price ? Number(price).toLocaleString('ru-RU').replace(/,/g, ' ') : '';
    const trip = Number(price) > 0 && opvPct != null ? суммаЗаРейс(Number(price), fuel ?? 0, opvPct) : null;

    const submit = () => {
        const amount = Number(price);
        if (!(amount > 0)) { setError('Впишите сумму в тенге'); return; }
        onSubmit({ price: amount, readyDate: ready ?? undefined, comment: comment.trim() || undefined });
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
                    <View style={[styles.grabber, { backgroundColor: colors.border }]} />
                    <Text style={[styles.title, { color: colors.text }]}>Своя сумма</Text>

                    <Text style={[styles.label, { color: colors.textSecondary }]}>Сколько хотите получить на руки, ₸</Text>
                    <TextInput
                        value={pretty}
                        onChangeText={(v: string) => { setPrice(v.replace(/\D/g, '').slice(0, 10)); setError(null); }}
                        keyboardType="number-pad"
                        placeholder="Например: 250 000"
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.price, { color: colors.text, borderColor: error ? colors.danger : colors.border, backgroundColor: colors.background }]}
                    />
                    {!!error && <Text style={{ color: colors.danger, fontSize: 12.5, marginTop: 4 }}>{error}</Text>}
                    {trip ? (
                        <View style={[styles.trip, { backgroundColor: colors.surface2 }]}>
                            <View style={styles.tripLine}>
                                <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13.5 }}>Сумма за рейс</Text>
                                <Text style={{ color: colors.text, fontSize: 16, fontFamily: FONT.bold, fontVariant: ['tabular-nums'] }}>{деньги(trip.total)}</Text>
                            </View>
                            <Text style={{ color: colors.textTertiary, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>
                                на руки {деньги(trip.onHand)} + топливо {деньги(trip.fuel)} + пенсионные {деньги(trip.opv)}
                            </Text>
                        </View>
                    ) : (
                        <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 6 }}>
                            Топливо и пенсионные добавятся сверху.
                        </Text>
                    )}

                    <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Когда подадите машину</Text>
                    <View style={styles.chips}>
                        {READY.map((r) => {
                            const value = r.value();
                            return <Chip key={r.label} label={r.label} active={ready === value} onPress={() => setReady(ready === value ? null : value)} />;
                        })}
                    </View>

                    <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Комментарий · необязательно</Text>
                    <TextInput
                        value={comment}
                        onChangeText={setComment}
                        placeholder="Например: стою в Шымкенте, ремни есть"
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        style={[styles.comment, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    />

                    <Button title="Отправить отклик" icon="paper-plane-outline" loading={busy} onPress={submit} style={{ marginTop: 16 }} />
                    <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
                        <Text style={{ color: colors.textSecondary, fontSize: 16, fontFamily: FONT.bold }}>Отмена</Text>
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8 },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 14 },
    title: { fontSize: 18, fontFamily: FONT.bold, letterSpacing: -0.3, marginBottom: 12 },
    label: { fontSize: 12.5, fontFamily: FONT.semibold, marginBottom: 6 },
    price: { height: 56, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 24, fontFamily: FONT.bold },
    chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    trip: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
    tripLine: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
    comment: { minHeight: 64, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, textAlignVertical: 'top' },
    cancel: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
