import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { exchangeApi, телефонКрасиво, ответ } from '@/lib/exchange';
import { BRAND } from '@/lib/theme';
import { Button, Field, Section } from '@/components/kit';

/**
 * Ещё номера и почта для документов (задачи шефа, Q6).
 *
 * Второй, третий или зарубежный номер — когда основной сел или водитель в
 * рейсе за границей. Почта — куда заказчику слать акты и счета. Это не
 * личность и не вход, поэтому анкета на проверку не уходит.
 */
export default function ExchangeContacts() {
    const { colors } = useAppTheme();
    const [loaded, setLoaded] = useState(false);
    const [mainPhone, setMainPhone] = useState<string | null>(null);
    const [phones, setPhones] = useState(['', '', '']);
    const [docsEmail, setDocsEmail] = useState('');
    const [docsContact, setDocsContact] = useState('');
    const [saving, setSaving] = useState(false);

    useFocusEffect(useCallback(() => {
        exchangeApi.me().then((me) => {
            setMainPhone(me.phone);
            const extra = me.extraPhones ?? [];
            setPhones([0, 1, 2].map((i) => (extra[i] ? телефонКрасиво(extra[i]) : '')));
            setDocsEmail(me.docsEmail ?? '');
            setDocsContact(me.docsContact ?? '');
            setLoaded(true);
        }).catch(() => setLoaded(true));
    }, []));

    const save = async () => {
        setSaving(true);
        try {
            await exchangeApi.setContacts({
                extraPhones: phones.map((p) => p.trim()).filter(Boolean),
                docsEmail: docsEmail.trim() || null,
                docsContact: docsContact.trim() || null,
            });
            Alert.alert('Сохранено', 'Парк и компании, которым вы откликаетесь, увидят эти номера и почту.');
            router.back();
        } catch (e) {
            Alert.alert('Не удалось сохранить', ответ(e, 'Проверьте номера и почту'));
        } finally {
            setSaving(false);
        }
    };

    if (!loaded) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={BRAND.primary} />;

    const setPhone = (i: number, value: string) => setPhones((prev) => prev.map((p, j) => (j === i ? value : p)));

    return (
        <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            <Section title="Ещё номера" icon="call-outline">
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                    Основной {телефонКрасиво(mainPhone)} — для входа, его меняют через «Изменить данные». Здесь — запасные:
                    второй, третий или зарубежный.
                </Text>
                {phones.map((p, i) => (
                    <Field
                        key={i}
                        label={i === 2 ? 'Третий или зарубежный' : i === 1 ? 'Ещё номер' : 'Второй номер'}
                        value={p}
                        onChangeText={(v: string) => setPhone(i, v)}
                        placeholder={i === 2 ? '+998 90 123 45 67' : '+7 701 123 45 67'}
                        keyboardType="phone-pad"
                        maxLength={30}
                    />
                ))}
            </Section>

            <Section title="Для бухгалтерских документов" icon="mail-outline">
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                    Куда заказчику слать акты и счета. Видят парк и компании, которым вы откликаетесь.
                </Text>
                <Field
                    label="Почта"
                    value={docsEmail}
                    onChangeText={setDocsEmail}
                    placeholder="buh@example.kz"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={120}
                />
                <Field
                    label="Кто по документам"
                    hint="Необязательно: имя и телефон бухгалтера, если не вы сами"
                    value={docsContact}
                    onChangeText={setDocsContact}
                    placeholder="Айгуль, +7 707 765 43 21"
                    maxLength={200}
                />
            </Section>

            <Button title="Сохранить" icon="checkmark" loading={saving} onPress={save} style={{ marginTop: 4 }} />
        </ScrollView>
    );
}
