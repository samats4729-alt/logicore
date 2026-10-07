'use client';

import { useId } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    LabelList,
    Line,
    Pie,
    PieChart,
    ReferenceDot,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

/**
 * Графики дашборда — по коду макета «shadcn Nova».
 *
 * Цвет у графика свой на каждый показатель (как в макете): это единственное
 * место кабинета, где цвет не значит «приход/расход», а просто различает
 * линии. В остальном тема чёрно-белая.
 */
export const CHART_COLORS = {
    sky: '#0ea5e9',
    emerald: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
    violet: '#8b5cf6',
    slate: '#64748b',
} as const;

/**
 * Цвета, из которых выбирают в настройках блока. Первые два — цвета темы
 * (в тёмной теме они сами светлеют), остальные — из макета.
 */
export const PALETTE = [
    { key: 'graphite', label: 'Графит', color: 'hsl(var(--primary))' },
    { key: 'silver', label: 'Серебристый', color: 'hsl(var(--chart-1))' },
    { key: 'sky', label: 'Голубой', color: CHART_COLORS.sky },
    { key: 'emerald', label: 'Зелёный', color: CHART_COLORS.emerald },
    { key: 'violet', label: 'Фиолетовый', color: CHART_COLORS.violet },
    { key: 'amber', label: 'Янтарный', color: CHART_COLORS.amber },
    { key: 'red', label: 'Красный', color: CHART_COLORS.red },
    { key: 'slate', label: 'Сланцевый', color: CHART_COLORS.slate },
] as const;
export type ColorKey = (typeof PALETTE)[number]['key'];
export const colorOf = (key: string) => (PALETTE.find((p) => p.key === key) ?? PALETTE[0]).color;

const fmtInt = (n: number) => Math.round(n).toLocaleString('ru-RU');

/** Подсказка при наведении на точку графика — в общем виде всплывающих панелей. */
function TipBox({ active, payload, label, format, labels }: {
    active?: boolean;
    payload?: any[];
    label?: React.ReactNode;
    format?: (v: number) => string;
    labels?: Record<string, string>;
}) {
    if (!active || !payload?.length) return null;
    return (
        <div className="grid min-w-32 gap-1 rounded-lg border border-solid border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
            {label != null && label !== '' && <div className="font-medium">{label}</div>}
            {payload.map((p) => (
                <div key={String(p.dataKey)} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                        <i className="size-2 rounded-[2px]" style={{ background: p.color || p.fill || p.stroke }} />
                        {labels?.[String(p.dataKey)] ?? p.name}
                    </span>
                    <span className="font-medium tabular-nums">{format ? format(Number(p.value)) : fmtInt(Number(p.value))}</span>
                </div>
            ))}
        </div>
    );
}

/** Рост или падение к прошлому периоду: зелёным — хорошо, красным — плохо, серым — само по себе. */
export function Delta({ text, tone }: { text: string; tone: 'good' | 'bad' | 'flat' }) {
    const Icon = tone === 'flat' ? Minus : tone === 'good' ? ArrowUpRight : ArrowDownRight;
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums',
                tone === 'good' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                tone === 'bad' && 'bg-red-500/10 text-red-700 dark:text-red-400',
                tone === 'flat' && 'bg-muted text-muted-foreground',
            )}
        >
            <Icon className="size-3" />
            {text}
        </span>
    );
}

/** Линия с заливкой; пунктиром — прошлый период для сравнения. */
export function AreaSpark({ data, prev, color, mini, label, prevLabel, format }: {
    data: number[];
    prev?: number[];
    color: string;
    mini?: boolean;
    label?: string;
    prevLabel?: string;
    format?: (v: number) => string;
}) {
    const gid = useId().replace(/:/g, '');
    if (!data.length) return null;
    const rows = data.map((v, i) => ({ i, v, p: prev?.[i] }));
    const all = [...data, ...(prev ?? [])];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min || 1) * 0.18;
    const last = rows[rows.length - 1];
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={mini ? { top: 3, right: 3, bottom: 3, left: 3 } : { top: 10, right: 10, bottom: 2, left: 10 }}>
                <defs>
                    <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                {!mini && <CartesianGrid vertical={false} strokeDasharray="3 4" strokeOpacity={0.6} />}
                <XAxis dataKey="i" hide />
                <YAxis hide domain={[min - pad, max + pad]} />
                {!mini && (
                    <Tooltip
                        cursor={{ stroke: color, strokeOpacity: 0.3 }}
                        content={<TipBox format={format} labels={{ v: label ?? 'Значение', p: prevLabel ?? 'Прошлый период' }} />}
                    />
                )}
                {prev && (
                    <Line dataKey="p" type="monotone" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.7} strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                )}
                <Area dataKey="v" type="monotone" stroke={color} strokeWidth={2} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
                <ReferenceDot x={last.i} y={last.v} r={mini ? 2.5 : 4} fill={color} stroke="hsl(var(--card))" strokeWidth={2} />
            </AreaChart>
        </ResponsiveContainer>
    );
}

