import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '@/hooks/useAppTheme';
import { API_URL } from '@/lib/api';
import { exchangeApi, OwnerContractForm, OwnerContractState, ответ } from '@/lib/exchange';
import { Button, Card, Field } from '@/components/kit';
import { FONT, selectedColors } from '@/lib/theme';

const ПУСТО: OwnerContractForm = {
    ownerKind: 'PERSON', ownerName: '', ownerIinBin: '', ownerIdNumber: '', ownerIdIssuedBy: '', ownerIdIssuedAt: '',
    ownerAddress: '', ownerPhone: '', ownerSigner: '', rentAmount: null, rentBasis: 'MONTH',
};

/** «2016-03-15» ↔ «15.03.2016»: на экране — как в удостоверении. */
const наЭкран = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const вИсо = (day: string) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(day.trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/**
 * Договор с хозяином машины — когда машина записана на другого человека
 * (владелец, 31.10.2026: «парк составляет договор с водителем, а водитель —
 * с хозяином машины, чтобы, если что, парк был ни при чём»).
 *
 * Своя ли машина, сервер понимает сам — по ИИН собственника из техпаспорта.
 * Своя — блока нет вовсе. Чужая — водитель вписывает данные хозяина,
 * открывает PDF, они подписывают на бумаге, водитель присылает фото.
 */
export function OwnerContractCard({ onChanged, showTitle = true }: { onChanged?: () => void; showTitle?: boolean }) {
    const { colors, isDark } = useAppTheme();
    const sel = selectedColors(isDark);
    const [state, setState] = useState<OwnerContractState | null>(null);
    const [form, setForm] = useState<OwnerContractForm>(ПУСТО);
    const [issuedAt, setIssuedAt] = useState('');
    const [rent, setRent] = useState('');
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState<'save' | 'pdf' | 'photo' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        exchangeApi.ownerContract().then((s) => {
            setState(s);
            const c = s.contract;
            setForm(c ? { ...ПУСТО, ...c, rentBasis: c.rentBasis ?? 'MONTH' } : { ...ПУСТО, ownerIinBin: s.ownerIin ?? '' });
            setIssuedAt(наЭкран(c?.ownerIdIssuedAt));
            setRent(c?.rentAmount ? String(c.rentAmount) : '');
            setEditing(!c);
        }).catch(() => setState(null));
    }, []);
    useEffect(load, [load]);

    // Своя машина или старый сервер — договор с хозяином не нужен.
    if (!state?.needed) return null;
    const c = state.contract;
    const person = form.ownerKind === 'PERSON';
    const set = (k: keyof OwnerContractForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

    const save = async () => {
        setError(null);
        if (!form.ownerName.trim()) { setError(person ? 'Впишите ФИО хозяина машины' : 'Впишите название организации'); return; }
        const day = issuedAt.trim() ? вИсо(issuedAt) : null;
        if (issuedAt.trim() && !day) { setError('Дата выдачи удостоверения — ДД.ММ.ГГГГ'); return; }
        const amount = rent.trim() ? Number(rent.replace(/\s/g, '').replace(',', '.')) : null;
        if (rent.trim() && !(amount && amount > 0)) { setError('Плата — числом, например 150000. Можно не указывать'); return; }
        setBusy('save');
        try {
            await exchangeApi.saveOwnerContract({
                ...form,
                ownerIinBin: form.ownerIinBin?.replace(/\D/g, '') || null,
                ownerIdIssuedAt: person ? day : null,
                rentAmount: amount,
                rentBasis: amount ? form.rentBasis : null,
            });
            load();
            onChanged?.();
        } catch (e) {
            setError(ответ(e, 'Не сохранилось — проверьте интернет'));
        } finally {
            setBusy(null);
        }
    };

    const openPdf = async () => {
        setBusy('pdf');
        try {
            const { path } = await exchangeApi.ownerContractLink();
            await Linking.openURL(`${API_URL}${path}`);
        } catch (e) {
            Alert.alert('Не открылось', ответ(e, 'Попробуйте ещё раз'));
        } finally {
            setBusy(null);
        }
    };

    const sendPhoto = async (from: 'camera' | 'library') => {
        try {
            if (from === 'camera') {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) { Alert.alert('Нет доступа к камере', 'Разрешите камеру в настройках телефона или выберите фото из галереи.'); return; }
            }
            const result = from === 'camera'
                ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
                : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
            if (result.canceled || !result.assets?.[0]) return;
            setBusy('photo');
            await exchangeApi.uploadOwnerContractSigned(result.assets[0].uri);
            load();
            onChanged?.();
        } catch (e) {
            Alert.alert('Фото не отправилось', ответ(e, 'Проверьте интернет и попробуйте ещё раз'));
        } finally {
            setBusy(null);
        }
    };

    const toggle = (active: boolean) => ({
        flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center' as const,
        backgroundColor: active ? sel.bg : colors.card, borderColor: active ? sel.bg : colors.border,
    });

    return (
        <Card style={{ padding: 14 }}>
            {/* В «Моих документах» над карточкой уже есть заголовок раздела — второй не нужен. */}
            {showTitle && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Ionicons name="car-outline" size={18} color={colors.text} />
                    <Text style={{ color: colors.text, fontFamily: FONT.bold, fontSize: 15.5 }}>Договор с хозяином машины</Text>
                </View>
            )}
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                По техпаспорту машина не ваша. Составьте договор аренды с её хозяином: впишите его данные, распечатайте, подпишите вдвоём и пришлите фото. Парк в этом договоре не участвует. Вместо договора можно прислать фото доверенности от хозяина.
            </Text>

            {c && !editing && (
                <View style={{ marginTop: 12, gap: 8 }}>
                    <Text style={{ color: c.status === 'SIGNED' ? '#15803d' : colors.text, fontFamily: FONT.semibold, fontSize: 14 }}>
                        {c.status === 'SIGNED' ? `Подписан, фото получено · № ${c.number}` : `Составлен № ${c.number} — распечатайте и подпишите`}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Хозяин: {c.ownerName}</Text>
                    {c.gaps.length > 0 && (
                        <Text style={{ color: colors.danger, fontSize: 13 }}>Не хватает: {c.gaps.join(', ')}</Text>
                    )}
                    {c.gaps.length === 0 && (
                        <Pressable onPress={openPdf} disabled={busy === 'pdf'} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                            {busy === 'pdf' ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="document-outline" size={18} color={colors.text} />}
                            <Text style={{ color: colors.text, fontFamily: FONT.bold, fontSize: 14, textDecorationLine: 'underline' }}>Открыть PDF для печати</Text>
                        </Pressable>
                    )}
                    {c.gaps.length === 0 && (
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Button title={c.status === 'SIGNED' ? 'Переснять фото' : 'Сфотографировать подписанный'} icon="camera-outline" loading={busy === 'photo'} onPress={() => sendPhoto('camera')} style={{ flex: 1 }} />
                            <Button title="Из галереи" variant="secondary" onPress={() => sendPhoto('library')} disabled={busy === 'photo'} />
                        </View>
                    )}
                    <Pressable onPress={() => setEditing(true)} hitSlop={6}>
                        <Text style={{ color: colors.textSecondary, fontSize: 13.5, textDecorationLine: 'underline' }}>
                            {c.status === 'SIGNED' ? 'Другой хозяин — составить новый договор' : 'Исправить данные хозяина'}
                        </Text>
                    </Pressable>
                </View>
            )}

            {editing && (
                <View style={{ marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                        {([['PERSON', 'Человек'], ['COMPANY', 'ТОО или ИП']] as const).map(([k, label]) => (
                            <Pressable key={k} onPress={() => set('ownerKind', k)} style={toggle(form.ownerKind === k)} accessibilityRole="radio" accessibilityState={{ selected: form.ownerKind === k }}>
                                <Text style={{ color: form.ownerKind === k ? sel.fg : colors.text, fontFamily: FONT.semibold, fontSize: 13.5 }}>{label}</Text>
                            </Pressable>
                        ))}
                    </View>
                    <Field label={person ? 'ФИО хозяина' : 'Название организации'} placeholder={person ? 'Как в техпаспорте' : 'ТОО «…» или ИП …'} value={form.ownerName} onChangeText={(v: string) => set('ownerName', v)} />
                    <Field label={person ? 'ИИН хозяина' : 'БИН'} hint="12 цифр, как в техпаспорте" keyboardType="number-pad" maxLength={12} value={form.ownerIinBin ?? ''} onChangeText={(v: string) => set('ownerIinBin', v.replace(/\D/g, ''))} />
                    {person && (
                        <>
                            <Field label="Номер удостоверения хозяина" keyboardType="number-pad" value={form.ownerIdNumber ?? ''} onChangeText={(v: string) => set('ownerIdNumber', v)} />
                            <Field label="Кем выдано" placeholder="МВД РК" value={form.ownerIdIssuedBy ?? ''} onChangeText={(v: string) => set('ownerIdIssuedBy', v)} />
                            <Field label="Дата выдачи" placeholder="ДД.ММ.ГГГГ" keyboardType="numbers-and-punctuation" value={issuedAt} onChangeText={setIssuedAt} />
                        </>
                    )}
                    <Field label={person ? 'Адрес прописки хозяина' : 'Юридический адрес'} value={form.ownerAddress ?? ''} onChangeText={(v: string) => set('ownerAddress', v)} />
                    <Field label="Телефон хозяина" keyboardType="phone-pad" placeholder="+7" value={form.ownerPhone ?? ''} onChangeText={(v: string) => set('ownerPhone', v)} />
                    {!person && <Field label="Кто подписывает за организацию" placeholder="Директор Иванов И. И." value={form.ownerSigner ?? ''} onChangeText={(v: string) => set('ownerSigner', v)} />}
                    <Field label="Плата за аренду, ₸" hint="Можно не указывать — впишете от руки при подписании" keyboardType="number-pad" value={rent} onChangeText={setRent} />
                    {!!rent.trim() && (
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                            {([['MONTH', 'За месяц'], ['TRIP', 'За рейс']] as const).map(([k, label]) => (
                                <Pressable key={k} onPress={() => set('rentBasis', k)} style={toggle(form.rentBasis === k)} accessibilityRole="radio" accessibilityState={{ selected: form.rentBasis === k }}>
                                    <Text style={{ color: form.rentBasis === k ? sel.fg : colors.text, fontFamily: FONT.semibold, fontSize: 13.5 }}>{label}</Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
                    {!!error && <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 8 }}>{error}</Text>}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Button title="Сохранить" onPress={save} loading={busy === 'save'} style={{ flex: 1 }} />
                        {c && <Button title="Отмена" variant="secondary" onPress={() => { setEditing(false); load(); }} />}
                    </View>
                </View>
            )}
        </Card>
    );
}
