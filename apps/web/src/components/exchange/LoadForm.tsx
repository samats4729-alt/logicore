'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { ImagePlus, Loader2, Send, Truck, Package, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money-format';
import { ExchangeLoad, ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateStringField } from '@/components/ui/DateField';
import { CityOption, CityPicker } from '@/components/quotes/CityPicker';
import { RoutePricesPanel } from './RoutePricesPanel';
import styles from '@/components/nova/nova.module.css';

/** Сколько фото можно приложить — столько же принимает сервер. */
const MAX_PHOTOS = 10;

interface Values {
    originCityId: string;
    originCityName: string;
    originAddress: string;
    destinationCityId: string;
    destinationCityName: string;
    destinationAddress: string;
    loadingDate: string;
    loadingTime: string;
    bodyType: string;
    cargoDescription: string;
    weightTons: string;
    volumeM3: string;
    requirements: string;
    price: string;
}

const EMPTY: Values = {
    originCityId: '', originCityName: '', originAddress: '',
    destinationCityId: '', destinationCityName: '', destinationAddress: '',
    loadingDate: dayjs().format('YYYY-MM-DD'), loadingTime: '',
    bodyType: '', cargoDescription: '', weightTons: '', volumeM3: '', requirements: '',
    price: '',
};

function num(value: string): number | undefined {
    const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && value.trim() !== '' ? n : undefined;
}

/**
 * Поставить груз на биржу.
 *
 * Одна страница, а не мастер по шагам: полей немного, и всё видно разом —
 * откуда и куда, что везём, за сколько. Справа — цена и прошлые перевозки
 * по направлению: их видно до того, как цена названа.
 *
 * Фото выбираются вместе с остальным, а уходят на сервер сразу после
 * того, как груз сохранён: у фото должен быть груз, к которому их
 * приложить.
 */
