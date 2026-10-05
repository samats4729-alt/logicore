import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { BODY_TYPES } from '@/lib/exchange';
import { BRAND, RADIUS, selectedColors } from '@/lib/theme';

/** Самые частые — кнопками сразу, остальные — в списке с поиском. */
const POPULAR = ['тент', 'рефрижератор', 'изотерм', 'бортовая', 'контейнеровоз', 'самосвал'];

export function BodyTypePicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
    const { colors, isDark } = useAppTheme();
    const sel = selectedColors(isDark);
    const insets = useSafeAreaInsets();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const list = useMemo(() => BODY_TYPES.filter((t) => t.includes(q.trim().toLowerCase())), [q]);
    const other = value && !POPULAR.includes(value) ? value : null;

    return (
        <View>
            <View style={styles.grid}>
                {POPULAR.map((t) => (
                    <Pressable
                        key={t}
                        onPress={() => onChange(t)}
                        style={[styles.option, { backgroundColor: value === t ? sel.bg : colors.card, borderColor: value === t ? sel.bg : colors.border }]}
                    >
                        <Text style={{ color: value === t ? sel.fg : colors.text, fontWeight: '600', fontSize: 14 }}>{t}</Text>
                    </Pressable>
                ))}
                <Pressable
                    onPress={() => setOpen(true)}
                    style={[styles.option, { backgroundColor: other ? sel.bg : colors.card, borderColor: other ? sel.bg : colors.border }]}
                >
                    <Text style={{ color: other ? sel.fg : colors.text, fontWeight: '600', fontSize: 14 }}>{other || 'другой…'}</Text>
                </Pressable>
            </View>

            <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
                <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
                    <View style={styles.modalHead}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>Тип кузова</Text>
                        <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Закрыть">
                            <Ionicons name="close" size={26} color={colors.text} />
                        </Pressable>
                    </View>
                    <TextInput
                        value={q}
                        onChangeText={setQ}
                        placeholder="Поиск"
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.search, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
                    />
                    <FlatList
                        data={list}
                        keyExtractor={(t: string) => t}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                        renderItem={({ item }: { item: string }) => (
                            <Pressable
                                onPress={() => { onChange(item); setOpen(false); setQ(''); }}
                                style={[styles.row, { borderBottomColor: colors.border }]}
                            >
                                <Text style={{ color: colors.text, fontSize: 16 }}>{item}</Text>
                                {value === item && <Ionicons name="checkmark" size={20} color={BRAND.primary} />}
                            </Pressable>
                        )}
                    />
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: { paddingHorizontal: 14, height: 42, borderRadius: RADIUS.button, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
    modalTitle: { fontSize: 22, fontWeight: '800' },
    search: { marginHorizontal: 20, marginBottom: 8, height: 46, borderRadius: RADIUS.button, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1 },
});
