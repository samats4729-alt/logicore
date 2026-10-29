'use client';

import { useState } from 'react';
import { Form, InputNumber } from 'antd';
import { Plus, Trash2, X } from 'lucide-react';
import { ADR_CLASSES, PACKAGING_TYPES, PALLET_KINDS, type CargoState, type PalletLine, totalPallets } from '@/lib/cargo';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { cn } from '@/lib/utils';
import { Segmented, Switch } from './ui';
import s from './new-order.module.css';

/**
 * Упаковка и паллеты (ТЗ, §5.4). Упаковок можно отметить несколько — так
 * было и раньше, в старых заявках бывает «коробки на паллетах». Паллеты —
 * строками: вперемешку евро и финские, и своего размера.
 */
export function PackagingField({ cargo, onCargo }: { cargo: CargoState; onCargo: (next: CargoState) => void }) {
    const packaging = cargo.packagingTypes || [];
    const pallets = cargo.pallets || [];
    const showPallets = packaging.includes('PALLETS') || pallets.length > 0;

    const togglePack = (key: string) => {
        const next = packaging.includes(key) ? packaging.filter((k) => k !== key) : [...packaging, key];
        // Отметили паллеты — сразу строка «Евро × _», чтобы не искать, куда писать.
        const lines = key === 'PALLETS' && !packaging.includes(key) && !pallets.length
            ? [{ kind: 'EUR', count: 0, length: 120, width: 80 }]
            : pallets;
        onCargo({ ...cargo, packagingTypes: next, pallets: lines });
    };
    const setLine = (i: number, part: Partial<PalletLine>) => {
        const next = pallets.map((l, j) => (j === i ? { ...l, ...part } : l));
        if (part.kind) {
            const preset = PALLET_KINDS.find((k) => k.key === part.kind);
            next[i].length = preset?.length;
            next[i].width = preset?.width;
        }
        onCargo({ ...cargo, pallets: next });
    };
    const num = (raw: string) => (raw.trim() === '' ? undefined : Number(raw.replace(/\s/g, '').replace(',', '.')));

    return (
        <fieldset className="m-0 mt-5 min-w-0 border-0 p-0">
            <legend className={s.label} style={{ padding: 0, marginBottom: 8 }}>
                Упаковка <span className={s.labelNote}>· можно несколько</span>
            </legend>
            <Segmented
                large
                multiple
                ariaLabel="Упаковка"
                value={packaging}
                options={PACKAGING_TYPES.map((p) => ({ value: p.key, label: p.label }))}
                onChange={togglePack}
            />
            {showPallets && (
                <div className={s.subpanel} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                    {pallets.map((line, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2.5">
                            <span className={s.hint} style={{ width: 64 }}>{i === 0 ? 'Паллеты' : ''}</span>
                            <select
                                aria-label="Тип паллет"
                                className={s.smallSelect}
                                value={line.kind}
                                onChange={(e) => setLine(i, { kind: e.target.value })}
                            >
                                {PALLET_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                            </select>
                            {line.kind === 'CUSTOM' && (
                                <>
                                    <span className={s.smallBox}>
                                        <input aria-label="Длина паллеты, см" className={s.smallInput} inputMode="numeric" placeholder="дл." value={line.length ?? ''} onChange={(e) => setLine(i, { length: num(e.target.value) })} />
                                    </span>
                                    <span className={s.suffix}>×</span>
                                    <span className={s.smallBox}>
                                        <input aria-label="Ширина паллеты, см" className={s.smallInput} inputMode="numeric" placeholder="шир." value={line.width ?? ''} onChange={(e) => setLine(i, { width: num(e.target.value) })} />
                                        <span className={s.suffix} style={{ padding: '0 10px 0 2px' }}>см</span>
                                    </span>
                                </>
                            )}
                            <span className={s.suffix}>×</span>
                            <span className={s.smallBox}>
                                <input
                                    aria-label="Количество паллет"
                                    className={s.smallInput}
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={line.count || ''}
                                    onChange={(e) => setLine(i, { count: num(e.target.value) ?? 0 })}
                                />
                                <span className={s.suffix} style={{ padding: '0 10px 0 2px' }}>шт</span>
                            </span>
                            <button
                                type="button"
                                className={s.removeX}
                                aria-label={`Убрать строку паллет ${i + 1}`}
                                onClick={() => onCargo({ ...cargo, pallets: pallets.filter((_, j) => j !== i) })}
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <button
                            type="button"
                            className={s.linkBtn}
                            onClick={() => onCargo({ ...cargo, pallets: [...pallets, { kind: 'EUR', count: 0, length: 120, width: 80 }] })}
                        >
                            <Plus className="size-3.5" /> Ещё вид паллет
                        </button>
                        {pallets.length > 1 && <span className={s.hint}>Всего {totalPallets(pallets)} шт</span>}
                        <span className="flex items-center gap-2">
                            <span className={s.hint}>Грузовых мест</span>
                            <span className={s.smallBox}>
                                <input
                                    aria-label="Грузовых мест"
                                    className={s.smallInput}
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={cargo.placesCount ?? ''}
                                    onChange={(e) => onCargo({ ...cargo, placesCount: num(e.target.value) })}
                                />
                            </span>
                        </span>
                    </div>
                </div>
            )}
        </fieldset>
    );
}

type ExtraKey = 'value' | 'dims' | 'desc' | 'note';

/**
 * «Особые условия» (ТЗ, §5.7): переключатели и поля, которые добавляют
 * по ссылке «+ …». Поля формы заявки — те же, что были (`cargoLength`,
 * `cargoDescription`, `requirements`…); заполненное показывается сразу.
 */
export function SpecialConditions({ cargo, onCargo, showDims, onShowDims }: {
    cargo: CargoState;
    onCargo: (next: CargoState) => void;
    showDims: boolean;
    onShowDims: (on: boolean) => void;
}) {
    const form = Form.useFormInstance();
    const description = Form.useWatch('cargoDescription', { form, preserve: true });
    const requirements = Form.useWatch('requirements', { form, preserve: true });
    const [opened, setOpened] = useState<Record<ExtraKey, boolean>>({ value: false, dims: false, desc: false, note: false });

    const shown: Record<ExtraKey, boolean> = {
        value: opened.value || cargo.cargoValue != null,
        dims: opened.dims || showDims,
        desc: opened.desc || !!description,
        note: opened.note || !!requirements,
    };
    const add = (k: ExtraKey) => {
        setOpened((o) => ({ ...o, [k]: true }));
        if (k === 'dims') onShowDims(true);
        // Фокус — в добавленное поле, когда оно появится.
        requestAnimationFrame(() => document.getElementById(`no-extra-${k}`)?.focus());
    };
    const remove = (k: ExtraKey) => {
        setOpened((o) => ({ ...o, [k]: false }));
        if (k === 'value') onCargo({ ...cargo, cargoValue: undefined });
        if (k === 'dims') { onShowDims(false); form.setFieldsValue({ cargoLength: undefined, cargoWidth: undefined, cargoHeight: undefined }); }
        if (k === 'desc') form.setFieldsValue({ cargoDescription: undefined });
        if (k === 'note') form.setFieldsValue({ requirements: undefined });
    };
    const head = (label: string, k: ExtraKey, htmlFor?: string) => (
        <div className={s.labelRow} style={{ minHeight: 24 }}>
            <label htmlFor={htmlFor} className={s.label}>{label}</label>
            <button type="button" className={s.removeX} aria-label={`Убрать: ${label.toLowerCase()}`} onClick={() => remove(k)}>
                <X className="size-3.5" />
            </button>
        </div>
    );

    const links: { k: ExtraKey; label: string }[] = [
        { k: 'value', label: 'Объявленная стоимость' },
        { k: 'dims', label: 'Габариты' },
        { k: 'desc', label: 'Описание груза' },
        { k: 'note', label: 'Комментарий водителю' },
    ];
    const anyShown = Object.values(shown).some(Boolean);

    return (
        <>
            <div className="flex min-h-9 flex-wrap items-center gap-x-7 gap-y-2">
                <Switch checked={cargo.stackable === false} onChange={(on) => onCargo({ ...cargo, stackable: on ? false : undefined })}>
                    Не штабелировать
                </Switch>
                <Switch checked={!!cargo.adr} onChange={(on) => onCargo({ ...cargo, adr: on, adrClass: on ? cargo.adrClass : undefined })}>
                    Опасный груз (ДОПОГ)
                </Switch>
                {cargo.adr && (
                    <select
                        aria-label="Класс опасности"
                        className={s.smallSelect}
                        style={{ height: 36, minWidth: 240, borderRadius: 10 }}
                        value={cargo.adrClass ?? ''}
                        onChange={(e) => onCargo({ ...cargo, adrClass: e.target.value || undefined })}
                    >
                        <option value="">Класс опасности</option>
                        {ADR_CLASSES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                )}
            </div>

            {anyShown && (
                <div className="mt-3.5 grid gap-x-4 gap-y-3.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    {shown.value && (
                        <div className={s.field}>
                            {head('Объявленная стоимость', 'value', 'no-extra-value')}
                            <MoneyInput
                                id="no-extra-value"
                                addonAfter="₸"
                                value={cargo.cargoValue}
                                onChange={(v) => onCargo({ ...cargo, cargoValue: v == null || v === '' ? undefined : Number(v) })}
                                placeholder="Сумма"
                            />
                        </div>
                    )}
                    {shown.dims && (
                        <div className={s.field}>
                            {head('Габариты, м', 'dims')}
                            <div className="flex items-center gap-1.5">
                                <Form.Item name="cargoLength" noStyle>
                                    <InputNumber id="no-extra-dims" min={0} step={0.1} placeholder="Длина" aria-label="Длина, м" />
                                </Form.Item>
                                <span className={s.suffix}>×</span>
                                <Form.Item name="cargoWidth" noStyle>
                                    <InputNumber min={0} step={0.1} placeholder="Ширина" aria-label="Ширина, м" />
                                </Form.Item>
                                <span className={s.suffix}>×</span>
                                <Form.Item name="cargoHeight" noStyle>
                                    <InputNumber min={0} step={0.1} placeholder="Высота" aria-label="Высота, м" />
                                </Form.Item>
                            </div>
                        </div>
                    )}
                    {shown.desc && (
                        <div className={cn(s.field, 'col-span-2')}>
                            {head('Описание груза', 'desc', 'no-extra-desc')}
                            <Form.Item name="cargoDescription" noStyle>
                                <input id="no-extra-desc" className={s.box} placeholder="Например: консервы в банках" />
                            </Form.Item>
                        </div>
                    )}
                    {shown.note && (
                        <div className={cn(s.field, 'col-span-2')}>
                            {head('Комментарий водителю', 'note', 'no-extra-note')}
                            <Form.Item name="requirements" noStyle>
                                <textarea id="no-extra-note" rows={2} className={s.textarea} placeholder="Ремни, коники, въезд на склад…" />
                            </Form.Item>
                        </div>
                    )}
                </div>
            )}

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-0.5">
                {links.filter((l) => !shown[l.k]).map((l) => (
                    <button key={l.k} type="button" className={s.linkBtn} onClick={() => add(l.k)}>
                        <Plus className="size-3.5" />{l.label}
                    </button>
                ))}
            </div>
        </>
    );
}
