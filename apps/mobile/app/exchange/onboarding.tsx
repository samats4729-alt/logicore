import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { API_URL, getAuthHeader, getDeviceId } from '@/lib/api';
import { DOCUMENTS, DocumentKind, DriverProfile, Park, documentPath, exchangeApi, PARK_INVITE_KEY, вКавычках, иинВерный, телефонВерный, телефонКрасиво, ответ } from '@/lib/exchange';
import { useStore } from '@/store';
import * as SecureStore from '@/lib/secure';
import { BRAND, RADIUS, selectedColors } from '@/lib/theme';
import { Button, Card, Choice, Field, Title } from '@/components/kit';
import { BodyTypePicker } from '@/components/BodyTypePicker';

type Step = 'kind' | 'person' | 'vehicle' | 'park' | 'documents' | 'contract' | 'review';

const STEPS: Record<'IP' | 'PARK', Step[]> = {
    IP: ['kind', 'person', 'vehicle', 'review'],
    PARK: ['kind', 'person', 'vehicle', 'park', 'documents', 'contract', 'review'],
};

const TITLES: Record<Step, string> = {
    kind: 'Как вы работаете',
    person: 'О себе',
    vehicle: 'Ваша машина',
    park: 'Выберите парк',
    documents: 'Фото документов',
    contract: 'Договор с парком',
    review: 'Проверьте и отправьте',
};

/**
 * Анкета водителя биржи — по шагам, один вопрос на экран.
 *
 * Каждый шаг сохраняется на сервере сразу: закрыл приложение на середине —
 * продолжит с того же места. Сервер сам проверяет ИИН, телефон и говорит,
 * чего не хватает, — экран только показывает это словами.
 */
