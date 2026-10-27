'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { api } from '@/lib/api';

export interface PoaAttachments {
    /** Файлы рейса, отмеченные галочкой. */
    documentIds: string[];
    /** Файлы с компьютера — только для этого письма, в рейс не сохраняются. */
    files: File[];
}

export const NO_ATTACHMENTS: PoaAttachments = { documentIds: [], files: [] };

/**
 * Вложения к письму с доверенностью (задачи шефа, D3: «прикрепить
 * дополнительные документы — документы водителя»): файлы рейса галочками и
 * файлы с компьютера. Доверенность прикладывается всегда, это — сверх неё.
 */
export default function PoaAttachmentsPicker({ orderId, open, value, onChange }: {
    orderId: string;
    open: boolean;
    value: PoaAttachments;
    onChange: (v: PoaAttachments) => void;
}) {
    const [docs, setDocs] = useState<{ id: string; fileName: string }[]>([]);
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        api.get(`/documents/order/${orderId}`).then((r) => setDocs(r.data || [])).catch(() => setDocs([]));
    }, [open, orderId]);

    const toggle = (id: string) => onChange({
        ...value,
        documentIds: value.documentIds.includes(id) ? value.documentIds.filter((x) => x !== id) : [...value.documentIds, id],
    });

    return (
        <div style={{ borderTop: '1px solid var(--lc-border)', paddingTop: 16, marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Приложить к письму (необязательно)</div>
            {docs.length > 0 && (
                <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: 8 }}>
                    {docs.map((d) => (
                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={value.documentIds.includes(d.id)} onChange={() => toggle(d.id)} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fileName}</span>
                        </label>
                    ))}
                </div>
            )}
            {value.files.map((f, i) => (
                <div key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '3px 0' }}>
                    <Paperclip size={13} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button
                        type="button"
                        aria-label={`Убрать ${f.name}`}
                        onClick={() => onChange({ ...value, files: value.files.filter((_, j) => j !== i) })}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--lc-text-ter)', padding: 2 }}
                    >
                        <X size={13} />
                    </button>
                </div>
            ))}
            <input
                ref={input}
                type="file"
                multiple
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    onChange({ ...value, files: [...value.files, ...picked].slice(0, 6) });
                    e.target.value = '';
                }}
            />
            <button
                type="button"
                onClick={() => input.current?.click()}
                style={{ marginTop: 4, border: '1px dashed var(--lc-border)', borderRadius: 8, background: 'transparent', padding: '6px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
            >
                + Файл с компьютера (удостоверение, техпаспорт…)
            </button>
            <div style={{ fontSize: 11.5, color: 'var(--lc-text-ter)', marginTop: 6 }}>
                До 6 файлов, PDF или фото, до 10 МБ каждый. Файлы с компьютера в рейсе не сохраняются — уходят только с этим письмом.
            </div>
        </div>
    );
}
