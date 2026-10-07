'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowRight, Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { BoardSlotContext } from '../DashboardCard';
import { BlockNote } from './blocks';
import { Delta, PALETTE } from './charts';
import { useBoardData } from './data';
import { TONE } from './frame';
import { isKpi, type KpiId, type WidgetId } from './layout';
import {
    BlockViewContext,
    DEFAULTS,
    FIELDS,
    OpenBlockContext,
    customTitle,
    hasSettings,
    settingsFor,
    useSettingsStore,
    type BlockDialogMode,
    type Field,
} from './settings';
import { useKpi, useMeta, widgetMeta } from './widgets';
import styles from './board.module.css';

/**
 * Окно блока (владелец, 08.10.2026): «Открыть крупно» — блок посередине
 * экрана, большой, фон за ним размыт; «Настройки» — то же окно с панелью
 * справа. Настройки применяются сразу, блок слева меняется на глазах.
 *
 * Окно одно на весь дашборд: блоки просят его открыться через
 * `useOpenBlock()`.
 */
export function BlockDialogHost({ renderBody, onBuy, children }: {
    renderBody: (id: WidgetId) => React.ReactNode;
    onBuy: () => void;
    children: React.ReactNode;
}) {
    const [state, setState] = useState<{ id: WidgetId; mode: BlockDialogMode; from: BlockDialogMode } | null>(null);
    const [open, setOpen] = useState(false);
    const content = useRef<HTMLDivElement>(null);
    const openBlock = useCallback((id: WidgetId, mode: BlockDialogMode) => {
        setState({ id, mode, from: mode });
        // Окно открывают и из меню «…»: даём меню сначала закрыться — иначе
        // меню и окно вместе «держат» страницу, и после закрытия окна клики
        // могут перестать доходить.
        window.setTimeout(() => setOpen(true), 0);
    }, []);

    return (
        <OpenBlockContext.Provider value={openBlock}>
            {children}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogPortal>
                    <DialogOverlay className={cn('bg-black/25', styles.overlay)} />
                    <DialogPrimitive.Content
                        ref={content}
                        tabIndex={-1}
                        data-block-dialog={state?.id}
                        className={cn(styles.dialog, 'fixed left-1/2 top-1/2 z-50 flex flex-col overflow-hidden rounded-2xl bg-card text-card-foreground outline-none')}
                        style={{ width: 'min(1240px, calc(100vw - 32px))', height: 'min(840px, calc(100svh - 32px))' }}
                        // Фокус — на само окно, а не на первую кнопку: иначе «Настройки»
                        // при открытии мышкой встречают жирной рамкой выделения.
                        onOpenAutoFocus={(e) => { e.preventDefault(); content.current?.focus(); }}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                        {state && (
                            <DialogInner
                                key={state.id}
                                id={state.id}
                                mode={state.mode}
                                setMode={(mode) => setState((s) => (s ? { ...s, mode } : s))}
                                // Пришли за настройками — «Готово» закрывает окно; смотрели крупно — прячет панель.
                                onDone={() => (state.from === 'settings' ? setOpen(false) : setState((s) => (s ? { ...s, mode: 'view' } : s)))}
                                onClose={() => setOpen(false)}
                                renderBody={renderBody}
                                onBuy={onBuy}
                            />
                        )}
                    </DialogPrimitive.Content>
                </DialogPortal>
            </Dialog>
        </OpenBlockContext.Provider>
    );
}

const EXPANDED = { expanded: true };

