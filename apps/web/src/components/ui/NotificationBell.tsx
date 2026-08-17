'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BellOutlined, NotificationOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { STATUS_LABELS, STATUS_PILL } from '@/components/ui/StatusPill';
import dayjs from 'dayjs';

interface OrderEvent {
    orderId: string; orderNumber: string; status: string; changedAt: string;
}
interface PendingItem {
    id: string; orderNumber: string; pendingStatus: string; pendingStatusAt: string | null;
}
interface SupportAnswer {
    id: string; title: string; answeredAt: string | null;
}

/** Метка «эти ответы поддержки уже видели». */
const LS_ANSWERS_KEY = 'lc_notif_last_answer_seen';

const LS_KEY = 'lc_notif_last_seen';

function usePolledData() {
    const [events, setEvents] = useState<OrderEvent[]>([]);
    const [pending, setPending] = useState<PendingItem[]>([]);
    const [answers, setAnswers] = useState<SupportAnswer[]>([]);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    const fetchAll = useCallback(async () => {
        try {
            const [evRes, pendRes, ansRes] = await Promise.all([
                api.get('/company/orders/events', { params: { limit: 15 } }),
                api.get('/company/orders/pending-confirmations'),
                // Ответ поддержки — событие того же рода: человек ждал и
                // должен узнать сразу, а не открывать раздел наугад.
                api.get('/assistant/support/my/answers').catch(() => ({ data: [] })),
            ]);
            if (mountedRef.current) {
                setEvents(evRes.data);
                setPending(pendRes.data);
                setAnswers(ansRes.data || []);
                setLoading(false);
            }
        } catch {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        fetchAll();
        const timer = setInterval(fetchAll, 60000);
        return () => { mountedRef.current = false; clearInterval(timer); };
    }, [fetchAll]);

    return { events, pending, answers, loading };
}

export default function NotificationBell({ hasNewUpdates }: { hasNewUpdates: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { events, pending, answers, loading } = usePolledData();

    /* Новые ответы поддержки — те, что появились после последнего открытия
       колокольчика. Метка местная: сервер про «прочитано» ничего не знает,
       да ему и незачем. */
    const [answersSeenAt, setAnswersSeenAt] = useState<string>('');
    useEffect(() => { setAnswersSeenAt(localStorage.getItem(LS_ANSWERS_KEY) || ''); }, []);
    const freshAnswers = answers.filter((a) => a.answeredAt && a.answeredAt > answersSeenAt);

    // lastSeen из localStorage
    const [lastSeen, setLastSeen] = useState<string | null>(null);
    useEffect(() => {
        try { setLastSeen(localStorage.getItem(LS_KEY)); } catch {}
    }, []);
    const markSeen = useCallback(() => {
        const now = new Date().toISOString();
        try { localStorage.setItem(LS_KEY, now); } catch {}
        setLastSeen(now);
    }, []);

    // Новые события (новее lastSeen)
    const newEventCount = lastSeen ? events.filter(e => e.changedAt > lastSeen).length : events.length;
    const hasPending = pending.length > 0;
    const showDot = hasNewUpdates || hasPending || newEventCount > 0 || freshAnswers.length > 0;

    // При открытии — отметить прочитанным
    useEffect(() => {
        if (open) markSeen();
    }, [open, markSeen]);

    // Клик вне панели
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                type="button"
                className="lc2-iconbtn"
                aria-label="Уведомления"
                data-guide="notifications"
                onClick={() => {
                    markSeen();
                    const latest = answers[0]?.answeredAt;
                    if (latest) {
                        localStorage.setItem(LS_ANSWERS_KEY, latest);
                        setAnswersSeenAt(latest);
                    }
                    setOpen(!open);
                }}
            >
                <BellOutlined />
                {showDot && <span className="lc2-dot" />}
            </button>

            {open && (
                <div
                    tabIndex={-1}
                    onKeyDown={handleKeyDown}
                    style={{
                        position: 'absolute', right: 0, top: 40,
                        width: 'min(400px, 90vw)', maxHeight: '70vh', overflowY: 'auto',
                        zIndex: 200, background: 'var(--nova-surface)', borderRadius: 14,
                        border: '1px solid var(--nova-border)',
                        boxShadow: 'var(--nova-shadow)',
                        padding: 12,
                    }}
                >
                    {/* Ответы поддержки: человек писал и ждёт. */}
                    {answers.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--nova-fg-3)', textTransform: 'uppercase', padding: '6px 8px 4px' }}>
                                Поддержка ответила
                            </div>
                            {answers.slice(0, 3).map((a) => (
                                <div
                                    key={a.id}
                                    onClick={() => { router.push('/company/support'); setOpen(false); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                        cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--nova-hover)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {a.title}
                                    </span>
                                    {a.answeredAt && (
                                        <span style={{ fontSize: 11, color: 'var(--nova-fg-3)', whiteSpace: 'nowrap' }}>
                                            {dayjs(a.answeredAt).format('DD.MM HH:mm')}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Ожидающие подтверждения */}
                    {hasPending && (
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--nova-fg-3)', textTransform: 'uppercase', padding: '6px 8px 4px' }}>
                                Требуют действия
                            </div>
                            {pending.map((p) => (
                                <div
                                    key={p.id}
                                    onClick={() => { router.push(`/company/orders/${p.id}`); setOpen(false); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                        cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--nova-hover)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span style={{ fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                                        {p.orderNumber}
                                    </span>
                                    <span style={{ fontSize: 12, color: 'var(--nova-warn)', flex: 1 }}>
                                        Ожидает подтверждения завершения
                                    </span>
                                    {p.pendingStatusAt && (
                                        <span style={{ fontSize: 11, color: 'var(--nova-fg-3)', whiteSpace: 'nowrap' }}>
                                            {dayjs(p.pendingStatusAt).format('DD.MM HH:mm')}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Лента событий */}
                    {events.length > 0 && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--nova-fg-3)', textTransform: 'uppercase', padding: '6px 8px 4px' }}>
                                Лента событий
                            </div>
                            {events.map((e) => {
                                const color = STATUS_PILL[e.status]?.fg || STATUS_PILL.DRAFT.fg;
                                return (
                                    <div
                                        key={e.orderId + e.changedAt}
                                        onClick={() => { router.push(`/company/orders/${e.orderId}`); setOpen(false); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                            cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s',
                                        }}
                                        onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--nova-hover)')}
                                        onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                                    >
                                        <i style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                        <span style={{ fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                                            {e.orderNumber}
                                        </span>
                                        <span style={{ fontSize: 12, color: 'var(--nova-fg-2)', flex: 1 }}>
                                            {STATUS_LABELS[e.status] || e.status}
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--nova-fg-3)', whiteSpace: 'nowrap' }}>
                                            {dayjs(e.changedAt).format('DD.MM HH:mm')}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Пусто */}
                    {!loading && !hasPending && events.length === 0 && (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--nova-fg-3)', fontSize: 13 }}>
                            Пока нет уведомлений
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}