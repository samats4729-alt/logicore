import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { OfferInput, OwnOffer } from '@/lib/exchange';
import { Button, Chip } from '@/components/kit';

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
 * Своя цена — панелью снизу: сумма, когда подадите машину, комментарий.
 * Цифры — крупно и числовой клавиатурой: водитель набирает одной рукой.
 */
export function OfferSheet({ visible, mine, busy, onSubmit, onClose }: {
    visible: boolean;
    mine: OwnOffer | null | undefined;
    busy: boolean;
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

    const submit = () => {
        const amount = Number(price);
        if (!(amount > 0)) { setError('Впишите свою цену в тенге'); return; }
        onSubmit({ price: amount, readyDate: ready ?? undefined, comment: comment.trim() || undefined });
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
                    <View style={[styles.grabber, { backgroundColor: colors.border }]} />
                    <Text style={[styles.title, { color: colors.text }]}>Своя цена</Text>

                    <Text style={[styles.label, { color: colors.textSecondary }]}>Сколько хотите за рейс, ₸</Text>
                    <TextInput
                        value={pretty}
                        onChangeText={(v: string) => { setPrice(v.replace(/\D/g, '').slice(0, 10)); setError(null); }}
                        keyboardType="number-pad"
                        placeholder="Например: 400 000"
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.price, { color: colors.text, borderColor: error ? colors.danger : colors.border, backgroundColor: colors.background }]}
                    />
                    {!!error && <Text style={{ color: colors.danger, fontSize: 12.5, marginTop: 4 }}>{error}</Text>}

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
                        <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '700' }}>Отмена</Text>
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
    title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 12 },
    label: { fontSize: 12.5, fontWeight: '600', marginBottom: 6 },
    price: { height: 56, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 24, fontWeight: '800' },
    chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    comment: { minHeight: 64, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, textAlignVertical: 'top' },
    cancel: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