function DialogInner({ id, mode, setMode, onDone, onClose, renderBody, onBuy }: {
    id: WidgetId;
    mode: BlockDialogMode;
    setMode: (m: BlockDialogMode) => void;
    onDone: () => void;
    onClose: () => void;
    renderBody: (id: WidgetId) => React.ReactNode;
    onBuy: () => void;
}) {
    const router = useRouter();
    const meta = useMeta()(id);
    const Icon = meta.icon;
    // Переход из шапки старой карточки («Журнал счетов →») — в шапку окна.
    const [slotAction, setSlotAction] = useState<{ label: string; onClick: () => void } | null>(null);
    const slot = useRef({ setAction: setSlotAction }).current;
    const action = meta.action ? { label: meta.action.label, onClick: () => { onClose(); router.push(meta.action!.href); } } : slotAction;
    const withSettings = mode === 'settings';

    return (
        <>
            <div className="flex h-14 shrink-0 items-center gap-3 border-0 border-b border-solid border-border pl-4 pr-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                    <DialogTitle className="m-0 truncate text-[15px] font-semibold leading-tight tracking-normal">{meta.title}</DialogTitle>
                    <DialogDescription className="m-0 truncate text-xs">{meta.description}</DialogDescription>
                </div>
                {action && (
                    <Button variant="ghost" size="sm" className="hidden h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-normal sm:inline-flex" onClick={action.onClick}>
                        {action.label} <ArrowRight className="size-3.5" />
                    </Button>
                )}
                <Button
                    variant={withSettings ? 'secondary' : 'outline'}
                    size="sm"
                    aria-pressed={withSettings}
                    aria-label="Настройки"
                    className="h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-[13px] font-normal sm:px-3"
                    onClick={() => setMode(withSettings ? 'view' : 'settings')}
                >
                    <SlidersHorizontal className="size-4" /> <span className="hidden sm:inline">Настройки</span>
                </Button>
                <DialogPrimitive.Close asChild>
                    <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground" aria-label="Закрыть">
                        <X className="size-4" />
                    </Button>
                </DialogPrimitive.Close>
            </div>
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                <div className="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-auto" data-block-body>
                    <BlockViewContext.Provider value={EXPANDED}>
                        <BoardSlotContext.Provider value={slot}>
                            {isKpi(id) ? <KpiDetail id={id} onBuy={onBuy} /> : renderBody(id)}
                        </BoardSlotContext.Provider>
                    </BlockViewContext.Provider>
                </div>
                {withSettings && <SettingsPanel id={id} onDone={onDone} />}
            </div>
        </>
    );
}

/** Показатель крупно: число, рост к прошлому, пояснение и график во всю ширину. */
function KpiDetail({ id, onBuy }: { id: KpiId; onBuy: () => void }) {
    const k = useKpi(id, onBuy);
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
            <div>
                <div className="flex flex-wrap items-center gap-3">
                    <span className={cn('text-[26px] font-semibold leading-none tabular-nums tracking-tight', k.tone && TONE[k.tone])}>
                        {k.state === 'loading' ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted align-middle" /> : k.value}
                    </span>
                    {k.delta && <Delta text={k.delta.text} tone={k.delta.tone} />}
                    {k.action && <button type="button" className={styles.tileAction} onClick={k.action.onClick}>{k.action.label}</button>}
                </div>
                {k.hint && <p className="m-0 mt-2 text-[13px] text-muted-foreground">{k.hint}</p>}
            </div>
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-solid border-border p-4">
                {k.chart ? <div className="min-h-0 flex-1">{k.chart}</div> : <BlockNote>У этого показателя нет графика — только число</BlockNote>}
            </div>
        </div>
    );
}

// ==================== Панель настроек ====================

/** Отличаются ли настройки блока от исходных — тогда есть что сбрасывать. */
function isChanged(id: WidgetId, raw: Record<string, unknown> | undefined, all: Parameters<typeof customTitle>[0]) {
    if (customTitle(all, id)) return true;
    return hasSettings(id) && JSON.stringify(settingsFor(id, raw)) !== JSON.stringify(DEFAULTS[id]);
}

