import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FONT, RADIUS } from '@/lib/theme';
import { Button, Chip } from '@/components/kit';

/** Частые причины — одной кнопкой: в кабине некогда печатать. */
const REASONS = ['Поломка машины', 'Очередь на складе', 'Груз не готов', 'Пробка, дорога', 'ДТП', 'Другое'];

/**
 * «Сообщить о проблеме» — панелью снизу: причина одним нажатием и, если
 * нужно, пара слов. Раньше на Android диспетчер получал только «водитель
 * сообщил о проблеме» без подробностей: системное окно не умеет поле ввода.
 */
export function ProblemSheet({ visible, onSubmit, onClose }: {
    visible: boolean;
    onSubmit: (text: string) => Promise<void> | void;
    onClose: () => void;
}) {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const [reason, setReason] = useState<string | null>(null);
    const [details, setDetails] = useState('');
    const [busy, setBusy] = useState(false);

    // Каждый раз — с чистого листа.
    useEffect(() => {
        if (visible) { setReason(null); setDetails(''); }
    }, [visible]);

    const text = [reason && reason !== 'Другое' ? reason : null, details.trim() || null].filter(Boolean).join(': ');
    const canSend = !!text && !busy;

    const send = async () => {
        if (!canSend) return;
        setBusy(true);
        try {
            await onSubmit(text);
            onClose();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
                <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
                    <View style={[styles.grabber, { backgroundColor: colors.border }]} />
                    <Text style={[styles.title, { color: colors.text }]}>Что случилось?</Text>
                    <Text style={[styles.text, { color: colors.textSecondary }]}>Диспетчер сразу увидит сообщение в заявке.</Text>

                    <View style={styles.reasons}>
                        {REASONS.map((r) => (
                            <Chip key={r} label={r} active={reason === r} onPress={() => setReason(reason === r ? null : r)} />
                        ))}
                    </View>

                    <TextInput
                        value={details}
                        onChangeText={setDetails}
                        placeholder={reason === 'Другое' ? 'Опишите, что случилось' : 'Пара слов, если нужно (необязательно)'}
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        maxLength={300}
                        style={[styles.input, { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border }]}
                    />

                    <Button title="Отправить диспетчеру" icon="send" onPress={send} loading={busy} disabled={!canSend} />
                    <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
                        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Отмена</Text>
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 8 },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 16 },
    title: { fontFamily: FONT.display, fontSize: 19, letterSpacing: -0.7 },
    text: { fontFamily: FONT.regular, fontSize: 13.5, lineHeight: 19, marginTop: 5 },
    reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
    input: {
        minHeight: 72,
        maxHeight: 140,
        borderWidth: 1,
        borderRadius: RADIUS.input,
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 12,
        marginTop: 14,
        marginBottom: 14,
        fontFamily: FONT.regular,
        fontSize: 15,
        textAlignVertical: 'top',
    },
    cancel: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    cancelText: { fontFamily: FONT.semibold, fontSize: 15 },
});
