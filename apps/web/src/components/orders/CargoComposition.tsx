'use client';

import { Plus, X } from 'lucide-react';
import {
    ADR_CLASSES,
    LOADING_TYPES,
    PACKAGING_TYPES,
    PALLET_KINDS,
    type CargoState,
    type PalletLine,
    totalPallets,
} from '@/lib/cargo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Состав груза: паллеты, способ погрузки и упаковка.
 *
 * Паллеты — списком, а не одним числом: в рейсе бывает вперемешку, скажем
 * пять европаллет и десять финских, и водителю с логистом важно именно это.
 * Общее количество мест считается само — на него опираются карточка рейса,
 * кабинет водителя и печатные формы.
 */
export function CargoComposition({
    value,
    onChange,
}: {
    value: CargoState;
    onChange: (next: CargoState) => void;
}) {
    const { pallets, loadingTypes, packagingTypes } = value;

    const patch = (part: Partial<CargoState>) => onChange({ ...value, ...part });

    /** Пустое поле — это «не указано», а не ноль: ноль градусов и «без режима» разное. */
    const num = (raw: string) => (raw.trim() === '' ? undefined : Number(raw));

    const toggle = (list: string[], key: string) =>
        list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

    const setLine = (index: number, part: Partial<PalletLine>) => {
        const next = [...pallets];
        next[index] = { ...next[index], ...part };
        // У стандартных размеры известны — подставляем, чтобы не вводить руками.
        if (part.kind) {
            const preset = PALLET_KINDS.find((k) => k.key === part.kind);
            next[index].length = preset?.length;
            next[index].width = preset?.width;
        }
        patch({ pallets: next });
    };

    const total = totalPallets(pallets);

    return (
        <div className="flex flex-col gap-5">
            <section>
                <div className="mb-1.5 flex items-baseline justify-between">
                    <div className="text-[13px] font-semibold text-foreground">Паллеты и места</div>
                    {total > 0 && (
                        <div className="text-xs text-muted-foreground">
                            всего мест: <b className="text-foreground tabular-nums">{total}</b>
                        </div>
                    )}
                </div>

                {pallets.length === 0 && (
                    <div className="mb-2 text-xs text-muted-foreground">
                        Груз на паллетах? Добавьте строку — можно указать несколько видов сразу.
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    {pallets.map((line, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                            <select
                                value={line.kind}
                                onChange={(e) => setLine(i, { kind: e.target.value })}
                                className={cn(
                                    'h-9 min-w-[200px] flex-1 rounded-lg border border-border bg-card px-2.5 text-[13px]',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                )}
                            >
                                {PALLET_KINDS.map((k) => (
                                    <option key={k.key} value={k.key}>{k.label}</option>
                                ))}
                            </select>

                            {line.kind === 'CUSTOM' && (
                                <div className="flex items-center gap-1">
                                    <Input
                                        type="number"
                                        inputMode="numeric"
                                        placeholder="длина"
                                        value={line.length ?? ''}
                                        onChange={(e) => setLine(i, { length: Number(e.target.value) || undefined })}
                                        className="h-9 w-20 text-[13px]"
                                    />
                                    <span className="text-muted-foreground">×</span>
                                    <Input
                                        type="number"
                                        inputMode="numeric"
                                        placeholder="ширина"
                                        value={line.width ?? ''}
                                        onChange={(e) => setLine(i, { width: Number(e.target.value) || undefined })}
                                        className="h-9 w-20 text-[13px]"
                                    />
                                    <span className="text-xs text-muted-foreground">см</span>
                                </div>
                            )}

                            <div className="flex items-center gap-1">
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    value={line.count || ''}
                                    onChange={(e) => setLine(i, { count: Number(e.target.value) || 0 })}
                                    className="h-9 w-20 text-[13px]"
                                    placeholder="кол-во"
                                />
                                <span className="text-xs text-muted-foreground">шт</span>
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Убрать строку"
                                onClick={() => patch({ pallets: pallets.filter((_, idx) => idx !== i) })}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => patch({ pallets: [...pallets, { kind: 'EUR', count: 0, length: 120, width: 80 }] })}
                >
                    <Plus className="h-3.5 w-3.5" /> Добавить вид паллет
                </Button>
            </section>

            <section>
                <div className="mb-1.5 text-[13px] font-semibold text-foreground">Способ погрузки</div>
                <div className="flex flex-wrap gap-1.5">
                    {LOADING_TYPES.map((t) => {
                        const active = loadingTypes.includes(t.key);
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => patch({ loadingTypes: toggle(loadingTypes, t.key) })}
                                className={cn(
                                    'rounded-full px-3 py-1.5 text-[13px] font-medium leading-none transition-colors',
                                    active
                                        ? 'bg-foreground text-background'
                                        : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
                                )}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                    Можно отметить несколько — например заднюю и боковую.
                </div>
            </section>

            <section>
                <div className="mb-1.5 text-[13px] font-semibold text-foreground">Упаковка</div>
                <div className="flex flex-wrap gap-1.5">
                    {PACKAGING_TYPES.map((t) => {
                        const active = packagingTypes.includes(t.key);
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => patch({ packagingTypes: toggle(packagingTypes, t.key) })}
                                className={cn(
                                    'rounded-full px-3 py-1.5 text-[13px] font-medium leading-none transition-colors',
                                    active
                                        ? 'bg-foreground text-background'
                                        : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
                                )}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Условия перевозки. Без них перевозчик не может назвать цену:
                рефрижератор, допуск на опасный груз и страховка — это разные
                деньги. Раньше всё это писали словами в «дополнительной
                информации», и на тендере оно терялось. */}
            <section>
                <div className="mb-1.5 text-[13px] font-semibold text-foreground">Условия перевозки</div>

                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-muted-foreground">Грузовых мест</span>
                        <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={value.placesCount ?? ''}
                            onChange={(e) => patch({ placesCount: num(e.target.value) })}
                            className="h-9 w-28 text-[13px]"
                            placeholder="0"
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-muted-foreground">Температура, °C</span>
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                inputMode="numeric"
                                value={value.tempMin ?? ''}
                                onChange={(e) => patch({ tempMin: num(e.target.value) })}
                                className="h-9 w-20 text-[13px]"
                                placeholder="от"
                            />
                            <span className="text-muted-foreground">…</span>
                            <Input
                                type="number"
                                inputMode="numeric"
                                value={value.tempMax ?? ''}
                                onChange={(e) => patch({ tempMax: num(e.target.value) })}
                                className="h-9 w-20 text-[13px]"
                                placeholder="до"
                            />
                        </div>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-muted-foreground">Объявленная стоимость, ₸</span>
                        <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={value.cargoValue ?? ''}
                            onChange={(e) => patch({ cargoValue: num(e.target.value) })}
                            className="h-9 w-40 text-[13px]"
                            placeholder="0"
                        />
                    </label>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {/* Две отдельные кнопки, а не одна галка. «Не штабелируется» —
                        это не отсутствие ответа, а важное условие: такой груз
                        считают по полу кузова, и влезает его вдвое меньше.
                        Повторное нажатие снимает ответ вовсе. */}
                    <button
                        type="button"
                        onClick={() => patch({ stackable: value.stackable === true ? undefined : true })}
                        className={cn(
                            'rounded-full px-3 py-1.5 text-[13px] font-medium leading-none transition-colors',
                            value.stackable === true
                                ? 'bg-foreground text-background'
                                : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
                        )}
                    >
                        Штабелируется
                    </button>
                    <button
                        type="button"
                        onClick={() => patch({ stackable: value.stackable === false ? undefined : false })}
                        className={cn(
                            'rounded-full px-3 py-1.5 text-[13px] font-medium leading-none transition-colors',
                            value.stackable === false
                                ? 'bg-foreground text-background'
                                : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
                        )}
                    >
                        Не штабелируется
                    </button>
                    <button
                        type="button"
                        onClick={() => patch(value.adr ? { adr: undefined, adrClass: undefined } : { adr: true })}
                        className={cn(
                            'rounded-full px-3 py-1.5 text-[13px] font-medium leading-none transition-colors',
                            value.adr
                                ? 'bg-foreground text-background'
                                : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
                        )}
                    >
                        Опасный груз (ДОПОГ)
                    </button>

                    {value.adr && (
                        <select
                            value={value.adrClass ?? ''}
                            onChange={(e) => patch({ adrClass: e.target.value || undefined })}
                            className={cn(
                                'h-9 min-w-[260px] rounded-lg border border-border bg-card px-2.5 text-[13px]',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            )}
                        >
                            <option value="">Класс не указан</option>
                            {ADR_CLASSES.map((c) => (
                                <option key={c.key} value={c.key}>{c.label}</option>
                            ))}
                        </select>
                    )}
                </div>
            </section>
        </div>
    );
}
