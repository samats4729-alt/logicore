'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { DRIVER_DOCUMENT_TITLES, DriverDocumentKind, ExchangeDriver } from '@/lib/exchange';

/** В каком порядке показывать: сперва личность, потом права и машина. */
const ORDER: DriverDocumentKind[] = [
    'ID_FRONT', 'ID_BACK', 'SELFIE_WITH_ID', 'LICENSE', 'VEHICLE_REGISTRATION', 'POWER_OF_ATTORNEY', 'IP_CERTIFICATE',
];

/**
 * Фото документов водителя — парк сверяет их перед тем, как допустить.
 *
 * Файлы берём запросом с пропуском, а не ссылкой `<img src>`: иначе фото
 * удостоверения открывалось бы любому, кто угадал адрес.
 */
export function DriverDocuments({ driver }: { driver: ExchangeDriver }) {
    const [urls, setUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        let alive = true;
        const created: string[] = [];
        Promise.all(driver.documents.map(async (d) => {
            try {
                const r = await api.get(`/exchange/park/documents/${d.id}`, { responseType: 'blob' });
                const url = URL.createObjectURL(r.data as Blob);
                created.push(url);
                return [d.id, url] as const;
            } catch {
                return [d.id, ''] as const;
            }
        })).then((pairs) => { if (alive) setUrls(Object.fromEntries(pairs)); });
        return () => { alive = false; created.forEach((u) => URL.revokeObjectURL(u)); };
    }, [driver.documents]);

    if (!driver.documents.length) {
        return <p className="text-[13px] text-muted-foreground">Водитель не приложил фото документов.</p>;
    }

    const docs = [...driver.documents].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {docs.map((d) => (
                <figure key={d.id} className="m-0">
                    <figcaption className="mb-1 text-[12px] text-muted-foreground">{DRIVER_DOCUMENT_TITLES[d.kind]}</figcaption>
                    <div className="flex h-44 items-center justify-center overflow-hidden rounded-xl border border-solid border-border bg-muted/40">
                        {!urls[d.id] ? (
                            urls[d.id] === '' ? <span className="text-[12px] text-muted-foreground">Не загрузилось</span>
                                : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : d.mimeType.startsWith('image/') ? (
                            <a href={urls[d.id]} target="_blank" rel="noreferrer" className="h-full w-full" title="Открыть крупно">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={urls[d.id]} alt={DRIVER_DOCUMENT_TITLES[d.kind]} className="h-full w-full object-contain" />
                            </a>
                        ) : (
                            <a href={urls[d.id]} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px]">
                                <FileText className="h-4 w-4" /> {d.fileName}
                            </a>
                        )}
                    </div>
                </figure>
            ))}
        </div>
    );
}
