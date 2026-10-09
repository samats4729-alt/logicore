import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { API_URL, getAuthHeader } from '@/lib/api';
import { DOCUMENTS, DriverProfile, documentPath, exchangeApi, вКавычках, ответ } from '@/lib/exchange';
import { BRAND } from '@/lib/theme';
import { Badge, Button, Card, Empty } from '@/components/kit';
import { ParkContractSummary } from '@/components/ParkContract';

type Doc = DriverProfile['documents'][number];
type Tone = 'green' | 'orange' | 'red' | 'gray';

/**
 * Отметка проверки — общая для всех документов: парк проверяет анкету
 * целиком, отметки у каждого фото в системе нет. Поэтому у возвращённой
 * анкеты фото помечены нейтрально, а что исправить — говорит причина
 * сверху: «нужно исправить» на каждом фото увело бы переснимать всё подряд.
 */
const REVIEW: Record<DriverProfile['status'], { label: string; tone: Tone }> = {
    DRAFT: { label: 'Не отправлен', tone: 'gray' },
    PENDING: { label: 'На проверке', tone: 'orange' },
    APPROVED: { label: 'Проверен', tone: 'green' },
    REJECTED: { label: 'Загружен', tone: 'gray' },
    BLOCKED: { label: 'Загружен', tone: 'gray' },
};

const date = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

/**
 * «Мои документы» водителя биржи (задача владельца №5, 09.10.2026).
 *
 * Что загружено, проверено ли, и сами фото — открыть и посмотреть. Ниже —
 * подписанный договор с парком. Фото отдаёт только сервер и только самому
 * водителю (и сотрудникам его парка в кабинете) — ссылки «для всех» нет.
 *
 * Править отсюда нельзя: документы проверенной анкеты меняются через
 * «Изменить данные» в профиле, и тогда парк проверяет их заново.
 */
