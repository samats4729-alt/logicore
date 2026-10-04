'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ExchangeLoad, ответСервера } from '@/lib/exchange';

const MAX_PHOTOS = 10;

/**
 * Фото груза в карточке.
 *
 * Картинки грузятся через тот же вход, что и остальное, — по ссылке
 * `<img src>` браузер не передал бы пропуск, и чужой груз по угаданному
 * адресу открылся бы. Поэтому берём файл запросом и показываем копию.
 */
export function LoadPhotos({ load, editable, onChanged }: {
    load: ExchangeLoad;
    /** Добавлять и убирать — пока груз ищет машину. */
    editable: boolean;
    onChanged: () => void;
}) {
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        const created: string[] = [];
        Promise.all(load.photos.map(async (p) => {
            try {
                const r = await api.get(`/exchange/photos/${p.id}`, { responseType: 'blob' });
                const url = URL.createObjectURL(r.data as Blob);
                created.push(url);
                return [p.id, url] as const;
            } catch {
                return [p.id, ''] as const;
            }
        })).then((pairs) => { if (alive) setUrls(Object.fromEntries(pairs)); });
        return () => { alive = false; created.forEach((u) => URL.revokeObjectURL(u)); };
    }, [load.photos]);

    const add = async (files: FileList | null) => {
        if (!files?.length) return;
        setBusy(true);
        let failed = 0;
        for (const file of Array.from(files).slice(0, MAX_PHOTOS - load.photos.length)) {
            const form = new FormData();
            form.append('file', file);
            try {
                await api.post(`/exchange/loads/${load.id}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            } catch (e) {
                failed += 1;
                toast.error(ответСервера(e, `Фото «${file.name}» не загрузилось`));
            }
        }
        setBusy(false);
        if (!failed) toast.success('Фото добавлены');
        onChanged();
    };

    const remove = async (photoId: string) => {
        try {
            await api.delete(`/exchange/photos/${photoId}`);
            onChanged();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось убрать фото'));
        }
    };

    if (!load.photos.length && !editable) {
        return <p className="text-[13px] text-muted-foreground">Фото не приложены.</p>;
    }

    return (
        <div className="flex flex-wrap gap-2">
            {load.photos.map((p) => (
                <div key={p.id} className="relative h-24 w-24 overflow-hidden rounded-xl border border-solid border-border bg-muted/40">
                    {urls[p.id] ? (
                        <a href={urls[p.id]} target="_blank" rel="noreferrer" title={p.fileName}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={urls[p.id]} alt={p.fileName} className="h-full w-full object-cover" />
                        </a>
                    ) : (
                        <div className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                    )}
                    {editable && (
                        <button
                            type="button"
                            aria-label={`Убрать фото ${p.fileName}`}
                            onClick={() => remove(p.id)}
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>
            ))}
            {editable && load.photos.length < MAX_PHOTOS && (
                <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-[11px] text-muted-foreground hover:bg-muted/40">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Добавить
                    <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
                </label>
            )}
        </div>
    );
}