export function LoadForm() {
    const router = useRouter();
    const [values, setValues] = useState<Values>(EMPTY);
    const [cities, setCities] = useState<CityOption[]>([]);
    const [photos, setPhotos] = useState<File[]>([]);
    const [saving, setSaving] = useState(false);

    const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

    useEffect(() => {
        api.get('/cities').then((r) => {
            const list = Array.isArray(r.data) ? r.data : r.data?.data || [];
            setCities(list.map((c: any) => ({
                id: c.id,
                name: c.name,
                hint: [c.region?.name, c.country?.name].filter(Boolean).join(', ') || null,
            })));
        }).catch(() => setCities([]));
    }, []);

    const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
    useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

    const addPhotos = (files: FileList | null) => {
        if (!files) return;
        const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (images.length < files.length) toast.warning('Сюда — только фотографии груза');
        setPhotos((prev) => {
            const next = [...prev, ...images];
            if (next.length > MAX_PHOTOS) toast.warning(`Не больше ${MAX_PHOTOS} фото — лишние не добавлены`);
            return next.slice(0, MAX_PHOTOS);
        });
    };

    /** Чего не хватает — словами, до отправки. Сервер проверит то же самое. */
    const missing = [
        !values.originCityName.trim() && 'откуда',
        !values.destinationCityName.trim() && 'куда',
        !values.loadingDate && 'день погрузки',
        !values.cargoDescription.trim() && 'что везём',
        !values.bodyType && 'тип кузова',
        !(num(parseMoneyInput(values.price)) && num(parseMoneyInput(values.price))! > 0) && 'цена',
    ].filter(Boolean) as string[];

    const submit = async () => {
        if (missing.length) {
            toast.error(`Не заполнено: ${missing.join(', ')}`);
            return;
        }
        setSaving(true);
        try {
            const weight = num(values.weightTons);
            const { data: load } = await api.post<ExchangeLoad>('/exchange/loads', {
                originCityName: values.originCityName,
                originCityId: values.originCityId || undefined,
                originAddress: values.originAddress || undefined,
                destinationCityName: values.destinationCityName,
                destinationCityId: values.destinationCityId || undefined,
                destinationAddress: values.destinationAddress || undefined,
                loadingDate: values.loadingDate,
                loadingTime: values.loadingTime || undefined,
                bodyType: values.bodyType,
                cargoDescription: values.cargoDescription,
                weightKg: weight !== undefined ? Math.round(weight * 1000) : undefined,
                volumeM3: num(values.volumeM3),
                requirements: values.requirements || undefined,
                price: num(parseMoneyInput(values.price)),
            });

            // Фото — после груза. Не загрузилось фото — груз уже на бирже,
            // говорим об этом прямо, а не делаем вид, что всё сорвалось.
            let failed = 0;
            for (const file of photos) {
                const form = new FormData();
                form.append('file', file);
                try {
                    await api.post(`/exchange/loads/${load.id}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
                } catch {
                    failed += 1;
                }
            }
            if (failed) toast.warning(`Груз ${load.number} на бирже, но ${failed} фото не загрузились — добавьте их в карточке груза`);
            else toast.success(`Груз ${load.number} на бирже`);
            router.push(`/company/exchange/${load.id}`);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось поставить груз'));
            setSaving(false);
        }
    };

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
                <section className={styles.card} style={{ marginBottom: 0 }}>
                    <div className={styles.cardHead}>
                        <Truck size={14} />
                        <h2 className={styles.cardTitle}>Откуда и куда</h2>
                    </div>
                    <div className={`${styles.cardBody} space-y-3`}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Город погрузки">
                                <CityPicker
                                    title="Город погрузки"
                                    placeholder="Откуда"
                                    known={cities}
                                    valueId={values.originCityId}
                                    valueName={values.originCityName}
                                    onSelect={(city) => setValues((v) => ({ ...v, originCityId: city.id || '', originCityName: city.name }))}
                                    onImported={(c) => setCities((list) => [...list, c])}
                                />
                            </Field>
                            <Field label="Город выгрузки">
                                <CityPicker
                                    title="Город выгрузки"
                                    placeholder="Куда"
                                    known={cities}
                                    valueId={values.destinationCityId}
                                    valueName={values.destinationCityName}
                                    onSelect={(city) => setValues((v) => ({ ...v, destinationCityId: city.id || '', destinationCityName: city.name }))}
                                    onImported={(c) => setCities((list) => [...list, c])}
                                />
                            </Field>
                            <Field label="Адрес погрузки" hint="улица, склад">
                                <Input value={values.originAddress} onChange={(e) => set('originAddress', e.target.value)} placeholder="ул. Толе би, 12, склад 3" className="h-9 text-[13px]" />
                            </Field>
                            <Field label="Адрес выгрузки">
                                <Input value={values.destinationAddress} onChange={(e) => set('destinationAddress', e.target.value)} placeholder="ул. Рыскулова, 57" className="h-9 text-[13px]" />
                            </Field>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="День погрузки">
                                <DateStringField value={values.loadingDate} onChange={(v) => set('loadingDate', v)} className="h-9 text-[13px]" />
                            </Field>
                            <Field label="Время погрузки" hint="как удобно">
                                <Input value={values.loadingTime} onChange={(e) => set('loadingTime', e.target.value)} placeholder="с 9 до 12" className="h-9 text-[13px]" />
                            </Field>
                        </div>
                    </div>
                </section>

                <section className={styles.card} style={{ marginBottom: 0 }}>
                    <div className={styles.cardHead}>
                        <Package size={14} />
                        <h2 className={styles.cardTitle}>Груз</h2>
                    </div>
                    <div className={`${styles.cardBody} space-y-3`}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Что везём">
                                <Input value={values.cargoDescription} onChange={(e) => set('cargoDescription', e.target.value)} placeholder="Напитки на паллетах" className="h-9 text-[13px]" />
                            </Field>
                            <Field label="Тип кузова">
                                <select
                                    aria-label="Тип кузова"
                                    value={values.bodyType}
                                    onChange={(e) => set('bodyType', e.target.value)}
                                    className="h-9 w-full rounded-xl border border-solid border-input bg-background px-3 text-[13px]"
                                >
                                    <option value="">выберите</option>
                                    {VEHICLE_TYPES.filter((t) => t !== 'не указан').map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </Field>
                            <Field label="Вес, т">
                                <Input value={values.weightTons} onChange={(e) => set('weightTons', e.target.value)} placeholder="20" inputMode="decimal" className="h-9 text-[13px] tabular-nums" />
                            </Field>
                            <Field label="Объём, м³">
                                <Input value={values.volumeM3} onChange={(e) => set('volumeM3', e.target.value)} placeholder="86" inputMode="decimal" className="h-9 text-[13px] tabular-nums" />
                            </Field>
                        </div>
                        <Field label="Что ещё важно водителю" hint="необязательно">
                            <textarea
                                value={values.requirements}
                                onChange={(e) => set('requirements', e.target.value)}
                                placeholder="Растентовка сбоку, ремни, гидроборт, температура +2…+6"
                                rows={3}
                                className="w-full resize-y rounded-xl border border-solid border-input bg-background px-3 py-2 text-[13px] [font-family:inherit]"
                            />
                        </Field>
                        <Field label="Фото груза" hint={`до ${MAX_PHOTOS}, водителю проще решить`}>
                            <div className="flex flex-wrap gap-2">
                                {previews.map((src, i) => (
                                    <div key={src} className="relative h-20 w-20 overflow-hidden rounded-xl border border-solid border-border">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={src} alt={photos[i]?.name || 'фото груза'} className="h-full w-full object-cover" />
                                        <button
                                            type="button"
                                            aria-label="Убрать фото"
                                            onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                                {photos.length < MAX_PHOTOS && (
                                    <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-[11px] text-muted-foreground hover:bg-muted/40">
                                        <ImagePlus className="h-4 w-4" />
                                        Добавить
                                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
                                    </label>
                                )}
                            </div>
                        </Field>
                    </div>
                </section>
            </div>

            <aside className="xl:sticky xl:top-20 xl:self-start" aria-label="Цена груза">
                <section className={styles.card} style={{ marginBottom: 0 }}>
                    <div className={styles.cardHead}>
                        <Wallet size={14} />
                        <h2 className={styles.cardTitle}>Цена перевозки</h2>
                    </div>
                    <div className={`${styles.cardBody} space-y-3`}>
                        <Field label="Сколько платите за перевозку, ₸">
                            <Input
                                aria-label="Цена перевозки"
                                value={formatMoneyInput(parseMoneyInput(values.price))}
                                onChange={(e) => set('price', parseMoneyInput(e.target.value).replace(/[^\d.]/g, ''))}
                                placeholder="Сумма в тенге"
                                inputMode="numeric"
                                className="h-10 text-[15px] font-semibold tabular-nums"
                            />
                        </Field>
                        <RoutePricesPanel
                            origin={values.originCityName}
                            destination={values.destinationCityName}
                            onUse={(p) => set('price', String(p))}
                        />
                        <Button className="w-full" onClick={submit} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Поставить на биржу
                        </Button>
                        {missing.length > 0 && (
                            <p className="text-[12px] text-muted-foreground">Осталось заполнить: {missing.join(', ')}.</p>
                        )}
                    </div>
                </section>
            </aside>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <Label className="text-[12px] font-medium text-muted-foreground">
                {label}
                {hint && <span className="ml-1 font-normal opacity-70">· {hint}</span>}
            </Label>
            {children}
        </div>
    );
}
