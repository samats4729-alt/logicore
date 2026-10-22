import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { DriverVehicle, DriverVehicles, VehicleKind, exchangeApi, ответ } from '@/lib/exchange';
import { BRAND, FONT } from '@/lib/theme';
import { Badge, Button, Chip, Field, Section } from '@/components/kit';

const KIND_TITLE: Record<VehicleKind, string> = { TRACTOR: 'Тягач', TRAILER: 'Прицеп' };

/**
 * Транспорт водителя (задачи шефа, R4): несколько тягачей и прицепов,
 * один из каждых — основной.
 *
 * Основной тягач — машина из анкеты. У водителя парка его смена
 * возвращает анкету на правку: машина названа в договоре с парком, договор
 * подписывается заново, парк проверяет. Основной прицеп меняется сразу —
 * он уходит в рейс, когда компания выбирает водителя.
 */
export default function ExchangeVehicles() {
    const { colors } = useAppTheme();
    const [data, setData] = useState<DriverVehicles | null>(null);
    const [kind, setKind] = useState<VehicleKind>('TRAILER');
    const [plate, setPlate] = useState('');
    const [model, setModel] = useState('');
    const [bodyType, setBodyType] = useState('');
    const [capacity, setCapacity] = useState('');
    const [regNumber, setRegNumber] = useState('');
    const [isOwn, setIsOwn] = useState(true);
    const [saving, setSaving] = useState(false);

    useFocusEffect(useCallback(() => {
        exchangeApi.vehicles().then(setData).catch((e) => Alert.alert('Не удалось загрузить', ответ(e, 'Попробуйте ещё раз')));
    }, []));

    if (!data) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={BRAND.primary} />;

    const add = async () => {
        if (!plate.trim()) { Alert.alert('Госномер', 'Впишите госномер'); return; }
        const tons = Number(capacity.replace(',', '.'));
        setSaving(true);
        try {
            setData(await exchangeApi.addVehicle({
                kind, plate: plate.trim(), model: model.trim() || undefined, bodyType: bodyType.trim() || undefined,
                capacityKg: tons > 0 ? Math.round(tons * 1000) : undefined, regNumber: regNumber.trim() || undefined, isOwn,
            }));
            setPlate(''); setModel(''); setBodyType(''); setCapacity(''); setRegNumber(''); setIsOwn(true);
        } catch (e) {
            Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз'));
        } finally {
            setSaving(false);
        }
    };

    const makeMain = (v: DriverVehicle) => {
        const run = async () => {
            try {
                const r = await exchangeApi.makeMainVehicle(v.id);
                setData(r);
                if (r.needsReview) {
                    Alert.alert('Анкета на правку', 'Подпишите договор с парком заново и отправьте анкету — парк проверит новую машину.', [
                        { text: 'К анкете', onPress: () => router.replace('/exchange/onboarding') },
                    ]);
                }
            } catch (e) {
                Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз'));
            }
        };
        if (v.kind === 'TRACTOR' && data.kind === 'PARK') {
            Alert.alert(
                'Сменить тягач?',
                'Машина названа в договоре с парком: договор нужно подписать заново, а парк проверит анкету. Пока проверяет — брать грузы нельзя.',
                [{ text: 'Отмена', style: 'cancel' }, { text: 'Сменить', onPress: run }],
            );
            return;
        }
        run();
    };

    const remove = (v: DriverVehicle) => Alert.alert(`Убрать ${v.plate}?`, 'Из списка транспорта. Добавить обратно можно в любой момент.', [
        { text: 'Отмена', style: 'cancel' },
        {
            text: 'Убрать', style: 'destructive',
            onPress: async () => {
                try { setData(await exchangeApi.removeVehicle(v.id)); } catch (e) { Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз')); }
            },
        },
    ]);

    const list = (items: DriverVehicle[], empty: string) => items.length === 0
        ? <Text style={{ color: colors.textTertiary, fontSize: 13 }}>{empty}</Text>
        : items.map((v, i) => (
            <View key={v.id} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, color: colors.text, fontFamily: FONT.bold, fontSize: 16, letterSpacing: 0.5 }}>{v.plate}</Text>
                    {v.isMain && <Badge label="Основной" tone="green" />}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    {[v.model, v.bodyType, v.capacityKg ? `${v.capacityKg / 1000} т` : null, v.isOwn ? null : 'не своя'].filter(Boolean).join(' · ') || '—'}
                </Text>
                {!v.isMain && (
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                        <Text
                            onPress={() => makeMain(v)}
                            style={{ color: v.kind === 'TRACTOR' && data.onTrip ? colors.textTertiary : colors.text, fontFamily: FONT.semibold, fontSize: 13.5 }}
                            disabled={v.kind === 'TRACTOR' && data.onTrip}
                        >
                            Сделать основным
                        </Text>
                        <Text onPress={() => remove(v)} style={{ color: colors.danger, fontSize: 13.5 }}>Убрать</Text>
                    </View>
                )}
            </View>
        ));

    return (
        <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            <Section title="Тягачи" icon="bus-outline">
                <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, marginBottom: 6 }}>
                    Основной — машина из анкеты, её видят компании в откликах.
                    {data.kind === 'PARK' ? ' Смена основного — через проверку парка и новый договор.' : ''}
                    {data.onTrip ? ' Во время рейса тягач не меняют.' : ''}
                </Text>
                {list(data.tractors, 'Тягачей пока нет — машина появится из анкеты.')}
            </Section>

            <Section title="Прицепы" icon="git-commit-outline">
                <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, marginBottom: 6 }}>
                    Основной прицеп уходит в рейс, когда компания выбирает вас. Меняется сразу.
                </Text>
                {list(data.trailers, 'Прицепов нет. Добавьте ниже — первый станет основным.')}
            </Section>

            <Section title="Добавить" icon="add-circle-outline">
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    {(['TRAILER', 'TRACTOR'] as const).map((k) => (
                        <Chip key={k} label={KIND_TITLE[k]} active={kind === k} onPress={() => setKind(k)} />
                    ))}
                </View>
                <Field label="Госномер" value={plate} onChangeText={setPlate} placeholder="123ABC02" autoCapitalize="characters" maxLength={20} />
                <Field label="Марка и модель" value={model} onChangeText={setModel} placeholder={kind === 'TRAILER' ? 'Schmitz Cargobull' : 'MAN TGX'} maxLength={100} />
                <Field label="Кузов" value={bodyType} onChangeText={setBodyType} placeholder="тент, реф, борт" maxLength={50} />
                <Field label="Грузоподъёмность, т" value={capacity} onChangeText={setCapacity} keyboardType="decimal-pad" placeholder="20" maxLength={6} />
                <Field label="Номер техпаспорта" hint="Необязательно" value={regNumber} onChangeText={setRegNumber} maxLength={30} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>Записана на меня</Text>
                    <Switch value={isOwn} onValueChange={setIsOwn} accessibilityLabel="Записана на меня" />
                </View>
                <Button title={`Добавить ${KIND_TITLE[kind].toLowerCase()}`} icon="add" loading={saving} onPress={add} />
            </Section>
        </ScrollView>
    );
}
