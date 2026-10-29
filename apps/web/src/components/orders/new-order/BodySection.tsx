'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Snowflake, Thermometer, X } from 'lucide-react';
import { VEHICLE_TYPES } from '@/lib/constants';
import type { CargoState } from '@/lib/cargo';
import { cn } from '@/lib/utils';
import { Switch, Tile } from './ui';
import s from './new-order.module.css';

/** Частые кузова — плитками с силуэтом; остальные — в «Все кузова». */
const FREQUENT = ['тент', 'рефрижератор', 'изотерм', 'бортовая'] as const;
const ALL = VEHICLE_TYPES.filter((t) => t !== 'не указан' && !(FREQUENT as readonly string[]).includes(t))
    .slice()
    .sort((a, b) => a.localeCompare(b, 'ru'));
const COUNT = FREQUENT.length + ALL.length;

const заглавная = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const видов = (n: number) => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return `${n} вид`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} вида`;
    return `${n} видов`;
};

/** Температурные режимы (ТЗ, §5.5). */
const PRESETS = [
    { label: 'Заморозка', min: -20, max: -18 },
    { label: 'Охлаждение', min: 2, max: 6 },
    { label: 'Прохлада', min: 8, max: 15 },
];
const T_LOW = -25;
const T_SPAN = 50;
const pos = (t: number) => (t - T_LOW) / T_SPAN;
/** +2, 0, −18 — минус настоящий (U+2212), как в макете. */
export const fmtT = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** Схемы загрузки: какая грань кузова подсвечена (ТЗ, §5.5). */
const LOADING = [
    { key: 'REAR', label: 'Задняя', faces: ['end'] },
    { key: 'SIDE', label: 'Боковая', faces: ['side'] },
    { key: 'TOP', label: 'Верхняя', faces: ['top'] },
    { key: 'FULL', label: 'Полная растентовка', faces: ['top', 'side', 'end'] },
] as const;
/** Гидроборт и аппарели — оснащение, а не способ загрузки; хранятся там же, где хранились. */
const EQUIPMENT = [
    { key: 'TAIL_LIFT', label: 'Гидроборт' },
    { key: 'RAMP', label: 'Аппарели' },
] as const;

function Truck({ kind }: { kind: 'тент' | 'рефрижератор' | 'изотерм' | 'бортовая' | 'any' }) {
    const cab = (
        <>
            <path d="M34 24V11h6l5 6v7" />
            <path d="M37 13h2.5l3 4H37z" />
            <path d="M3 24h5M14 24h22M42 24h3" />
            <circle cx="11" cy="25" r="3" />
            <circle cx="39" cy="25" r="3" />
        </>
    );
    return (
        <svg className={s.svgI} width="48" height="32" viewBox="0 0 48 32" aria-hidden>
            {kind === 'тент' && (
                <>
                    <path d="M3 22V12a4 4 0 0 1 4-4h21a4 4 0 0 1 4 4v10z" />
                    <path d="M11 9v12M17.5 8.5v13M24 9v12" strokeDasharray="2 2.5" />
                </>
            )}
            {kind === 'рефрижератор' && (
                <>
                    <rect x="3" y="7" width="29" height="15" rx="1.5" />
                    <path d="M17.5 10v9M13.6 12.25l7.8 4.5M13.6 16.75l7.8-4.5" />
                </>
            )}
            {kind === 'изотерм' && (
                <>
                    <rect x="3" y="7" width="29" height="15" rx="1.5" />
                    <path d="M18.6 9.8v5.8a2.2 2.2 0 1 1-2.2 0V9.8a1.1 1.1 0 0 1 2.2 0z" />
                </>
            )}
            {kind === 'бортовая' && (
                <>
                    <path d="M3 22v-7h29v7z" />
                    <path d="M10 15v7M17.5 15v7M25 15v7" />
                </>
            )}
            {kind === 'any' && <rect x="3" y="7" width="29" height="15" rx="2" strokeDasharray="3 2.5" />}
            {cab}
        </svg>
    );
}

function LoadingIcon({ faces }: { faces: readonly string[] }) {
    const op = (f: string) => (faces.includes(f) ? 0.3 : 0);
    return (
        <svg className={s.svgI} width="40" height="30" viewBox="0 0 40 30" aria-hidden>
            <path d="M3 11L14 5L37 10L26 16Z" fill="currentColor" fillOpacity={op('top')} stroke="none" />
            <path d="M3 11L26 16V27L3 22Z" fill="currentColor" fillOpacity={op('side')} stroke="none" />
            <path d="M26 16L37 10V21L26 27Z" fill="currentColor" fillOpacity={op('end')} stroke="none" />
            <path d="M3 11L14 5L37 10L26 16Z" />
            <path d="M3 11V22L26 27V16" />
            <path d="M26 27L37 21V10" />
        </svg>
    );
}

/**
 * «Кузов и загрузка» (ТЗ, §5.5): тип кузова — ровно один, плитками и
 * полным списком; температура — у рефрижератора и изотерма; загрузка —
 * несколько; оснащение — переключателями. Тип кузова — то же поле заявки,
 * что и раньше (`cargoType`), остальное — состав груза (`CargoState`).
 */
export function BodySection({ bodyType, onBodyType, cargo, onCargo }: {
    bodyType?: string;
    onBodyType: (value: string | undefined) => void;
    cargo: CargoState;
    onCargo: (next: CargoState) => void;
}) {
    const [popOpen, setPopOpen] = useState(false);
    const [query, setQuery] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);
    const wrapRef = useRef<HTMLFieldSetElement>(null);

    const type = bodyType || undefined;
    const fromAll = !!type && !(FREQUENT as readonly string[]).includes(type);
    const isRef = type === 'рефрижератор';
    const isIso = type === 'изотерм';
    const showTemp = isRef || isIso;

    const choose = (value: string | undefined) => {
        onBodyType(value);
        // Реф и изотерм без режима — сразу «охлаждение», как в макете.
        if ((value === 'рефрижератор' || value === 'изотерм') && cargo.tempMin == null && cargo.tempMax == null) {
            onCargo({ ...cargo, tempMin: 2, tempMax: 6 });
        }
    };

    useEffect(() => { if (popOpen) { setQuery(''); requestAnimationFrame(() => searchRef.current?.focus()); } }, [popOpen]);
    useEffect(() => {
        if (!popOpen) return;
        const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPopOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [popOpen]);

    const q = query.trim().toLowerCase();
    const freq = useMemo(() => FREQUENT.filter((t) => !q || t.includes(q)), [q]);
    const all = useMemo(() => ALL.filter((t) => !q || t.toLowerCase().includes(q)), [q]);
    const pickFromPop = (t: string) => { choose(t); setPopOpen(false); };

    const tMin = cargo.tempMin ?? 2;
    const tMax = cargo.tempMax ?? 6;
    const preset = PRESETS.find((p) => p.min === tMin && p.max === tMax);
    const setTemp = (min: number, max: number) => onCargo({ ...cargo, tempMin: min, tempMax: max });

    const loading = cargo.loadingTypes || [];
    const toggleLoading = (key: string) => onCargo({
        ...cargo,
        loadingTypes: loading.includes(key) ? loading.filter((k) => k !== key) : [...loading, key],
    });

    return (
        <>
            <fieldset className="m-0 min-w-0 border-0 p-0" style={{ position: 'relative' }} ref={wrapRef}>
                <legend className={s.label} style={{ padding: 0, marginBottom: 8 }}>Тип кузова</legend>
                <div className={s.tiles6} data-guide="wizard-body-type">
                    {FREQUENT.map((t) => (
                        <Tile key={t} on={type === t} onClick={() => choose(t)} icon={<Truck kind={t} />} label={заглавная(t)} />
                    ))}
                    <Tile on={!type} onClick={() => choose(undefined)} icon={<Truck kind="any" />} label="Любой" />
                    <Tile
                        on={fromAll}
                        expanded={popOpen}
                        onClick={() => setPopOpen((o) => !o)}
                        icon={(
                            <svg className={s.svgI} width="26" height="26" viewBox="0 0 24 24" aria-hidden>
                                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                            </svg>
                        )}
                        label={fromAll && type ? заглавная(type) : 'Все кузова'}
                        sub={fromAll ? 'сменить' : видов(COUNT)}
                    />
                </div>

                {popOpen && (
                    <div className={s.bodyPop} role="dialog" aria-label="Все типы кузова">
                        <div className={s.bodyPopHead}>
                            <Search className={cn('size-[18px]', s.boxIcon)} aria-hidden />
                            <input
                                ref={searchRef}
                                className={s.bodyPopSearch}
                                aria-label="Найти тип кузова"
                                placeholder="Найти: трал, цистерна, самосвал…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPopOpen(false); }
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const first = freq[0] ?? all[0];
                                        if (first) pickFromPop(first);
                                    }
                                }}
                            />
                            <span className={s.tileSub}>{видов(freq.length + all.length)}</span>
                            <button type="button" className={s.iconBtn} aria-label="Закрыть список кузовов" onClick={() => setPopOpen(false)}>
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className={s.bodyPopList} role="radiogroup" aria-label="Тип кузова">
                            {freq.length > 0 && (
                                <>
                                    <div className={s.micro} style={{ padding: '0 0 8px' }}>Частые</div>
                                    <div className={s.freqRow}>
                                        {freq.map((t) => (
                                            <button key={t} type="button" role="radio" aria-checked={type === t} className={cn(s.radioOpt, type === t && s.radioOptOn)} onClick={() => pickFromPop(t)}>
                                                <span className={s.radioDot} />{заглавная(t)}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                            {all.length > 0 && (
                                <>
                                    <div className={s.micro} style={{ padding: '0 0 8px' }}>{q ? 'Найдено' : 'Все кузова'}</div>
                                    <div className={s.cols3}>
                                        {all.map((t) => (
                                            <button key={t} type="button" role="radio" aria-checked={type === t} className={cn(s.radioOpt, type === t && s.radioOptOn)} onClick={() => pickFromPop(t)}>
                                                <span className={s.radioDot} /><span style={{ minWidth: 0 }}>{заглавная(t)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                            {!freq.length && !all.length && (
                                <p className={s.screenText} style={{ margin: '18px 0', textAlign: 'center' }}>По запросу «{query.trim()}» ничего нет</p>
                            )}
                        </div>
                        <div className={s.bodyPopFoot}>Клик по виду — выбрать и закрыть · Enter — первый найденный · Esc — закрыть</div>
                    </div>
                )}

                {showTemp && (
                    <div className={s.temp}>
                        <div className={s.tempTop}>
                            <span className={s.tempIcon}>{isRef ? <Snowflake className="size-5" /> : <Thermometer className="size-5" />}</span>
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className={s.tempCap}>Температура в кузове · {preset ? preset.label.toLowerCase() : 'свой режим'}</span>
                                <span className={s.tempRead}>
                                    {fmtT(tMin)}<span className={s.tempDots}>…</span>{fmtT(tMax)}<span className={s.tempUnit}>°C</span>
                                </span>
                            </div>
                            <span className={s.spacer} />
                            <div className={s.tempPresets} role="group" aria-label="Режим">
                                {PRESETS.map((p) => {
                                    const on = preset === p;
                                    return (
                                        <button key={p.label} type="button" aria-pressed={on} className={cn(s.tempPreset, on && s.tempPresetOn)} onClick={() => setTemp(p.min, p.max)}>
                                            <span className={s.tempPresetName}>{p.label}</span>
                                            <span className={s.tempPresetRange}>{fmtT(p.min)}…{fmtT(p.max)} °C</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className={s.tempScale}>
                            <span className={s.tempTrack} aria-hidden />
                            <span className={s.tempMask} aria-hidden style={{ left: 11, width: `calc(${pos(tMin)} * (100% - 22px))`, borderRadius: '4px 0 0 4px' }} />
                            <span className={s.tempMask} aria-hidden style={{ right: 11, width: `calc(${1 - pos(tMax)} * (100% - 22px))`, borderRadius: '0 4px 4px 0' }} />
                            <span className={s.tempZero} aria-hidden />
                            <input
                                type="range"
                                className={s.range}
                                min={T_LOW}
                                max={T_LOW + T_SPAN}
                                step={1}
                                value={tMin}
                                aria-label="Температура от, °C"
                                aria-valuetext={`${fmtT(tMin)} °C`}
                                style={{ zIndex: tMin === tMax && tMin > 0 ? 3 : 1 }}
                                onChange={(e) => setTemp(Math.min(Number(e.target.value), tMax), tMax)}
                            />
                            <input
                                type="range"
                                className={s.range}
                                min={T_LOW}
                                max={T_LOW + T_SPAN}
                                step={1}
                                value={tMax}
                                aria-label="Температура до, °C"
                                aria-valuetext={`${fmtT(tMax)} °C`}
                                style={{ zIndex: 2 }}
                                onChange={(e) => setTemp(tMin, Math.max(Number(e.target.value), tMin))}
                            />
                        </div>
                        <div className={s.tempTicks} aria-hidden>
                            {[-25, -15, -5, 0, 5, 15, 25].map((n) => (
                                <span key={n} className={s.tempTick} style={{ left: `calc(11px + ${pos(n)} * (100% - 22px))` }}>{fmtT(n)}</span>
                            ))}
                        </div>
                        {isIso && <p className={s.tempNote}>Изотерм не охлаждает — только сохраняет температуру, с которой груз загрузили.</p>}
                    </div>
                )}
            </fieldset>

            <div className={s.loadRow}>
                <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className={s.label} style={{ padding: 0, marginBottom: 8 }}>
                        Загрузка <span className={s.labelNote}>· можно несколько</span>
                    </legend>
                    <div className={s.tiles4}>
                        {LOADING.map((l) => (
                            <Tile key={l.key} tall tick on={loading.includes(l.key)} onClick={() => toggleLoading(l.key)} icon={<LoadingIcon faces={l.faces} />} label={l.label} />
                        ))}
                    </div>
                </fieldset>
                <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className={s.label} style={{ padding: 0, marginBottom: 8 }}>Оснащение</legend>
                    <div className="flex flex-col gap-1">
                        {EQUIPMENT.map((e) => (
                            <Switch key={e.key} checked={loading.includes(e.key)} onChange={() => toggleLoading(e.key)}>{e.label}</Switch>
                        ))}
                    </div>
                </fieldset>
            </div>
        </>
    );
}
