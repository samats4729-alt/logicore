'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { reportRequestFailure } from '@/lib/load';
import { VEHICLE_TYPES } from '@/lib/constants';
import { PALLET_KINDS } from '@/lib/cargo';
import { PickerOption, RecordPicker } from './RecordPicker';
import { CityOption, CityPicker } from './CityPicker';
import { QuoteMemory, QuoteMemoryPanel } from './QuoteMemoryPanel';

export interface QuoteFormValues {
    id?: string;
    customerCompanyId: string;
    /** Город как написали. Главное поле маршрута: справочник знает не всё. */
    originCityName: string;
    /** Ссылка на справочник, если город удалось выбрать из подсказок. */
    originCityId: string;
    destinationCityName: string;
    destinationCityId: string;
    originAddress: string;
    destinationAddress: string;
    readyDate: string;
    natureOfCargo: string;
    cargoDescription: string;
    cargoType: string;
    /** В тоннах — так говорит клиент. В килограммы переводим один раз, на отправке. */
    cargoWeightTons: string;
    cargoVolume: string;
    /** Вид паллеты — ключ из `PALLET_KINDS`. Одного вида на запрос хватает:
     *  клиент говорит «две европаллеты», смешанный состав появляется в заявке. */
    palletKind: string;
    palletCount: string;
    carrierCost: string;
    customerPrice: string;
    notes: string;
}

const EMPTY: QuoteFormValues = {
    customerCompanyId: '', originCityName: '', originCityId: '',
    destinationCityName: '', destinationCityId: '',
    originAddress: '', destinationAddress: '', readyDate: '',
    natureOfCargo: '', cargoDescription: '', cargoType: '',
    cargoWeightTons: '', cargoVolume: '', palletKind: '', palletCount: '',
    carrierCost: '', customerPrice: '', notes: '',
};

/** Тонны с экрана в килограммы для базы. Единственное место, где это происходит. */
function tonsToKg(value: string): number | undefined {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) && value.trim() !== '' ? Math.round(n * 1000) : undefined;
}

function num(value: string): number | undefined {
    const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && value.trim() !== '' ? n : undefined;
}

/**
 * Заведение и правка запроса на расчёт.
 *
 * Главное здесь — панель памяти под маршрутом. Она подтягивается, как
 * только известны клиент и направление, то есть до того, как менеджер
 * назовёт цену. В этом весь смысл: после того как цена названа, напоминать
 * о прошлом отказе поздно.
 */
