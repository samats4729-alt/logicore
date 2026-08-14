'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, Loader2, PenLine, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface CityOption {
    id: string;
    name: string;
    /** Область и страна — ими различают одноимённые города. */
    hint?: string | null;
}

interface GeoProviderHierarchy {
    provider: '2gis';
    placeId?: string;
    country?: { name: string; code: string; externalId?: string };
    region?: { name: string; externalId?: string };
    city?: { name: string; externalId?: string };
}

interface GeoItem {
    id?: string;
    name?: string;
    full_name?: string;
    point?: { lat: number; lon: number };
    geography?: GeoProviderHierarchy;
}

/**
 * Выбор города: свой справочник, 2ГИС, а если нигде нет — как написали.
 *
 * Три источника, и третий появился не от хорошей жизни. Сначала выбор был
 * только из справочника: считалось, что иначе города разойдутся написанием
 * («Шымкент», «Чимкент», «шымкент») и справочник расползётся за неделю. На
 * деле расползлось другое: компания не смогла завести запрос на Мынарал —
 * посёлка нет в справочнике, потому что справочник наполняется тем же
 * геокодером, который его не знает. Запрос не завёлся вовсе.
 *
 * Поэтому написанное вручную теперь принимается. Расхождение написаний
 * лечится не запретом, а приведением к одному ключу на сервере: «Шымкент»
 * и «Чимкент» встают в одну историю.
 *
 * Порядок остался прежним: справочник отвечает мгновенно, 2ГИС дозаводит
 * недостающее вместе со страной и областью, и только если не нашлось ни
 * там ни там — остаётся текст.
 */
