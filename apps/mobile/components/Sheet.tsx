import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { RADIUS } from '@/lib/theme';

export type SheetOption = {
    label: string;
    onPress: () => void;
    icon?: keyof typeof Ionicons.glyphMap;
    danger?: boolean;
};

/**
 * Выбор из списка — панелью снизу.
 *
 * Системное окно Android показывает не больше трёх кнопок: причины отказа
 * и навигаторы в него не помещались, часть вариантов водитель просто не
 * видел. Здесь вариантов сколько угодно, и каждый — под палец.
 */
export function Sheet({ visible, title, text, options, onClose }: {
    visible: boolean;
    title: string;
    text?: string;
    options: SheetOption[];
    onClose: () => void;
}) {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
            <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
                <View style={[styles.grabber, { backgroundColor: colors.border }]} />
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                {!!text && <Text style={[styles.text, { color: colors.textSecondary }]}>{text}</Text>}
                <View style={{ marginTop: 8 }}>
                    {options.map((o) => (
                        <Pressable
                            key={o.label}
                            accessibilityRole="button"
                            onPress={() => { onClose(); o.onPress(); }}
                            style={({ pressed }: { pressed: boolean }) => [
                                styles.option,
                                { borderColor: colors.border, backgroundColor: pressed ? colors.hover : colors.background },
                            ]}
                        >
                            {o.icon && <Ionicons name={o.icon} size={20} color={o.danger ? colors.danger : colors.text} />}
                            <Text style={[styles.optionText, { color: o.danger ? colors.danger : colors.text }]}>{o.label}</Text>
                        </Pressable>
                    ))}
                </View>
                <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
                    <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Отмена</Text>
                </Pressable>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8 },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 14 },
    title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, paddingHorizontal: 4 },
    text: { fontSize: 13.5, lineHeight: 19, marginTop: 4, paddingHorizontal: 4 },
    option: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        minHeight: 54, paddingHorizontal: 16, borderRadius: RADIUS.button, borderWidth: 1, marginTop: 8,
    },
    optionText: { fontSize: 16, fontWeight: '600', flex: 1 },
    cancel: { height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    cancelText: { fontSize: 16, fontWeight: '700' },
});
