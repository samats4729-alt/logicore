'use client';

import { Plus, X } from 'lucide-react';
import {
    LOADING_TYPES,
    PACKAGING_TYPES,
    PALLET_KINDS,
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
    pallets,
    loadingTypes,
    packagingTypes,
    onChange,
}: {
    pallets: PalletLine[];
    loadingTypes: string[];
    packagingTypes: string[];
    onChange: (next: {
        pallets: PalletLine[];
        loadingTypes: string[];
        packagingTypes: string[];
    }) => void;
}) {
    const patch = (part: Partial<{ pallets: PalletLine[]; loadingTypes: string[]; packagingTypes: string[] }>) =>
        onChange({ pallets, loadingTypes, packagingTypes, ...part });

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
        </div>
    );
}