export function QuoteFormDialog({
    open,
    onOpenChange,
    customers,
    cities,
    onCityImported,
    initial,
    lockedCustomerId,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    customers: PickerOption[];
    cities: CityOption[];
    /** Город завели из 2ГИС — справочник у родителя должен об этом узнать. */
    onCityImported?: (city: CityOption) => void;
    initial?: Partial<QuoteFormValues> | null;
    /** В карточке контрагента клиент уже известен и не выбирается. */
    lockedCustomerId?: string;
    onSaved: () => void;
}) {
    const [values, setValues] = useState<QuoteFormValues>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [memory, setMemory] = useState<QuoteMemory | null>(null);
    const [memoryLoading, setMemoryLoading] = useState(false);
    const memoryRequest = useRef(0);

    const set = <K extends keyof QuoteFormValues>(key: K, value: QuoteFormValues[K]) =>
        setValues((v) => ({ ...v, [key]: value }));

    useEffect(() => {
        if (!open) return;
        setValues({ ...EMPTY, ...initial, customerCompanyId: lockedCustomerId || initial?.customerCompanyId || '' });
        setMemory(null);
    }, [open, initial, lockedCustomerId]);

    // Память подтягивается на каждое изменение условий. Ответы нумеруем:
    // менеджер щёлкает города подряд, и медленный ранний ответ не должен
    // затирать свежий — на выборе заявок этим уже обжигались.
    useEffect(() => {
        if (!open) return;
        const { customerCompanyId, originCityName, originCityId, destinationCityName, destinationCityId } = values;
        if (!customerCompanyId || !(originCityName || originCityId) || !(destinationCityName || destinationCityId)) {
            setMemory(null);
            return;
        }

        const id = ++memoryRequest.current;
        setMemoryLoading(true);
        const timer = setTimeout(() => {
            api.post('/quote-requests/memory', {
                customerCompanyId,
                originCityName: originCityName || undefined,
                originCityId: originCityId || undefined,
                destinationCityName: destinationCityName || undefined,
                destinationCityId: destinationCityId || undefined,
                cargoType: values.cargoType || undefined,
                cargoWeight: tonsToKg(values.cargoWeightTons),
                cargoVolume: num(values.cargoVolume),
                excludeId: values.id,
            })
                .then((res) => {
                    if (id === memoryRequest.current) setMemory(res.data);
                })
                .catch((e) => {
                    if (id === memoryRequest.current) setMemory(null);
                    reportRequestFailure(e);
                })
                .finally(() => {
                    if (id === memoryRequest.current) setMemoryLoading(false);
                });
        }, 300);

        return () => clearTimeout(timer);
    }, [open, values.customerCompanyId, values.originCityName, values.originCityId,
        values.destinationCityName, values.destinationCityId,
        values.cargoType, values.cargoWeightTons, values.cargoVolume, values.id]);

    const save = async () => {
        if (!values.customerCompanyId) return toast.warning('Выберите клиента');
        if (!values.originCityName && !values.originCityId) return toast.warning('Укажите город погрузки');
        if (!values.destinationCityName && !values.destinationCityId) return toast.warning('Укажите город выгрузки');

        const body = {
            customerCompanyId: values.customerCompanyId,
            originCityName: values.originCityName || undefined,
            originCityId: values.originCityId || undefined,
            destinationCityName: values.destinationCityName || undefined,
            destinationCityId: values.destinationCityId || undefined,
            originAddress: values.originAddress || undefined,
            destinationAddress: values.destinationAddress || undefined,
            readyDate: values.readyDate ? new Date(values.readyDate).toISOString() : undefined,
            natureOfCargo: values.natureOfCargo || undefined,
            cargoDescription: values.cargoDescription || undefined,
            cargoType: values.cargoType || undefined,
            cargoWeight: tonsToKg(values.cargoWeightTons),
            cargoVolume: num(values.cargoVolume),
            palletKind: values.palletKind || undefined,
            palletCount: num(values.palletCount),
            carrierCost: num(values.carrierCost),
            customerPrice: num(values.customerPrice),
            notes: values.notes || undefined,
        };

        setSaving(true);
        try {
            if (values.id) {
                await api.patch(`/quote-requests/${values.id}`, body);
                toast.success('Запрос обновлён');
            } else {
                const res = await api.post('/quote-requests', body);
                toast.success(`Запрос ${res.data?.requestNumber || ''} создан`);
            }
            onOpenChange(false);
            onSaved();
        } catch (e: any) {
            const message = e?.response?.data?.message;
            toast.error(Array.isArray(message) ? message[0] : message || 'Не удалось сохранить запрос');
        } finally {
            setSaving(false);
        }
    };

    const margin = (() => {
        const cost = num(values.carrierCost);
        const price = num(values.customerPrice);
        if (cost == null || price == null) return null;
        return price - cost;
    })();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/*
              * Прокручивается только середина. Раньше прокручивалось окно
              * целиком: на ноутбуке форма выше экрана, и, докрутив до
              * «Сохранить», человек терял из виду заголовок, а сами кнопки
              * упирались в нижний край. Заголовок и кнопки закреплены,
              * поля ездят между ними.
              */}
            <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
                <DialogHeader className="shrink-0 border-b px-6 py-4">
                    <DialogTitle className="text-[15px]">
                        {values.id ? 'Запрос на расчёт' : 'Новый запрос на расчёт'}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
                    {!lockedCustomerId && (
                        <Field label="Клиент">
                            <RecordPicker
                                title="Выберите клиента"
                                placeholder="Кто прислал запрос"
                                options={customers}
                                valueId={values.customerCompanyId}
                                onSelect={(id) => set('customerCompanyId', id || '')}
                                emptyHint="Контрагентов пока нет. Заведите их в разделе «Кабинет» → «Контрагенты»."
                            />
                        </Field>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Город погрузки">
                            <CityPicker
                                title="Город погрузки"
                                placeholder="Откуда"
                                known={cities}
                                valueId={values.originCityId}
                                valueName={values.originCityName}
                                onSelect={(city) => setValues((v) => ({
                                    ...v, originCityId: city.id || '', originCityName: city.name,
                                }))}
                                onImported={onCityImported}
                            />
                        </Field>
                        <Field label="Город выгрузки">
                            <CityPicker
                                title="Город выгрузки"
                                placeholder="Куда"
                                known={cities}
                                valueId={values.destinationCityId}
                                valueName={values.destinationCityName}
                                onSelect={(city) => setValues((v) => ({
                                    ...v, destinationCityId: city.id || '', destinationCityName: city.name,
                                }))}
                                onImported={onCityImported}
                            />
                        </Field>
                    </div>

                    <QuoteMemoryPanel memory={memory} loading={memoryLoading} />

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Адрес погрузки" hint="Если клиент уже назвал точный адрес">
                            <Input
                                value={values.originAddress}
                                onChange={(e) => set('originAddress', e.target.value)}
                                placeholder="Улица, дом, склад"
                                className="h-9 text-[13px]"
                            />
                        </Field>
                        <Field label="Адрес выгрузки">
                            <Input
                                value={values.destinationAddress}
                                onChange={(e) => set('destinationAddress', e.target.value)}
                                placeholder="Улица, дом, склад"
                                className="h-9 text-[13px]"
                            />
                        </Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Груз готов">
                            <Input
                                type="date"
                                value={values.readyDate}
                                onChange={(e) => set('readyDate', e.target.value)}
                                className="h-9 text-[13px]"
                            />
                        </Field>
                        <Field label="Характер груза">
                            <Input
                                value={values.natureOfCargo}
                                onChange={(e) => set('natureOfCargo', e.target.value)}
                                placeholder="Напитки, стройматериалы"
                                className="h-9 text-[13px]"
                            />
                        </Field>
                        <Field label="Тип кузова">
                            <select
                                value={values.cargoType}
                                onChange={(e) => set('cargoType', e.target.value)}
                                className="h-9 w-full rounded-xl border border-input bg-background px-3 text-[13px]"
                            >
                                <option value="">не указан</option>
                                {VEHICLE_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Вес, т" hint="Клиенты говорят тоннами">
                            <Input
                                value={values.cargoWeightTons}
                                onChange={(e) => set('cargoWeightTons', e.target.value)}
                                placeholder="20"
                                inputMode="decimal"
                                className="h-9 text-[13px] tabular-nums"
                            />
                        </Field>
                        <Field label="Объём, м³">
                            <Input
                                value={values.cargoVolume}
                                onChange={(e) => set('cargoVolume', e.target.value)}
                                placeholder="86"
                                inputMode="decimal"
                                className="h-9 text-[13px] tabular-nums"
                            />
                        </Field>
                        {/* Паллеты — то, чем клиент чаще всего и меряет груз:
                            «две европаллеты Астана — Алматы». Без вида одно
                            количество ничего не говорит: европаллет и
                            американский отличаются на треть площади. */}
                        <Field label="Вид паллеты">
                            <select
                                value={values.palletKind}
                                onChange={(e) => set('palletKind', e.target.value)}
                                className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
                            >
                                <option value="">Не указан</option>
                                {PALLET_KINDS.map((k) => (
                                    <option key={k.key} value={k.key}>{k.label}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Паллет, шт">
                            <Input
                                value={values.palletCount}
                                onChange={(e) => set('palletCount', e.target.value)}
                                placeholder="2"
                                inputMode="numeric"
                                className="h-9 text-[13px] tabular-nums"
                            />
                        </Field>
                        <Field label="Что везём">
                            <Input
                                value={values.cargoDescription}
                                onChange={(e) => set('cargoDescription', e.target.value)}
                                placeholder="Пиво в коробках"
                                className="h-9 text-[13px]"
                            />
                        </Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Нашли машину за, ₸">
                            <Input
                                value={values.carrierCost}
                                onChange={(e) => set('carrierCost', e.target.value)}
                                placeholder="100000"
                                inputMode="numeric"
                                className="h-9 text-[13px] tabular-nums"
                            />
                        </Field>
                        <Field label="Предложили клиенту, ₸">
                            <Input
                                value={values.customerPrice}
                                onChange={(e) => set('customerPrice', e.target.value)}
                                placeholder="130000"
                                inputMode="numeric"
                                className="h-9 text-[13px] tabular-nums"
                            />
                        </Field>
                        <Field label="Маржа">
                            <div className="flex h-9 items-center px-1 text-[13px] tabular-nums">
                                {margin == null ? (
                                    <span className="text-muted-foreground">—</span>
                                ) : (
                                    <span className={margin >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                                        {margin.toLocaleString('ru-RU')} ₸
                                    </span>
                                )}
                            </div>
                        </Field>
                    </div>

                    <Field label="Заметка">
                        <Input
                            value={values.notes}
                            onChange={(e) => set('notes', e.target.value)}
                            placeholder="Например: клиент просит машину до 12:00"
                            className="h-9 text-[13px]"
                        />
                    </Field>
                </div>

                <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-3">
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        Отмена
                    </Button>
                    <Button size="sm" onClick={save} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Сохранить
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
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