export default function Onboarding() {
    const { colors, isDark } = useAppTheme();
    const sel = selectedColors(isDark);
    const insets = useSafeAreaInsets();
    const [driver, setDriver] = useState<DriverProfile | null>(null);
    const [parks, setParks] = useState<Park[]>([]);
    const [index, setIndex] = useState(0);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState<DocumentKind | null>(null);

    // Поля шагов — правятся локально, на сервер уходят по «Далее».
    const [form, setForm] = useState({
        lastName: '', firstName: '', middleName: '', iin: '', phone: '+7',
        ipName: '', ipIin: '', vehiclePlate: '', vehicleBodyType: '', capacityTons: '',
    });
    type FieldKey = keyof typeof form;
    // Ошибки показываем под полем, общую — плашкой над кнопками.
    const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
    const [stepError, setStepError] = useState<string | null>(null);
    const set = (k: FieldKey, v: string) => {
        setForm((f) => ({ ...f, [k]: v }));
        setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
    };
    const logout = useStore((s) => s.logout);
    /** Вступил в парк по приглашению — название, чтобы сказать об этом. */
    const [joinedBy, setJoinedBy] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [codeBusy, setCodeBusy] = useState(false);

    /** Код парка вручную — если ссылку не открыли, а код продиктовали. */
    const joinByCode = async () => {
        if (code.trim().length < 4) { setStepError('Впишите код парка — шесть знаков'); return; }
        setCodeBusy(true);
        setStepError(null);
        try {
            const updated = await exchangeApi.joinPark(code);
            setDriver(updated);
            setJoinedBy(updated.park?.name ?? null);
            setCode('');
        } catch (e) {
            setStepError(ответ(e, 'Код не подошёл — проверьте его'));
        } finally {
            setCodeBusy(false);
        }
    };

    useEffect(() => {
        exchangeApi.me().then(async (d) => {
            // Пришёл по ссылке-приглашению парка — вступаем в этот парк сразу.
            const invite = await SecureStore.getItemAsync(PARK_INVITE_KEY);
            if (invite && (d.status === 'DRAFT' || d.status === 'REJECTED')) {
                try {
                    d = await exchangeApi.joinPark(invite);
                    setJoinedBy(d.park?.name ?? null);
                } catch {
                    // Код устарел — водитель выберет парк из списка.
                }
            }
            if (invite) await SecureStore.deleteItemAsync(PARK_INVITE_KEY);
            setDriver(d);
            setForm({
                lastName: d.lastName ?? '', firstName: d.firstName ?? '', middleName: d.middleName ?? '',
                iin: d.iin ?? '', phone: d.phone ?? '+7', ipName: d.ipName ?? '', ipIin: d.ipIin ?? '',
                vehiclePlate: d.vehiclePlate ?? '', vehicleBodyType: d.vehicleBodyType ?? '',
                capacityTons: d.vehicleCapacityKg ? String(d.vehicleCapacityKg / 1000) : '',
            });
            // Исправление после отказа — сразу ко второму шагу: вид работы уже выбран.
            if (d.kind) setIndex(1);
        }).catch((e) => Alert.alert('Не удалось загрузить анкету', ответ(e, 'Проверьте интернет')));
        exchangeApi.parks().then(setParks).catch(() => setParks([]));
    }, []);

    const steps = STEPS[driver?.kind ?? 'PARK'];
    const step = steps[Math.min(index, steps.length - 1)];

    const docs = useMemo(
        () => DOCUMENTS.filter((d) => d.kind !== 'POWER_OF_ATTORNEY' || driver?.vehicleIsOwn === false),
        [driver?.vehicleIsOwn],
    );

    const save = async (data: Record<string, unknown>) => {
        const updated = await exchangeApi.update(data);
        setDriver(updated);
        return updated;
    };

    /** Проверка шага до отправки — теми же правилами, что на сервере. */
    const check = (): Partial<Record<FieldKey, string>> => {
        const e: Partial<Record<FieldKey, string>> = {};
        if (step === 'person') {
            if (!form.lastName.trim()) e.lastName = 'Впишите фамилию';
            if (!form.firstName.trim()) e.firstName = 'Впишите имя';
            if (!form.iin) e.iin = 'Впишите ИИН — 12 цифр из удостоверения';
            else if (!иинВерный(form.iin)) e.iin = 'В ИИН ошибка — сверьте с удостоверением, цифра в цифру';
            if (!телефонВерный(form.phone)) e.phone = 'Нужен казахстанский мобильный, например +7 701 123 45 67';
            if (driver?.kind === 'IP') {
                if (!form.ipName.trim()) e.ipName = 'Впишите название ИП, как в документе';
                if (form.ipIin && form.ipIin.length !== 12) e.ipIin = 'ИИН ИП — 12 цифр';
            }
        }
        if (step === 'vehicle') {
            if (!form.vehiclePlate.trim()) e.vehiclePlate = 'Впишите госномер машины';
            if (!form.vehicleBodyType) e.vehicleBodyType = 'Выберите тип кузова';
            const tons = Number(form.capacityTons.replace(',', '.'));
            if (form.capacityTons && !(Number.isFinite(tons) && tons > 0)) e.capacityTons = 'Число тонн, например 20 или 1,5';
        }
        return e;
    };

    /** Ошибку сервера — к нужному полю, если понятно к какому; иначе плашкой. */
    const showServerError = (message: string) => {
        if (/ИИН ИП/.test(message)) setErrors({ ipIin: message });
        else if (/ИИН/.test(message)) setErrors({ iin: message });
        else if (/Телефон/i.test(message)) setErrors({ phone: message });
        else setStepError(message);
    };

    /** «Далее»: сохранить шаг. Ошибку сервера показываем его словами. */
    const next = async () => {
        if (!driver) return;
        setStepError(null);
        const found = check();
        if (Object.keys(found).length) { setErrors(found); return; }
        setBusy(true);
        try {
            if (step === 'kind' && !driver.kind) { setStepError('Выберите, как вы работаете: свой ИП или через парк'); return; }
            if (step === 'person') {
                await save({
                    lastName: form.lastName, firstName: form.firstName, middleName: form.middleName,
                    iin: form.iin, phone: form.phone,
                    ...(driver.kind === 'IP' ? { ipName: form.ipName, ipIin: form.ipIin || form.iin } : {}),
                });
            }
            if (step === 'vehicle') {
                const tons = Number(form.capacityTons.replace(',', '.'));
                await save({
                    vehiclePlate: form.vehiclePlate,
                    vehicleBodyType: form.vehicleBodyType,
                    ...(form.capacityTons && Number.isFinite(tons) && tons > 0 ? { vehicleCapacityKg: Math.round(tons * 1000) } : {}),
                });
            }
            if (step === 'park' && !driver.park) { setStepError('Выберите парк — через него вы будете работать'); return; }
            const lacking = docs.filter((d) => !driver.documents.some((x) => x.kind === d.kind));
            if (step === 'documents' && lacking.length) {
                setStepError(`Не хватает фото: ${lacking.map((d) => d.title.toLowerCase()).join(', ')}. Без них парк не допустит к грузам.`);
                return;
            }
            if (step === 'contract' && !driver.contractSignedAt) { setStepError('Прочитайте договор и нажмите «Подписываю»'); return; }
            setIndex((i) => Math.min(i + 1, steps.length - 1));
        } catch (e) {
            showServerError(ответ(e, 'Не удалось сохранить — проверьте интернет и нажмите «Далее» ещё раз'));
        } finally {
            setBusy(false);
        }
    };

    const back = () => { setStepError(null); setErrors({}); setIndex((i) => Math.max(i - 1, 0)); };

    /** С первого шага «назад» некуда — даём выйти, например чтобы войти другим аккаунтом Google. */
    const exit = () => Alert.alert('Выйти?', 'Анкета сохранится — продолжите с того же места, когда войдёте снова.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);

    const chooseKind = async (kind: 'IP' | 'PARK') => {
        setStepError(null);
        try { await save({ kind }); } catch (e) { setStepError(ответ(e, 'Не удалось сохранить — проверьте интернет')); }
    };

    const pickPhoto = async (kind: DocumentKind, from: 'camera' | 'library') => {
        try {
            // Галерея открывается системным выбором фото — разрешения на все
            // фото телефона не нужно (и в приложении оно отключено). Спрашиваем
            // только камеру.
            if (from === 'camera') {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) {
                    Alert.alert('Нет доступа к камере', 'Разрешите камеру для приложения в настройках телефона или выберите фото из галереи.');
                    return;
                }
            }
            const result = from === 'camera'
                ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
                : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'] });
            if (result.canceled || !result.assets?.[0]) return;
            setUploading(kind);
            setDriver(await exchangeApi.uploadDocument(kind, result.assets[0].uri));
            setStepError(null);
        } catch (e) {
            Alert.alert('Фото не загрузилось', ответ(e, 'Попробуйте ещё раз'));
        } finally {
            setUploading(null);
        }
    };

    const sign = async () => {
        setBusy(true);
        try { setDriver(await exchangeApi.signContract(await getDeviceId())); setStepError(null); }
        catch (e) { Alert.alert('Не удалось подписать', ответ(e, 'Попробуйте ещё раз')); }
        finally { setBusy(false); }
    };

    const submit = async () => {
        setBusy(true);
        try {
            const d = await exchangeApi.submit();
            router.replace('/exchange');
            if (d.status === 'APPROVED') Alert.alert('Готово!', 'Вы допущены к грузам. Выбирайте и берите.');
        } catch (e) {
            Alert.alert('Анкета не отправлена', ответ(e, 'Попробуйте ещё раз'));
        } finally {
            setBusy(false);
        }
    };

    if (!driver) {
        return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={BRAND.primary} /></View>;
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Где я в анкете */}
            <View style={[styles.progressWrap, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <Text style={[styles.progressText, { color: colors.textSecondary }]}>Шаг {index + 1} из {steps.length}</Text>
                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressFill, { width: `${((index + 1) / steps.length) * 100}%` }]} />
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
                <Title>{TITLES[step]}</Title>

                {step === 'kind' && (
                    <>
                        <Choice
                            icon="briefcase-outline"
                            title="У меня есть ИП"
                            text="Вы сами перевозчик: берёте грузы и работаете с заказчиком напрямую. Проверки нет."
                            selected={driver.kind === 'IP'}
                            onPress={() => chooseKind('IP')}
                        />
                        <Choice
                            icon="people-outline"
                            title="Без ИП — через парк"
                            text="Парк оформит договор аренды вашей машины с вами за рулём, и перевозка будет законной. Парк проверит документы."
                            selected={driver.kind === 'PARK'}
                            onPress={() => chooseKind('PARK')}
                        />
                    </>
                )}

                {step === 'person' && (
                    <>
                        <Field label="Фамилия" error={errors.lastName} value={form.lastName} onChangeText={(v: string) => set('lastName', v)} autoCapitalize="words" />
                        <Field label="Имя" error={errors.firstName} value={form.firstName} onChangeText={(v: string) => set('firstName', v)} autoCapitalize="words" />
                        <Field label="Отчество" hint="Если есть" value={form.middleName} onChangeText={(v: string) => set('middleName', v)} autoCapitalize="words" />
                        <Field label="ИИН" error={errors.iin} hint="12 цифр, как в удостоверении" value={form.iin} onChangeText={(v: string) => set('iin', v.replace(/\D/g, '').slice(0, 12))} keyboardType="number-pad" />
                        <Field label="Телефон" error={errors.phone} hint="На него позвонит парк или заказчик" value={form.phone} onChangeText={(v: string) => set('phone', v)} keyboardType="phone-pad" />
                        {driver.kind === 'IP' && (
                            <>
                                <Field label="Название ИП" error={errors.ipName} hint="Как в документе о регистрации" placeholder="ИП Сериков" value={form.ipName} onChangeText={(v: string) => set('ipName', v)} />
                                <Field label="ИИН ИП" error={errors.ipIin} hint="Обычно совпадает с вашим ИИН" value={form.ipIin} onChangeText={(v: string) => set('ipIin', v.replace(/\D/g, '').slice(0, 12))} keyboardType="number-pad" />
                            </>
                        )}
                    </>
                )}

                {step === 'vehicle' && (
                    <>
                        <Field label="Госномер" error={errors.vehiclePlate} placeholder="123 ABC 02" value={form.vehiclePlate} onChangeText={(v: string) => set('vehiclePlate', v.toUpperCase())} autoCapitalize="characters" />
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Тип кузова</Text>
                        <BodyTypePicker value={form.vehicleBodyType || null} onChange={(v) => set('vehicleBodyType', v)} />
                        {!!errors.vehicleBodyType && <Text style={[styles.fieldError, { color: colors.danger }]}>{errors.vehicleBodyType}</Text>}
                        <Field style={{ marginTop: 14 }} label="Грузоподъёмность, т" error={errors.capacityTons} hint="Сколько тонн берёте" placeholder="20" value={form.capacityTons} onChangeText={(v: string) => set('capacityTons', v)} keyboardType="decimal-pad" />
                        {driver.kind === 'PARK' && (
                            <>
                                <Text style={[styles.label, { color: colors.textSecondary }]}>Чья машина</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {[{ own: true, label: 'Моя' }, { own: false, label: 'Не моя, есть доверенность' }].map((o) => (
                                        <Pressable
                                            key={String(o.own)}
                                            onPress={() => save({ vehicleIsOwn: o.own }).catch((e) => Alert.alert('Ошибка', ответ(e, 'Не сохранилось')))}
                                            style={[styles.toggle, {
                                                backgroundColor: driver.vehicleIsOwn === o.own ? sel.bg : colors.card,
                                                borderColor: driver.vehicleIsOwn === o.own ? sel.bg : colors.border,
                                            }]}
                                        >
                                            <Text style={{ color: driver.vehicleIsOwn === o.own ? sel.fg : colors.text, fontWeight: '600', fontSize: 13.5, textAlign: 'center' }}>{o.label}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </>
                        )}
                    </>
                )}

                {step === 'park' && !!joinedBy && (
                    <Card style={{ backgroundColor: '#e7f8ef', borderColor: '#bbf7d0' }}>
                        <Text style={{ color: '#14532d', fontWeight: '700' }}>Вы в парке {вКавычках(joinedBy)} по приглашению</Text>
                        <Text style={{ color: '#166534', fontSize: 13, marginTop: 2 }}>Можно идти дальше — к фото документов.</Text>
                    </Card>
                )}
                {step === 'park' && (
                    <Card>
                        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Есть код от парка?</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <View style={{ flex: 1 }}>
                                <Field
                                    label="Код парка"
                                    placeholder="Например: K7M2QX"
                                    value={code}
                                    onChangeText={(v: string) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                                    autoCapitalize="characters"
                                    style={{ marginBottom: 0 }}
                                />
                            </View>
                            <Button title="Вступить" loading={codeBusy} onPress={joinByCode} style={{ alignSelf: 'flex-end', paddingHorizontal: 14 }} />
                        </View>
                        <Text style={{ color: colors.textTertiary, fontSize: 12.5, marginTop: 8 }}>Или выберите парк из списка ниже.</Text>
                    </Card>
                )}
                {step === 'park' && (
                    parks.length === 0
                        ? <Card><Text style={{ color: colors.textSecondary }}>Парков на бирже пока нет. Загляните позже.</Text></Card>
                        : parks.map((p) => (
                            <Choice
                                key={p.id}
                                icon="business-outline"
                                title={p.name}
                                text={p.bin ? `БИН ${p.bin}` : 'Парк биржи'}
                                selected={driver.park?.id === p.id}
                                onPress={() => save({ parkCompanyId: p.id }).then(() => setStepError(null)).catch((e) => setStepError(ответ(e, 'Не сохранилось — проверьте интернет')))}
                            />
                        ))
                )}

                {step === 'documents' && (
                    <>
                        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
                            Парк сверит фото с данными анкеты. Снимайте при хорошем свете, чтобы всё читалось.
                        </Text>
                        {docs.map((d) => {
                            const doc = driver.documents.find((x) => x.kind === d.kind);
                            return (
                                <Card key={d.kind} style={{ padding: 12 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <View style={[styles.thumb, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                            {uploading === d.kind ? <ActivityIndicator color={BRAND.primary} />
                                                : doc ? <Image source={{ uri: `${API_URL}${documentPath(doc.id)}`, headers: getAuthHeader() }} style={styles.thumbImage} />
                                                    : <Ionicons name="camera-outline" size={24} color={colors.textTertiary} />}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14.5 }}>{d.title}</Text>
                                            <Text style={{ color: doc ? '#15803d' : colors.textTertiary, fontSize: 12.5, marginTop: 2 }}>
                                                {doc ? 'Загружено — можно переснять' : d.hint}
                                            </Text>
                                            <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                                                <Pressable onPress={() => pickPhoto(d.kind, 'camera')} hitSlop={6}>
                                                    <Text style={styles.link}>{doc ? 'Переснять' : 'Сфотографировать'}</Text>
                                                </Pressable>
                                                <Pressable onPress={() => pickPhoto(d.kind, 'library')} hitSlop={6}>
                                                    <Text style={styles.link}>Из галереи</Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    </View>
                                </Card>
                            );
                        })}
                    </>
                )}

                {step === 'contract' && (
                    <>
                        <Card>
                            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 }}>
                                Договор аренды транспортного средства с экипажем
                            </Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>
                                Стороны: парк {вКавычках(driver.park?.name)} и {[driver.lastName, driver.firstName, driver.middleName].filter(Boolean).join(' ') || 'вы'}.{'\n\n'}
                                Парк берёт в аренду вашу машину {driver.vehiclePlate ? `(${driver.vehiclePlate}) ` : ''}вместе с вами за рулём на время рейсов,
                                которые вы берёте на бирже. За каждый рейс парк платит вам сумму груза за вычетом комиссии парка и налогов,
                                которые парк удерживает и платит за вас по закону.{'\n\n'}
                                Полный текст договора передаст парк. Нажимая «Подписываю», вы соглашаетесь с ним; система запомнит время и телефон подписи.
                            </Text>
                        </Card>
                        {driver.contractSignedAt ? (
                            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Ionicons name="checkmark-circle" size={22} color="#15803d" />
                                <Text style={{ color: colors.text, fontWeight: '700' }}>
                                    Подписано {new Date(driver.contractSignedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </Card>
                        ) : (
                            <Button title="Подписываю" icon="create-outline" variant="dark" loading={busy} onPress={sign} />
                        )}
                    </>
                )}

                {step === 'review' && (
                    <>
                        <Card>
                            {[
                                ['Работаю', driver.kind === 'IP' ? `свой ИП${driver.ipName ? ` · ${driver.ipName}` : ''}` : `через парк ${вКавычках(driver.park?.name)}`],
                                ['ФИО', [driver.lastName, driver.firstName, driver.middleName].filter(Boolean).join(' ') || '—'],
                                ['ИИН', driver.iin ?? '—'],
                                ['Телефон', телефонКрасиво(driver.phone)],
                                ['Машина', [driver.vehiclePlate, driver.vehicleBodyType, driver.vehicleCapacityKg ? `${driver.vehicleCapacityKg / 1000} т` : null].filter(Boolean).join(' · ') || '—'],
                                ...(driver.kind === 'PARK' ? [['Документы', `${driver.documents.length} фото`], ['Договор', driver.contractSignedAt ? 'подписан' : 'не подписан']] : []),
                            ].map(([label, value]) => (
                                <View key={label} style={styles.reviewRow}>
                                    <Text style={{ color: colors.textTertiary, width: 100, fontSize: 13.5 }}>{label}</Text>
                                    <Text style={{ color: colors.text, flex: 1, fontSize: 14.5, fontWeight: '600' }}>{value}</Text>
                                </View>
                            ))}
                        </Card>
                        {driver.missing.length > 0 ? (
                            <Card style={{ borderColor: '#fcd34d', backgroundColor: '#fffbeb' }}>
                                <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Осталось заполнить</Text>
                                {driver.missing.map((m) => <Text key={m} style={{ color: '#92400e', fontSize: 13.5, lineHeight: 20 }}>• {m}</Text>)}
                            </Card>
                        ) : (
                            <Text style={{ color: colors.textSecondary, fontSize: 13.5, lineHeight: 19, marginBottom: 12 }}>
                                {driver.kind === 'IP'
                                    ? 'После отправки вы сразу сможете брать грузы.'
                                    : 'Парк проверит документы и, возможно, позвонит. После допуска появятся грузы.'}
                            </Text>
                        )}
                        <Button title="Отправить анкету" icon="paper-plane-outline" loading={busy} disabled={driver.missing.length > 0} onPress={submit} />
                    </>
                )}
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
                {!!stepError && (
                    <View style={styles.stepError} accessibilityLiveRegion="polite">
                        <Ionicons name="alert-circle" size={18} color="#b91c1c" />
                        <Text style={styles.stepErrorText}>{stepError}</Text>
                    </View>
                )}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    {index === 0
                        ? <Button title="Выйти" variant="secondary" onPress={exit} style={{ flex: 1 }} />
                        : <Button title="Назад" variant="secondary" onPress={back} style={{ flex: 1 }} />}
                    {step !== 'review' && <Button title="Далее" icon="arrow-forward" loading={busy} onPress={next} style={{ flex: 2 }} />}
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    progressWrap: { paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1 },
    progressText: { fontSize: 12.5, fontWeight: '600', marginBottom: 6 },
    progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 5, borderRadius: 3, backgroundColor: BRAND.primary },
    label: { fontSize: 12.5, fontWeight: '600', marginBottom: 8, marginTop: 4 },
    toggle: { flex: 1, minHeight: 46, borderRadius: RADIUS.button, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
    thumb: { width: 64, height: 64, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    thumbImage: { width: 64, height: 64 },
    link: { color: BRAND.primary, fontWeight: '700', fontSize: 14 },
    reviewRow: { flexDirection: 'row', paddingVertical: 7 },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
    stepError: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#fef2f2', borderRadius: 12, padding: 10, marginBottom: 10 },
    stepErrorText: { flex: 1, color: '#b91c1c', fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
    fieldError: { fontSize: 12, marginTop: 6, lineHeight: 16 },
});