export default function MyDocuments() {
    const { colors } = useAppTheme();
    const [me, setMe] = useState<DriverProfile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<Doc | null>(null);

    const load = useCallback(() => {
        setError(null);
        exchangeApi.me().then(setMe).catch((e) => setError(ответ(e, 'Не удалось загрузить документы')));
    }, []);
    useFocusEffect(load);

    if (error) return <Empty icon="document-text-outline" title="Документы недоступны" text={error} action={<Button title="Повторить" onPress={load} />} />;
    if (!me) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={BRAND.primary} />;

    const review = REVIEW[me.status];
    const titleOf = (kind: Doc['kind']) => DOCUMENTS.find((d) => d.kind === kind)?.title ?? 'Документ';
    // Обязательные для работы через парк — показываем и те, что ещё не сняты.
    const required = me.kind === 'PARK'
        ? DOCUMENTS.filter((d) => d.kind !== 'POWER_OF_ATTORNEY' || !me.vehicleIsOwn).map((d) => d.kind)
        : [];
    const missing = required.filter((kind) => !me.documents.some((d) => d.kind === kind));

    return (
        <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
            {me.kind === 'IP' && me.documents.length === 0 ? (
                <Card>
                    <Text style={[styles.lead, { color: colors.text }]}>Документы не нужны</Text>
                    <Text style={[styles.note, { color: colors.textSecondary }]}>
                        Вы работаете со своим ИП — перевозчик вы сами, и фото документов для допуска не требуются.
                    </Text>
                </Card>
            ) : (
                <>
                    {me.status === 'REJECTED' && !!me.rejectReason && (
                        <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
                            <Text style={[styles.lead, { color: colors.danger }]}>Парк вернул анкету</Text>
                            <Text style={[styles.note, { color: colors.text }]}>{me.rejectReason}</Text>
                        </Card>
                    )}
                    {me.status === 'BLOCKED' && !!me.blockedReason && (
                        <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
                            <Text style={[styles.lead, { color: colors.danger }]}>Допуск закрыт</Text>
                            <Text style={[styles.note, { color: colors.text }]}>{me.blockedReason}</Text>
                        </Card>
                    )}

                    {me.documents.map((doc) => (
                        <Card key={doc.id} onPress={() => setOpen(doc)} style={styles.row}>
                            <View style={[styles.thumb, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                                <Image source={{ uri: `${API_URL}${documentPath(doc.id)}`, headers: getAuthHeader() }} style={styles.thumbImage} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.docTitle, { color: colors.text }]}>{titleOf(doc.kind)}</Text>
                                <Text style={[styles.docSub, { color: colors.textTertiary }]}>загружено {date(doc.createdAt)}</Text>
                                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                                    <Badge label={review.label} tone={review.tone} />
                                </View>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                        </Card>
                    ))}

                    {missing.map((kind) => (
                        <Card key={kind} style={styles.row}>
                            <View style={[styles.thumb, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                                <Ionicons name="camera-outline" size={22} color={colors.textTertiary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.docTitle, { color: colors.text }]}>{titleOf(kind)}</Text>
                                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                                    <Badge label="Не загружен" tone="gray" />
                                </View>
                            </View>
                        </Card>
                    ))}
                </>
            )}

            {me.kind === 'PARK' && (
                <>
                    <Text style={[styles.section, { color: colors.textTertiary }]}>ДОГОВОР С ПАРКОМ</Text>
                    {me.contractSignedAt ? (
                        <>
                            <Card style={styles.signed}>
                                <Ionicons name="checkmark-circle" size={20} color={colors.pos} />
                                <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>
                                    Подписан {new Date(me.contractSignedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </Card>
                            <ParkContractSummary driver={me} />
                        </>
                    ) : (
                        <Card>
                            <Text style={[styles.note, { color: colors.textSecondary }]}>
                                Договор с парком {вКавычках(me.park?.name)} ещё не подписан — это делается в анкете.
                            </Text>
                        </Card>
                    )}
                </>
            )}

            <Text style={[styles.footnote, { color: colors.textTertiary }]}>
                Фото документов видите только вы{me.kind === 'PARK' ? ' и сотрудники парка, который вас проверяет' : ''}.
                Заказчикам и другим водителям они не показываются. Заменить фото можно через «Изменить данные» в профиле — тогда анкету проверят заново.
            </Text>

            <Viewer doc={open} title={open ? titleOf(open.kind) : ''} onClose={() => setOpen(null)} />
        </ScrollView>
    );
}

/** Фото на весь экран — разглядеть, всё ли читается. */
function Viewer({ doc, title, onClose }: { doc: Doc | null; title: string; onClose: () => void }) {
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    return (
        <Modal visible={!!doc} animationType="fade" onRequestClose={onClose} statusBarTranslucent onShow={() => setLoading(true)}>
            <View style={styles.viewer}>
                {doc && (
                    <Image
                        source={{ uri: `${API_URL}${documentPath(doc.id)}`, headers: getAuthHeader() }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="contain"
                        onLoadEnd={() => setLoading(false)}
                    />
                )}
                {loading && <ActivityIndicator size="large" color="#fff" />}
                <View style={[styles.viewerTop, { paddingTop: insets.top + 8 }]}>
                    <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Закрыть" style={styles.close}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </Pressable>
                    <Text style={styles.viewerTitle} numberOfLines={1}>{title}</Text>
                    <View style={{ width: 44 }} />
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    lead: { fontSize: 15.5, fontWeight: '800', marginBottom: 4 },
    note: { fontSize: 14, lineHeight: 20 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    thumb: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    thumbImage: { width: 56, height: 56 },
    docTitle: { fontSize: 14.5, fontWeight: '700' },
    docSub: { fontSize: 12.5, marginTop: 2 },
    section: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginTop: 14, marginBottom: 10 },
    signed: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    footnote: { fontSize: 12.5, lineHeight: 18, marginTop: 16, textAlign: 'center', paddingHorizontal: 8 },
    viewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    viewerTop: {
        position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
    viewerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '600' },
});
