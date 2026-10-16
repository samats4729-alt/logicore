import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { useStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { DriverProfile, exchangeApi, телефонКрасиво, ответ } from '@/lib/exchange';
import { BRAND, FONT } from '@/lib/theme';
import { Badge, Button, Card, Row } from '@/components/kit';

/** Адрес сайта платформы — для политики конфиденциальности. */
const SITE_URL: string = (Constants.expoConfig?.extra?.siteUrl as string | undefined) || '';

export default function ExchangeProfile() {
    const { colors } = useAppTheme();
    const logout = useStore((s) => s.logout);
    const [me, setMe] = useState<DriverProfile | null>(null);

    useFocusEffect(useCallback(() => {
        exchangeApi.me().then(setMe).catch(() => undefined);
    }, []));

    const exit = () => Alert.alert('Выйти?', 'Войти снова можно через Google', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);

    /** Сменилась машина или телефон — анкета на правку и снова на проверку. */
    const edit = () => Alert.alert(
        'Изменить данные?',
        me?.kind === 'PARK'
            ? 'Анкета вернётся на правку. После отправки парк проверит её заново — пока проверяет, брать грузы нельзя.'
            : 'Анкета вернётся на правку. Исправьте и отправьте — допуск вернётся сразу.',
        [
            { text: 'Отмена', style: 'cancel' },
            {
                text: 'Изменить',
                onPress: async () => {
                    try {
                        await exchangeApi.reopen();
                        router.replace('/exchange/onboarding');
                    } catch (e) {
                        Alert.alert('Пока нельзя', ответ(e, 'Попробуйте ещё раз'));
                    }
                },
            },
        ],
    );

    /**
     * Удаление аккаунта — заявкой (шеф, 16.10.2026: «чтобы не смогли просто так
     * удалить»): водитель просит, удаляет администратор. Пока не удалили —
     * заявку можно отозвать.
     */
    const remove = () => {
        if (me?.deletionRequestedAt) {
            Alert.alert(
                'Заявка на удаление отправлена',
                'Администратор удалит аккаунт в ближайшее время. Передумали — отзовите заявку.',
                [
                    { text: 'Оставить заявку', style: 'cancel' },
                    {
                        text: 'Отозвать',
                        onPress: async () => {
                            try {
                                await exchangeApi.cancelDeletion();
                                setMe(await exchangeApi.me());
                            } catch (e) {
                                Alert.alert('Не удалось', ответ(e, 'Попробуйте ещё раз'));
                            }
                        },
                    },
                ],
            );
            return;
        }
        Alert.alert(
            'Попросить удалить аккаунт?',
            'Заявка уйдёт администратору. После удаления анкета и фото документов будут стёрты, войти этим аккаунтом больше не получится. История рейсов останется у заказчиков без вашего имени.',
            [
                { text: 'Отмена', style: 'cancel' },
                {
                    text: 'Отправить заявку',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await exchangeApi.deleteAccount();
                            setMe(await exchangeApi.me());
                            Alert.alert('Заявка отправлена', 'Администратор удалит аккаунт в ближайшее время.');
                        } catch (e) {
                            Alert.alert('Не удалось отправить', ответ(e, 'Попробуйте ещё раз'));
                        }
                    },
                },
            ],
        );
    };

    /**
     * Заявление на базовый вычет по ИПН (налоговики, 16.10.2026): вычет даётся
     * только у одного работодателя и только по заявлению. Налог за водителя
     * платит парк — с вычетом цена для компании ниже.
     */
    const [deductionSaving, setDeductionSaving] = useState(false);
    const toggleDeduction = (requested: boolean) => {
        const save = async () => {
            setDeductionSaving(true);
            try {
                setMe(await exchangeApi.setDeduction(requested));
            } catch (e) {
                Alert.alert('Не удалось сохранить', ответ(e, 'Попробуйте ещё раз'));
            } finally {
                setDeductionSaving(false);
            }
        };
        if (!requested) { save(); return; }
        Alert.alert(
            'Заявление на вычет',
            'Подтверждаете, что базовый вычет по ИПН (30 МРП в месяц) не получаете у другого работодателя? Вычет можно получать только в одном месте.',
            [{ text: 'Отмена', style: 'cancel' }, { text: 'Подтверждаю', onPress: save }],
        );
    };

    if (!me) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={BRAND.primary} />;

    const name = [me.lastName, me.firstName].filter(Boolean).join(' ') || 'Водитель';
    const initials = ((me.lastName?.[0] ?? '') + (me.firstName?.[0] ?? '')).toUpperCase() || '?';

    return (
        <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
            <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
                <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>
                <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
                {!!me.email && <Text style={{ color: colors.textSecondary, fontSize: 13.5, marginTop: 2 }}>{me.email}</Text>}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                    <Badge label="Допущен к грузам" tone="green" />
                    <Badge label={me.kind === 'IP' ? 'Свой ИП' : 'Через парк'} tone="blue" />
                </View>
            </Card>

            <Card>
                {me.kind === 'PARK' && <Row icon="business-outline" label="Парк" value={me.park?.name ?? '—'} />}
                {me.kind === 'IP' && <Row icon="briefcase-outline" label="ИП" value={me.ipName ?? '—'} />}
                <Row icon="call-outline" label="Телефон" value={телефонКрасиво(me.phone)} />
                <Row icon="bus-outline" label="Машина" value={[me.vehiclePlate, me.vehicleBodyType, me.vehicleCapacityKg ? `${me.vehicleCapacityKg / 1000} т` : null].filter(Boolean).join(' · ') || '—'} />
                <Row icon="trophy-outline" label="Рейсов" value={String(me.tripsCompleted)} />
            </Card>

            <Card onPress={() => router.push('/exchange/documents')} style={styles.menuItem}>
                <Ionicons name="document-text-outline" size={20} color={colors.text} />
                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontFamily: FONT.semibold }}>Мои документы</Text>
                    <Text style={{ color: colors.textTertiary, fontSize: 12.5, marginTop: 2 }}>
                        {me.kind === 'PARK' ? 'Удостоверение, права, техпаспорт, договор с парком' : 'Что загружено и проверено'}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Card>

            {me.kind === 'PARK' && (
                <Card style={styles.menuItem}>
                    <Ionicons name="receipt-outline" size={20} color={colors.text} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontFamily: FONT.semibold }}>Базовый вычет по ИПН</Text>
                        <Text style={{ color: colors.textTertiary, fontSize: 12.5, marginTop: 2, lineHeight: 17 }}>
                            {me.deductionRequested
                                ? 'Заявление подано: парк учитывает вычет — налог за вас меньше, цена для компании ниже.'
                                : 'Включите, если не получаете вычет у другого работодателя: налог за вас меньше, цена для компании ниже.'}
                        </Text>
                    </View>
                    <Switch
                        value={!!me.deductionRequested}
                        disabled={deductionSaving}
                        onValueChange={toggleDeduction}
                        accessibilityLabel="Заявление на базовый вычет"
                    />
                </Card>
            )}

            <Card onPress={edit} style={styles.menuItem}>
                <Ionicons name="create-outline" size={20} color={colors.text} />
                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontFamily: FONT.semibold }}>Изменить данные</Text>
                    <Text style={{ color: colors.textTertiary, fontSize: 12.5, marginTop: 2 }}>
                        {me.kind === 'PARK' ? 'Новая машина или телефон — парк проверит заново' : 'Новая машина или телефон'}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Card>

            {!!SITE_URL && (
                <Card onPress={() => Linking.openURL(`${SITE_URL}/privacy`)} style={styles.menuItem}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={colors.text} />
                    <Text style={[styles.menuText, { color: colors.text }]}>Политика конфиденциальности</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </Card>
            )}

            <Button title="Выйти" variant="secondary" icon="log-out-outline" onPress={exit} />
            <Button
                title={me.deletionRequestedAt ? 'Заявка на удаление отправлена' : 'Попросить удалить аккаунт'}
                variant="danger"
                icon="trash-outline"
                onPress={remove}
                style={{ marginTop: 10 }}
            />

            <Text style={[styles.version, { color: colors.textTertiary }]}>
                LogiCore Водитель · версия {Constants.expoConfig?.version ?? ''}
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: BRAND.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    initials: { color: '#fff', fontSize: 26, fontFamily: FONT.bold },
    name: { fontSize: 20, fontFamily: FONT.bold, letterSpacing: -0.4 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    menuText: { flex: 1, fontSize: 15, fontFamily: FONT.semibold },
    version: { textAlign: 'center', fontSize: 11.5, marginTop: 16 },
});
