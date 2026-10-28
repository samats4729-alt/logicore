'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BellOutlined, NotificationOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useOffersFeed } from '@/lib/offers-feed';
import { откликИзменён, ценаИзменена } from '@/lib/exchange';
import { moneyShort } from '@/lib/money-format';
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

/** Весть о документе: ТТН, счёт перевозчика, оплата (C5/H8, H7). */
interface DocumentNotice {
    id: string;
    kind: 'TTN' | 'INCOMING_INVOICE' | 'INVOICE_PAID';
    title: string;
    text: string;
    at: string;
    href: string;
}

const NOTICE_COLOR: Record<DocumentNotice['kind'], string> = {
    TTN: 'var(--nova-accent)',
    INCOMING_INVOICE: 'var(--nova-warn)',
    INVOICE_PAID: 'var(--nova-pos)',
};

/** Метка «эти ответы поддержки уже видели». */
const LS_ANSWERS_KEY = 'lc_notif_last_answer_seen';

const LS_KEY = 'lc_notif_last_seen';

function usePolledData() {
    const [events, setEvents] = useState<OrderEvent[]>([]);
    const [pending, setPending] = useState<PendingItem[]>([]);
    const [answers, setAnswers] = useState<SupportAnswer[]>([]);
    const [notices, setNotices] = useState<DocumentNotice[]>([]);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    const fetchAll = useCallback(async () => {
        try {
            const [evRes, pendRes, ansRes, notRes] = await Promise.all([
                api.get('/company/orders/events', { params: { limit: 15 } }),
                api.get('/company/orders/pending-confirmations'),
                // Ответ поддержки — событие того же рода: человек ждал и
                // должен узнать сразу, а не открывать раздел наугад.
                api.get('/assistant/support/my/answers').catch(() => ({ data: [] })),
                // Документы: ТТН от водителя, счёт перевозчика, оплата нашего счёта.
                api.get('/company/notices').catch(() => ({ data: [] })),
            ]);
            if (mountedRef.current) {
                setEvents(evRes.data);
                setPending(pendRes.data);
                setAnswers(ansRes.data || []);
                setNotices(notRes.data || []);
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

    return { events, pending, answers, notices, loading };
}

export default function NotificationBell({ hasNewUpdates }: { hasNewUpdates: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { events, pending, answers, notices, loading } = usePolledData();
    // Отклики на свои заявки на бирже — из общего счётчика кабинета (lib/offers-feed):
    // тот же список, что у значков в меню, без второго опроса сервера.
    const offers = useOffersFeed((s) => s.offers);

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
    // Новые отклики — пришедшие после последнего открытия колокольчика.
    const newOffers = lastSeen ? offers.filter((o) => откликИзменён(o) > lastSeen) : offers;
    const newNotices = lastSeen ? notices.filter((n) => n.at > lastSeen) : notices;
    const showDot = hasNewUpdates || hasPending || newEventCount > 0 || freshAnswers.length > 0 || newOffers.length > 0
        || newNotices.length > 0;

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

                    {/* Отклики на свои заявки на бирже — кто и за сколько. */}
                    {offers.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '6px 8px 4px' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--nova-fg-3)', textTransform: 'uppercase' }}>
                                    Отклики на биржу{newOffers.length > 0 ? ` · новых ${newOffers.length}` : ''}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => { router.push('/company/exchange?tab=offers'); setOpen(false); }}
                                    style={{ fontSize: 12, color: 'var(--nova-fg-2)', background: 'none', border: 0, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                                >
                                    Все предложения
                                </button>
                            </div>
                            {offers.slice(0, 5).map((o) => (
                                <div
                                    key={o.id}
                                    onClick={() => { router.push(`/company/orders/${o.orderId}?tab=offers`); setOpen(false); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                        cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--nova-hover)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <i style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: newOffers.some((n) => n.id === o.id) ? 'var(--nova-accent)' : 'transparent' }} />
                                    <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <b style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{moneyShort(o.price)}</b> · {o.from} → {o.to} · {o.name}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--nova-fg-3)', whiteSpace: 'nowrap' }}>
                                        {ценаИзменена(o) ? 'цена изменена ' : ''}{dayjs(откликИзменён(o)).format('DD.MM HH:mm')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Документы: ТТН, счета перевозчиков, оплаты. */}
                    {notices.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--nova-fg-3)', textTransform: 'uppercase', padding: '6px 8px 4px' }}>
                                Документы{newNotices.length > 0 ? ` · новых ${newNotices.length}` : ''}
                            </div>
                            {notices.slice(0, 6).map((n) => (
                                <div
                                    key={n.id}
                                    onClick={() => { router.push(n.href); setOpen(false); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                        cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--nova-hover)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <i style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: NOTICE_COLOR[n.kind] }} />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {n.title}
                                        </span>
                                        <span style={{ display: 'block', fontSize: 12, color: 'var(--nova-fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {n.text}
                                        </span>
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--nova-fg-3)', whiteSpace: 'nowrap' }}>
                                        {dayjs(n.at).format('DD.MM HH:mm')}
                                    </span>
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
                                        {p.pendingStatus === 'DELETE' ? 'Запрос на удаление заявки'
                                            : p.pendingStatus === 'DELETE_DECLINED' ? 'Запрос на удаление отклонён'
                                                : 'Ожидает подтверждения завершения'}
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
                    {!loading && !hasPending && events.length === 0 && offers.length === 0 && notices.length === 0 && (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--nova-fg-3)', fontSize: 13 }}>
                            Пока нет уведомлений
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}