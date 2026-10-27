import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { API_URL } from '@/lib/api';
import { ContractContent, exchangeApi, ответ } from '@/lib/exchange';
import { Card } from '@/components/kit';

import { FONT } from '@/lib/theme';

/**
 * Полный текст договора с парком — тот, что собирает сервер.
 *
 * Владелец, 09.10.2026: подписывают не пересказ, а договор целиком, и
 * экземпляр остаётся у водителя. Один компонент для анкеты (читает до
 * подписи) и для «Моих документов» (перечитывает подписанное): текст
 * приходит с сервера, здесь только показывается — разойтись ему негде.
 */
export function ContractText({ content }: { content: ContractContent }) {
    const { colors } = useAppTheme();
    const date = content.date.split('-').reverse().join('.');
    return (
        <Card>
            <Text style={{ color: colors.text, fontSize: 16, fontFamily: FONT.bold, textAlign: 'center' }}>
                {/* Машина не водителя — договор услуг, а не аренды (Q9): вид берём из текста. */}
                Договор {content.subtitle ?? 'аренды транспортного средства с экипажем'}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                № {content.number} · {date}
            </Text>
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 12 }}>{content.preamble}</Text>
            {content.sections.map((section) => (
                <View key={section.title} style={{ marginTop: 14 }}>
                    <Text style={{ color: colors.text, fontSize: 14.5, fontFamily: FONT.bold, marginBottom: 6 }}>{section.title}</Text>
                    {section.items.map((item) => (
                        <Text key={item.n} style={{ color: colors.text, fontSize: 14, lineHeight: 21, marginBottom: 6 }}>
                            <Text style={{ fontFamily: FONT.bold }}>{item.n} </Text>
                            {item.text}
                        </Text>
                    ))}
                </View>
            ))}
            <Text style={{ color: colors.text, fontSize: 14.5, fontFamily: FONT.bold, marginTop: 14, marginBottom: 6 }}>Реквизиты сторон</Text>
            {[content.lessee, content.lessor].map((party) => (
                <View key={party.role} style={{ marginBottom: 10 }}>
                    <Text style={{ color: colors.textTertiary, fontSize: 12, fontFamily: FONT.bold, letterSpacing: 0.6 }}>{party.role.toUpperCase()}</Text>
                    <Text style={{ color: colors.text, fontSize: 14, fontFamily: FONT.bold, marginTop: 2 }}>{party.name}</Text>
                    {party.lines.map((line) => (
                        <Text key={line.label} style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                            {line.label}: {line.value}
                        </Text>
                    ))}
                </View>
            ))}
        </Card>
    );
}

/**
 * «Открыть PDF» — в браузере телефона по ссылке на десять минут: приложение
 * само PDF не показывает, а браузер не знает пропуска водителя.
 */
export function OpenContractPdf() {
    const { colors } = useAppTheme();
    const [busy, setBusy] = useState(false);
    const open = async () => {
        setBusy(true);
        try {
            const { path } = await exchangeApi.contractLink();
            await Linking.openURL(`${API_URL}${path}`);
        } catch (e) {
            Alert.alert('Не открылось', ответ(e, 'Попробуйте ещё раз'));
        } finally {
            setBusy(false);
        }
    };
    return (
        <Pressable
            onPress={open}
            disabled={busy}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 6 }}
        >
            {busy ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="document-outline" size={18} color={colors.text} />}
            <Text style={{ color: colors.text, fontFamily: FONT.bold, fontSize: 14, textDecorationLine: 'underline' }}>Открыть PDF — с печатью парка</Text>
        </Pressable>
    );
}