export function CityPicker({
    title,
    placeholder,
    known,
    valueId,
    valueName,
    onSelect,
    onImported,
}: {
    title: string;
    placeholder: string;
    /** Города, которые уже есть в справочнике. */
    known: CityOption[];
    valueId?: string | null;
    /** Название, если города нет в справочнике и его вписали руками. */
    valueName?: string | null;
    onSelect: (city: { id: string | null; name: string }) => void;
    /** Город завели из 2ГИС — обновить справочник у родителя. */
    onImported?: (city: CityOption) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<GeoItem[]>([]);
    const [geoConfigured, setGeoConfigured] = useState<boolean | null>(null);
    const [searching, setSearching] = useState(false);
    const [importing, setImporting] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const requestId = useRef(0);

    const selected = known.find((c) => c.id === valueId) || null;

    const local = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return known.slice(0, 60);
        return known.filter((c) => c.name.toLowerCase().includes(q) || (c.hint || '').toLowerCase().includes(q)).slice(0, 60);
    }, [known, query]);

    useEffect(() => {
        if (open) setTimeout(() => searchRef.current?.focus(), 50);
        else { setQuery(''); setSuggestions([]); }
    }, [open]);

    // Подсказки 2ГИС. Ответы нумеруем: человек печатает быстро, и медленный
    // ранний ответ не должен затирать свежий.
    useEffect(() => {
        if (!open) return;
        const q = query.trim();
        if (q.length < 2) { setSuggestions([]); return; }

        const id = ++requestId.current;
        setSearching(true);
        const timer = setTimeout(() => {
            api.get('/geo/suggest', { params: { q } })
                .then((res) => {
                    if (id !== requestId.current) return;
                    setGeoConfigured(res.data?.configured ?? false);
                    // Нужны только те подсказки, из которых понятен город:
                    // по одной улице город в справочник не заведёшь.
                    setSuggestions((res.data?.items || []).filter((i: GeoItem) => i.geography?.city && i.geography?.country));
                })
                .catch(() => { if (id === requestId.current) setSuggestions([]); })
                .finally(() => { if (id === requestId.current) setSearching(false); });
        }, 350);

        return () => clearTimeout(timer);
    }, [open, query]);

    /** Города, которых ещё нет в справочнике: остальные — дубли уже найденного. */
    const newFrom2gis = useMemo(() => {
        const haveNames = new Set(known.map((c) => c.name.toLowerCase()));
        const seen = new Set<string>();
        return suggestions.filter((item) => {
            const name = item.geography?.city?.name?.toLowerCase();
            if (!name || haveNames.has(name) || seen.has(name)) return false;
            seen.add(name);
            return true;
        });
    }, [suggestions, known]);

    const importCity = async (item: GeoItem) => {
        const geography = item.geography!;
        setImporting(item.id || geography.city!.name);
        try {
            const res = await api.post('/cities/import-from-provider', {
                provider: geography.provider,
                country: geography.country,
                region: geography.region,
                city: geography.city,
                latitude: item.point?.lat ?? 0,
                longitude: item.point?.lon ?? 0,
            });
            const city = res.data?.city;
            const region = res.data?.region;
            const country = res.data?.country;
            if (!city?.id) throw new Error('Город не вернулся');

            const option: CityOption = {
                id: city.id,
                name: city.name,
                hint: [region?.name, country?.name].filter(Boolean).join(', ') || null,
            };
            onImported?.(option);
            onSelect({ id: city.id, name: city.name });
            toast.success(`${city.name} добавлен в справочник`);
            setOpen(false);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось добавить город в справочник');
        } finally {
            setImporting(null);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    'flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-left text-[13px]',
                    'hover:border-foreground/30',
                    !selected && !valueName && 'text-muted-foreground',
                )}
            >
                <span className="truncate">{selected?.name || valueName || placeholder}</span>
                <span className="flex shrink-0 items-center gap-1">
                    {(selected || valueName) && (
                        <X
                            className="h-3.5 w-3.5 opacity-50 hover:opacity-100"
                            onClick={(e) => { e.stopPropagation(); onSelect({ id: null, name: '' }); }}
                        />
                    )}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </span>
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">{title}</DialogTitle>
                    </DialogHeader>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-40" />
                        <Input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Начните вводить название города"
                            className="h-9 pl-9 text-[13px]"
                        />
                        {searching && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin opacity-40" />}
                    </div>

                    <div className="max-h-[52vh] overflow-y-auto">
                        {local.length > 0 && (
                            <ul className="flex flex-col gap-0.5">
                                {local.map((c) => (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            onClick={() => { onSelect({ id: c.id, name: c.name }); setOpen(false); }}
                                            className={cn(
                                                'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted',
                                                c.id === valueId && 'bg-muted',
                                            )}
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-[13px] font-medium">{c.name}</span>
                                                {c.hint && <span className="block truncate text-[11px] text-muted-foreground">{c.hint}</span>}
                                            </span>
                                            {c.id === valueId && <Check className="h-4 w-4 shrink-0" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {newFrom2gis.length > 0 && (
                            <>
                                <p className="mt-3 px-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                                    Найдено в 2ГИС — добавится в справочник
                                </p>
                                <ul className="flex flex-col gap-0.5">
                                    {newFrom2gis.map((item) => {
                                        const g = item.geography!;
                                        const key = item.id || g.city!.name;
                                        return (
                                            <li key={key}>
                                                <button
                                                    type="button"
                                                    disabled={!!importing}
                                                    onClick={() => importCity(item)}
                                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
                                                >
                                                    {importing === key
                                                        ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                                        : <Globe className="h-4 w-4 shrink-0 opacity-40" />}
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-[13px] font-medium">{g.city!.name}</span>
                                                        <span className="block truncate text-[11px] text-muted-foreground">
                                                            {[g.region?.name, g.country?.name].filter(Boolean).join(', ')}
                                                        </span>
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </>
                        )}

                        {/* Написанное руками. Показывается всегда, когда в поиске
                            есть текст: список подсказок может быть неполным, а
                            человек уже знает, как называется его посёлок. */}
                        {query.trim().length >= 2 && (
                            <>
                                <p className="mt-3 px-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                                    Нет в списках
                                </p>
                                <button
                                    type="button"
                                    onClick={() => { onSelect({ id: null, name: query.trim() }); setOpen(false); }}
                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                                >
                                    <PenLine className="h-4 w-4 shrink-0 opacity-40" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[13px] font-medium">
                                            Оставить как написано: «{query.trim()}»
                                        </span>
                                        <span className="block truncate text-[11px] text-muted-foreground">
                                            Маршрут запомнится, история по нему будет собираться
                                        </span>
                                    </span>
                                </button>
                            </>
                        )}

                        {local.length === 0 && newFrom2gis.length === 0 && (
                            <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">
                                {query.trim().length < 2
                                    ? 'Введите хотя бы две буквы'
                                    : searching
                                        ? 'Ищем…'
                                        : geoConfigured === false
                                            ? 'В справочнике города нет, а поиск по 2ГИС не подключён. Впишите название — этого достаточно.'
                                            : `В справочниках ничего не нашлось по запросу «${query}»`}
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Закрыть</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