function SettingsPanel({ id, onDone }: { id: WidgetId; onDone: () => void }) {
    const { period } = useBoardData();
    const store = useSettingsStore();
    const raw = store.all[id];
    const values: Record<string, unknown> = hasSettings(id) ? settingsFor(id, raw) : {};
    const fields = hasSettings(id) ? FIELDS[id] : [];
    const base = widgetMeta(id, period).title;
    const set = (patch: Record<string, unknown>) => store.set(id, patch);
    const reset = () => {
        const before = store.all[id];
        store.replace(id, undefined);
        toast('Настройки блока сброшены', { action: { label: 'Вернуть', onClick: () => store.replace(id, before) } });
    };

    return (
        <aside
            aria-label="Настройки блока"
            data-settings-panel
            className="flex max-h-[55%] w-full shrink-0 flex-col border-0 border-t border-solid border-border bg-card md:max-h-none md:w-[320px] md:border-l md:border-t-0"
        >
            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
                <div className="grid gap-5">
                    <Section label="Название">
                        <Input
                            value={typeof raw?.title === 'string' ? raw.title : ''}
                            placeholder={base}
                            maxLength={60}
                            onChange={(e) => set({ title: e.target.value })}
                            className="h-8 rounded-lg text-[13px] md:text-[13px]"
                            aria-label="Своё название блока"
                        />
                        <p className="m-0 text-xs text-muted-foreground">Пусто — «{base}»</p>
                    </Section>
                    {fields.filter((f) => !f.when || f.when(values)).map((f) => (
                        <FieldControl key={f.key} field={f} value={values[f.key]} onChange={(v) => set({ [f.key]: v })} />
                    ))}
                    {!fields.length && (
                        <p className="m-0 text-xs text-muted-foreground">
                            Другого здесь не настроить: блок показывает то же, что раздел, из которого он пришёл.
                        </p>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-0 border-t border-solid border-border px-4 py-3">
                <Button variant="ghost" size="sm" disabled={!isChanged(id, raw, store.all)} onClick={reset} className="h-8 gap-1.5 rounded-lg px-2.5 text-[13px] font-normal">
                    <RotateCcw className="size-3.5" /> Как было
                </Button>
                <Button size="sm" onClick={onDone} className="h-8 rounded-lg px-4 text-[13px]">Готово</Button>
            </div>
        </aside>
    );
}

function Section({ label, aside, children }: { label: string; aside?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-2 text-xs font-medium text-muted-foreground">
                <span>{label}</span>
                {aside && <span className="font-normal">{aside}</span>}
            </div>
            {children}
        </div>
    );
}

/** Многоцветная «плашка» для варианта «По статусам». */
const STATUS_SWATCH = 'conic-gradient(#b45309 0 20%, #1d4ed8 0 40%, #0369a1 0 60%, #15803d 0 80%, #dc2626 0)';

function FieldControl({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
    if (field.kind === 'segment') {
        return (
            <Section label={field.label}>
                <div role="radiogroup" aria-label={field.label} className="flex w-full rounded-lg bg-muted p-0.5">
                    {field.options.map((o) => {
                        const on = value === o.value;
                        const Icon = o.icon;
                        return (
                            <button
                                key={o.value}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => onChange(o.value)}
                                className={cn(
                                    'inline-flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-[13px] [font-family:inherit] transition-colors',
                                    on ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {Icon && <Icon className="size-3.5 shrink-0" />}
                                <span className="truncate">{o.label}</span>
                            </button>
                        );
                    })}
                </div>
            </Section>
        );
    }
    if (field.kind === 'color') {
        const options = [
            ...(field.byStatus ? [{ key: 'status', label: 'По статусам', color: STATUS_SWATCH }] : []),
            ...PALETTE,
        ];
        const current = options.find((o) => o.key === value);
        return (
            <Section label={field.label} aside={current?.label}>
                <div role="radiogroup" aria-label={field.label} className="flex flex-wrap gap-2">
                    {options.map((o) => {
                        const on = value === o.key;
                        return (
                            <button
                                key={o.key}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                aria-label={o.label}
                                title={o.label}
                                onClick={() => onChange(o.key)}
                                className={cn(
                                    'grid size-6 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-card transition-shadow',
                                    on ? 'ring-2 ring-foreground' : 'hover:ring-2 hover:ring-border',
                                )}
                                style={{ background: o.color, boxShadow: 'inset 0 0 0 1px hsl(var(--foreground) / 0.12)' }}
                            >
                                {on && <Check className={cn('size-3', o.key === 'silver' ? 'text-foreground' : o.key === 'graphite' ? 'text-primary-foreground' : 'text-white')} strokeWidth={3} />}
                            </button>
                        );
                    })}
                </div>
            </Section>
        );
    }
    if (field.kind === 'checks') {
        const list = Array.isArray(value) ? (value as string[]) : [];
        return (
            <Section label={field.label}>
                <div className="grid gap-2">
                    {field.options.map((o) => {
                        const on = list.includes(o.value);
                        // Последнее нужное не снять: пустой блок ничего не скажет.
                        const locked = on && list.length <= field.min;
                        return (
                            <label key={o.value} className={cn('flex cursor-pointer items-center gap-2.5 text-[13px]', locked && 'cursor-not-allowed')} title={locked ? 'Хотя бы одно должно остаться' : undefined}>
                                <Checkbox
                                    checked={on}
                                    disabled={locked}
                                    onCheckedChange={(c) => onChange(field.options.map((x) => x.value).filter((x) => (x === o.value ? c === true : list.includes(x))))}
                                />
                                {o.label}
                            </label>
                        );
                    })}
                </div>
            </Section>
        );
    }
    return (
        <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox className="mt-0.5" checked={value === true} onCheckedChange={(c) => onChange(c === true)} />
            <span className="grid gap-0.5">
                <span className="text-[13px]">{field.label}</span>
                {field.hint && <span className="text-xs text-muted-foreground">{field.hint}</span>}
            </span>
        </label>
    );
}