/** Столбики по дням; последний (сегодня) — плотнее. */
export function BarSpark({ data, color, mini, label }: { data: number[]; color: string; mini?: boolean; label?: string }) {
    if (!data.length) return null;
    const rows = data.map((v, i) => ({ i, v }));
    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={mini ? { top: 2, right: 2, bottom: 2, left: 2 } : { top: 10, right: 10, bottom: 2, left: 10 }} barCategoryGap={mini ? '12%' : '22%'}>
                {!mini && <CartesianGrid vertical={false} strokeDasharray="3 4" strokeOpacity={0.6} />}
                <XAxis dataKey="i" hide />
                <YAxis hide domain={[0, Math.max(...data, 1) * 1.15]} />
                {!mini && <Tooltip cursor={false} content={<TipBox labels={{ v: label ?? 'Значение' }} />} />}
                <Bar dataKey="v" radius={mini ? 1.5 : 3} isAnimationActive={false}>
                    {rows.map((r) => <Cell key={r.i} fill={color} fillOpacity={r.i === rows.length - 1 ? 1 : 0.35} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

/** Полоса из частей с подписями: из чего складывается число. */
export function Parts({ parts, legend = true }: { parts: { label: string; value: number; color: string; text?: string }[]; legend?: boolean }) {
    const total = parts.reduce((s, p) => s + p.value, 0) || 1;
    return (
        <div className="flex flex-col gap-2">
            <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-muted">
                {parts.filter((p) => p.value > 0).map((p) => (
                    <div
                        key={p.label}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }}
                        title={`${p.label}: ${p.text ?? p.value}`}
                    />
                ))}
            </div>
            {legend && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {parts.map((p) => (
                        <div key={p.label} className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="size-2 shrink-0 rounded-[3px]" style={{ backgroundColor: p.color }} />
                            <span className="truncate">{p.label}</span>
                            <span className="font-medium tabular-nums text-foreground">{p.text ?? p.value}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Шкала дней: сколько осталось из оплаченного срока. */
export function DaysLeft({ left, total, color }: { left: number; total: number; color: string }) {
    const n = Math.max(1, Math.min(total, 62));
    return (
        <div className="flex h-full min-h-6 flex-col justify-end gap-2">
            <div className="grid min-h-0 flex-1 auto-cols-fr grid-flow-col items-stretch gap-[3px]" style={{ maxHeight: 56 }}>
                {Array.from({ length: n }, (_, i) => (
                    <div key={i} className="rounded-[3px]" style={{ backgroundColor: i < left ? color : 'hsl(var(--muted))' }} />
                ))}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>сегодня</span>
                <span>{left} из {total} дней</span>
            </div>
        </div>
    );
}

const mln = (v: number) => (v / 1_000_000).toFixed(1).replace('.', ',');
const REVENUE_NAMES = { revenue: 'Выручка', margin: 'Маржа' } as const;

/**
 * Выручка и маржа по неделям — столбцами, линиями или областями, в цветах
 * из настроек блока. Суммы над столбцами — по желанию, в миллионах.
 */
export function RevenueChart({ data, kind, series, colors, values }: {
    data: { label: string; revenue: number; margin: number }[];
    kind: 'bars' | 'lines' | 'areas';
    series: ('revenue' | 'margin')[];
    colors: Record<'revenue' | 'margin', string>;
    values: boolean;
}) {
    const gid = useId().replace(/:/g, '');
    const labels = (k: string) => values && (
        <LabelList
            dataKey={k}
            position="top"
            offset={6}
            fontSize={10}
            fill="hsl(var(--muted-foreground))"
            formatter={(v) => (Number(v) ? mln(Number(v)) : '')}
        />
    );
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: 0, right: 8, top: values ? 20 : 8 }} barGap={2}>
                <defs>
                    {series.map((k) => (
                        <linearGradient key={k} id={`${gid}-${k}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={colors[k]} stopOpacity={0.32} />
                            <stop offset="100%" stopColor={colors[k]} stopOpacity={0.02} />
                        </linearGradient>
                    ))}
                </defs>
                <CartesianGrid vertical={false} strokeOpacity={0.6} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} tickFormatter={(v) => mln(Number(v))} />
                <Tooltip
                    cursor={kind === 'bars' ? { fill: 'hsl(var(--muted))', fillOpacity: 0.6 } : { stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.3 }}
                    content={<TipBox format={(v) => `${fmtInt(v)} ₸`} labels={REVENUE_NAMES} />}
                />
                {series.map((k) => (kind === 'bars' ? (
                    <Bar key={k} dataKey={k} fill={colors[k]} radius={[3, 3, 0, 0]} isAnimationActive={false}>{labels(k)}</Bar>
                ) : kind === 'lines' ? (
                    <Line
                        key={k}
                        dataKey={k}
                        type="monotone"
                        stroke={colors[k]}
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: colors[k], strokeWidth: 0 }}
                        activeDot={{ r: 4, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                        isAnimationActive={false}
                    >
                        {labels(k)}
                    </Line>
                ) : (
                    <Area key={k} dataKey={k} type="monotone" stroke={colors[k]} strokeWidth={2} fill={`url(#${gid}-${k})`} isAnimationActive={false}>
                        {labels(k)}
                    </Area>
                )))}
            </ComposedChart>
        </ResponsiveContainer>
    );
}

/**
 * Заявки по этапам — полосами, столбцами или кольцом. `fills` — цвет
 * каждого этапа (один на всех или свой у каждого статуса).
 */
export function StatusChart({ data, kind, fills }: {
    data: { key: string; s: string; n: number }[];
    kind: 'hbars' | 'vbars' | 'donut';
    fills: { color: string; opacity: number }[];
}) {
    const cells = data.map((r, i) => <Cell key={r.key} fill={fills[i].color} fillOpacity={fills[i].opacity} />);
    if (kind === 'donut') {
        const total = data.reduce((s, r) => s + r.n, 0);
        return (
            <div className="flex h-full min-h-0 items-center gap-4">
                <div className="relative h-full min-h-0 min-w-0 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Tooltip content={<TipBox />} />
                            <Pie data={data} dataKey="n" nameKey="s" innerRadius="58%" outerRadius="90%" paddingAngle={1.5} stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>
                                {cells}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                        <div>
                            <div className="text-lg font-semibold tabular-nums">{total}</div>
                            <div className="text-[11px] text-muted-foreground">всего</div>
                        </div>
                    </div>
                </div>
                <ul className="m-0 hidden shrink-0 list-none gap-1.5 p-0 text-xs @md:grid">
                    {data.map((r, i) => (
                        <li key={r.key} className="flex items-center gap-2">
                            <span className="size-2 shrink-0 rounded-[3px]" style={{ background: fills[i].color, opacity: fills[i].opacity }} />
                            <span className="text-muted-foreground">{r.s}</span>
                            <span className="ml-auto pl-3 font-medium tabular-nums">{r.n}</span>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }
    if (kind === 'vbars') {
        return (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap="24%">
                    <CartesianGrid vertical={false} strokeOpacity={0.6} />
                    <XAxis dataKey="s" tickLine={false} axisLine={false} interval={0} fontSize={10} angle={-30} textAnchor="end" height={64} />
                    <YAxis tickLine={false} axisLine={false} width={28} fontSize={11} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.6 }} content={<TipBox labels={{ n: 'Заявок' }} />} />
                    <Bar dataKey="n" radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false}>{cells}</Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    }
    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap="28%">
                <CartesianGrid horizontal={false} strokeOpacity={0.6} />
                <YAxis dataKey="s" type="category" tickLine={false} axisLine={false} width={120} fontSize={11} interval={0} />
                <XAxis type="number" hide allowDecimals={false} />
                <Tooltip cursor={false} content={<TipBox labels={{ n: 'Заявок' }} />} />
                <Bar dataKey="n" radius={3} maxBarSize={14} isAnimationActive={false}>{cells}</Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
