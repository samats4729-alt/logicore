'use client';

import { Input } from 'antd';
import { PenLine, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const { TextArea } = Input;

/**
 * Вступление договора: кто с кем, в лице кого, на основании чего
 * (владелец, 31.10.2026: «чтобы можно было подредактировать вручную»).
 *
 * Пока его не правили, программа собирает его сама из карточек компаний —
 * здесь он виден как есть. «Изменить» кладёт этот текст в поле, и дальше
 * договор печатается с правленым. «Вернуть автоматическое» — обратно.
 */
export default function ContractPreamble({ text, auto, onChange }: {
    /** Своё вступление; null — не правили, печатается автоматическое. */
    text: string | null;
    /** Как его собирает программа — из карточек компаний. */
    auto: string;
    onChange: (text: string | null) => void;
}) {
    const своё = text !== null;
    return (
        <section style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--nova-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <b style={{ fontSize: 14 }}>Вступление</b>
                <span style={{ fontSize: 12, color: 'var(--nova-fg-3)' }}>
                    {своё ? 'поправлено вручную' : 'собирается из карточек компаний'}
                </span>
                <div style={{ marginLeft: 'auto' }}>
                    {своё ? (
                        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                            <RotateCcw className="h-3.5 w-3.5" /> Вернуть автоматическое
                        </Button>
                    ) : (
                        <Button variant="outline" size="sm" disabled={!auto} onClick={() => onChange(auto)}>
                            <PenLine className="h-3.5 w-3.5" /> Изменить
                        </Button>
                    )}
                </div>
            </div>
            {своё ? (
                <TextArea
                    aria-label="Вступление договора"
                    value={text ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    autoSize={{ minRows: 4, maxRows: 12 }}
                    style={{ fontSize: 13 }}
                />
            ) : (
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--nova-fg-2)', textAlign: 'justify' }}>
                    {auto || 'Загружаем…'}
                </p>
            )}
            {своё && !text?.trim() && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--nova-warn)' }}>
                    Пустое вступление не печатается — в договоре будет автоматическое.
                </div>
            )}
        </section>
    );
}
