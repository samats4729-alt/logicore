'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button, Input, Spin } from 'antd';
import { RobotOutlined, SendOutlined, CloseOutlined, CompassOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';

interface Step {
    selector?: string;
    goto?: string;
    say?: string;
}

interface TicketDraft {
    title: string;
    category?: string;
    severity?: string;
    description: string;
    process?: string;
    where?: string;
    expected?: string;
    actual?: string;
    orders?: string[];
}

interface ChatMsg {
    role: 'user' | 'assistant';
    content: string;
    steps?: Step[] | null;
    ticket?: TicketDraft | null;
}

const GREETING: ChatMsg = {
    role: 'assistant',
    content: 'Привет! Я гид LogiCore. Спросите, как что сделать — например «Как создать заявку?». Я проведу по шагам прямо в интерфейсе.',
};

const GREETING_SUPPORT: ChatMsg = {
    role: 'assistant',
    content: 'Опишите проблему — что работает неправильно? Я сверюсь с вашими данными (заявки, счета, оплаты), уточню детали и оформлю обращение разработчику.',
};

// Карта преломления «толстой линзы»: центр нейтральный (#808080 — без смещения),
// у скруглённых краёв R/G-каналы кодируют изгиб фона наружу (эффект Apple Liquid Glass)
const LG_MAP = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='380' height='560'>" +
    "<defs>" +
    "<linearGradient id='x' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#000000'/><stop offset='1' stop-color='#ff0000'/></linearGradient>" +
    "<linearGradient id='y' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#000000'/><stop offset='1' stop-color='#00ff00'/></linearGradient>" +
    "<filter id='b'><feGaussianBlur stdDeviation='12'/></filter>" +
    "</defs>" +
    "<rect width='380' height='560' fill='url(#x)'/>" +
    "<rect width='380' height='560' fill='url(#y)' style='mix-blend-mode:screen'/>" +
    "<rect x='22' y='22' width='336' height='516' rx='34' fill='#808080' filter='url(#b)'/>" +
    "</svg>"
);

function parseTicket(text: string): { clean: string; ticket: TicketDraft | null } {
    const match = text.match(/```ticket\s*([\s\S]*?)```/);
    if (!match) return { clean: text.trim(), ticket: null };
    let ticket: TicketDraft | null = null;
    try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed && parsed.title && parsed.description) ticket = parsed;
    } catch {
        ticket = null;
    }
    return { clean: text.replace(match[0], '').trim(), ticket };
}

const SEVERITY_LABEL: Record<string, { text: string; color: string }> = {
    low: { text: 'Низкая', color: '#64748b' },
    medium: { text: 'Средняя', color: '#b45309' },
    high: { text: 'Высокая', color: '#dc2626' },
};

const CATEGORY_LABEL: Record<string, string> = {
    finance: 'Финансы',
    orders: 'Заявки',
    documents: 'Документы',
    display: 'Отображение',
    other: 'Другое',
};

function parseSteps(text: string): { clean: string; steps: Step[] | null } {
    const stepsMatch = text.match(/```steps\s*([\s\S]*?)```/);
    if (stepsMatch) {
        let steps: Step[] | null = null;
        try {
            const parsed = JSON.parse(stepsMatch[1].trim());
            if (Array.isArray(parsed) && parsed.length > 0) steps = parsed;
        } catch {
            steps = null;
        }
        return { clean: text.replace(stepsMatch[0], '').trim(), steps };
    }
    const actionMatch = text.match(/```action\s*([\s\S]*?)```/);
    if (actionMatch) {
        try {
            const a = JSON.parse(actionMatch[1].trim());
            return { clean: text.replace(actionMatch[0], '').trim(), steps: [a] };
        } catch {
            return { clean: text.replace(actionMatch[0], '').trim(), steps: null };
        }
    }
    return { clean: text.trim(), steps: null };
}

function renderRich(text: string) {
    return text.split('\n').map((line, li) => {
        const cleaned = line.replace(/^\s*[-*•]\s+/, '• ');
        const parts = cleaned.split(/(\*\*[^*]+\*\*)/g);
        return (
            <div key={li} style={line.trim() ? undefined : { height: 6 }}>
                {parts.map((p, i) => {
                    const b = p.match(/^\*\*([^*]+)\*\*$/);
                    if (b) return <strong key={i}>{b[1]}</strong>;
                    return <span key={i}>{p.replace(/\*/g, '')}</span>;
                })}
            </div>
        );
    });
}

export default function AssistantWidget() {
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<'guide' | 'support'>('guide');
    const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
    const [supportMessages, setSupportMessages] = useState<ChatMsg[]>([GREETING_SUPPORT]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [ticketSending, setTicketSending] = useState(false);
    const [hasNewUpdates, setHasNewUpdates] = useState(false);
    const [newUpdates, setNewUpdates] = useState<any[]>([]);

    const [tourActive, setTourActive] = useState(false);
    const [tipText, setTipText] = useState('');
    const [tipMeta, setTipMeta] = useState({ index: 0, total: 0 });

    const bodyRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const tipRef = useRef<HTMLDivElement>(null);
    const targetElRef = useRef<HTMLElement | null>(null);
    const stepsRef = useRef<Step[]>([]);
    const indexRef = useRef(0);
    const activeRef = useRef(false);

    useEffect(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [messages, supportMessages, mode, loading, open]);

    // Follow the target element every frame (no re-render, smooth on scroll)
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            raf = requestAnimationFrame(loop);
            const ring = ringRef.current;
            const tip = tipRef.current;
            const el = targetElRef.current;
            if (!ring) return;
            if (activeRef.current && el && document.body.contains(el)) {
                const r = el.getBoundingClientRect();
                ring.style.opacity = '1';
                ring.style.top = `${r.top - 6}px`;
                ring.style.left = `${r.left - 6}px`;
                ring.style.width = `${r.width + 12}px`;
                ring.style.height = `${r.height + 12}px`;
                if (tip) {
                    tip.style.top = `${Math.min(r.bottom + 14, window.innerHeight - 110)}px`;
                    tip.style.left = `${Math.min(Math.max(r.left, 8), window.innerWidth - 320)}px`;
                }
            } else if (ring) {
                ring.style.opacity = '0';
            }
        };
        loop();
        return () => cancelAnimationFrame(raf);
    }, []);

    // Advance when the user clicks the highlighted element
    useEffect(() => {
        if (!tourActive) return;
        const onClick = (e: MouseEvent) => {
            const el = targetElRef.current;
            if (!el) return;
            if (el.contains(e.target as Node)) {
                window.setTimeout(() => advance(), 480);
            }
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tourActive]);

    const locate = (i: number) => {
        const step = stepsRef.current[i];
        if (!step) return endTour();
        if (step.goto) router.push(step.goto);
        setTipMeta({ index: i, total: stepsRef.current.length });
        setTipText(step.say || '');

        if (!step.selector) {
            targetElRef.current = null;
            window.setTimeout(() => {
                if (activeRef.current && indexRef.current === i) advance();
            }, 1000);
            return;
        }

        let tries = 0;
        const tryFind = () => {
            if (!activeRef.current || indexRef.current !== i) return;
            const el = document.querySelector(step.selector as string) as HTMLElement | null;
            if (el) {
                targetElRef.current = el;
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (tries < 20) {
                tries++;
                if (tries === 2) {
                    // На мобильном пункты меню живут в Drawer — просим layout открыть его
                    window.dispatchEvent(new Event('logicore:open-mobile-menu'));
                }
                window.setTimeout(tryFind, 250);
            } else {
                targetElRef.current = null;
                setTipText((step.say || '') + ' — не вижу элемент, откройте нужное меню вручную.');
            }
        };
        tryFind();
    };

    const advance = () => {
        const ni = indexRef.current + 1;
        if (ni >= stepsRef.current.length) return endTour();
        indexRef.current = ni;
        locate(ni);
    };

    const startTour = (steps: Step[]) => {
        stepsRef.current = steps;
        indexRef.current = 0;
        activeRef.current = true;
        setTourActive(true);
        setOpen(false);
        locate(0);
    };

    const endTour = () => {
        activeRef.current = false;
        targetElRef.current = null;
        setTourActive(false);
    };

    useEffect(() => {
        const fetchPublishedUpdates = async () => {
            try {
                const res = await api.get('/assistant/updates/published');
                const publishedList = res.data || [];
                if (publishedList.length > 0) {
                    const latest = publishedList[0];
                    const stored = localStorage.getItem('lc_last_read_update_id');
                    if (stored !== latest.id) {
                        setHasNewUpdates(true);
                        setNewUpdates(publishedList);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch published updates', err);
            }
        };
        fetchPublishedUpdates();
    }, []);

    const handleOpen = () => {
        setOpen(true);
        if (hasNewUpdates && newUpdates.length > 0) {
            localStorage.setItem('lc_last_read_update_id', newUpdates[0].id);
            setHasNewUpdates(false);
            window.dispatchEvent(new Event('logicore:updates-read'));
            const updatesText = "У нас вышли новые обновления на платформе!\n\n" +
                newUpdates.map((u: any) => `**${u.title}**\n${u.description}`).join('\n\n');
            setMessages(prev => [
                prev[0],
                { role: 'assistant', content: updatesText },
                ...prev.slice(1)
            ]);
        }
    };

    const handleOpenUpdates = async () => {
        setOpen(true);
        if (hasNewUpdates && newUpdates.length > 0) {
            localStorage.setItem('lc_last_read_update_id', newUpdates[0].id);
            setHasNewUpdates(false);
            window.dispatchEvent(new Event('logicore:updates-read'));
            const updatesText = "У нас вышли новые обновления на платформе!\n\n" +
                newUpdates.map((u: any) => `**${u.title}**\n${u.description}`).join('\n\n');
            setMessages(prev => [
                prev[0],
                { role: 'assistant', content: updatesText },
                ...prev.slice(1)
            ]);
        } else {
            try {
                const res = await api.get('/assistant/updates/published');
                const list = res.data || [];
                if (list.length > 0) {
                    const updatesText = "Вот недавние обновления платформы:\n\n" +
                        list.map((u: any) => `**${u.title}**\n${u.description}`).join('\n\n');
                    setMessages(prev => {
                        const alreadyShown = prev.some(m => m.content.includes("недавние обновления платформы"));
                        if (alreadyShown) return prev;
                        return [
                            ...prev,
                            { role: 'assistant', content: updatesText }
                        ];
                    });
                } else {
                    setMessages(prev => [
                        ...prev,
                        { role: 'assistant', content: "У нас пока нет опубликованных обновлений." }
                    ]);
                }
            } catch (err) {
                console.error(err);
            }
        }
    };

    useEffect(() => {
        const onOpenUpdates = () => {
            handleOpenUpdates();
        };
        window.addEventListener('logicore:open-updates', onOpenUpdates);
        const onOpenAssistant = () => handleOpen();
        window.addEventListener('logicore:open-assistant', onOpenAssistant);
        return () => {
            window.removeEventListener('logicore:open-updates', onOpenUpdates);
            window.removeEventListener('logicore:open-assistant', onOpenAssistant);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasNewUpdates, newUpdates]);

    const sendPrompt = async (text: string) => {
        if (!text || loading) return;
        const isSupport = mode === 'support';
        const current = isSupport ? supportMessages : messages;
        const setCurrent = isSupport ? setSupportMessages : setMessages;

        const next: ChatMsg[] = [...current, { role: 'user', content: text }];
        setCurrent(next);
        setLoading(true);
        try {
            const payload = next
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({ role: m.role, content: m.content }));
            const res = isSupport
                ? await api.post('/assistant/support', { messages: payload })
                : await api.post('/assistant/chat', { messages: payload, context: pathname });
            const reply: string = res.data?.reply || 'Не удалось получить ответ.';
            if (isSupport) {
                const { clean, ticket } = parseTicket(reply);
                setCurrent((prev) => [...prev, { role: 'assistant', content: clean, ticket }]);
            } else {
                const { clean, steps } = parseSteps(reply);
                setCurrent((prev) => [...prev, { role: 'assistant', content: clean, steps }]);
            }
        } catch {
            setCurrent((prev) => [...prev, { role: 'assistant', content: 'Ошибка связи. Попробуйте ещё раз.' }]);
        } finally {
            setLoading(false);
        }
    };

    const send = async () => {
        const text = input.trim();
        if (!text || loading) return;
        setInput('');
        await sendPrompt(text);
    };

    const sendTicket = async (ticket: TicketDraft, msgIndex: number) => {
        if (ticketSending) return;
        setTicketSending(true);
        try {
            const transcript = supportMessages
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({ role: m.role, content: m.content }));
            await api.post('/assistant/support/ticket', { ...ticket, transcript });
            setSupportMessages((prev) => {
                const copy = [...prev];
                if (copy[msgIndex]) copy[msgIndex] = { ...copy[msgIndex], ticket: null };
                return [
                    ...copy,
                    { role: 'assistant', content: 'Обращение отправлено разработчику. Спасибо! Мы разберёмся и починим.' },
                ];
            });
        } catch {
            setSupportMessages((prev) => [...prev, { role: 'assistant', content: 'Не удалось отправить обращение. Попробуйте ещё раз.' }]);
        } finally {
            setTicketSending(false);
        }
    };

    return (
        <>
            {open && (
                <div
                    className="ai-glass-panel"
                    style={{
                        position: 'fixed', right: 24, bottom: 24,
                        width: 'min(380px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 100px))',
                        zIndex: 1600,
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}
                >
                    <div className="ai-glass-header">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: 'var(--lc-text)' }}>
                                <span style={{
                                    width: 30, height: 30, borderRadius: 10, background: 'rgba(22,119,255,0.14)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1677ff', fontSize: 16,
                                }}>
                                    <RobotOutlined />
                                </span>
                                <span>
                                    Ассистент LogiCore
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 500, color: 'var(--lc-text-sec)', opacity: 0.85 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.18)' }} />
                                        онлайн
                                    </span>
                                </span>
                            </span>
                            <CloseOutlined style={{ cursor: 'pointer', color: 'var(--lc-text-sec)', fontSize: 14 }} onClick={() => setOpen(false)} />
                        </div>
                        <div className="ai-seg" style={{ marginTop: 12 }}>
                            {([['guide', 'Гид'], ['support', 'Поддержка']] as const).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setMode(key)}
                                    className={`ai-seg-btn${mode === key ? ' active' : ''}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--lc-bg)', position: 'relative', zIndex: 2 }}>
                        {(mode === 'guide' ? messages : supportMessages).map((m, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                                <div
                                    className={m.role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant'}
                                    style={{
                                        borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                                        borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
                                    }}
                                >
                                    {m.role === 'assistant' ? renderRich(m.content) : m.content}
                                    {m.steps && m.steps.length > 0 && (
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={<CompassOutlined />}
                                            onClick={() => startTour(m.steps as Step[])}
                                            style={{ marginTop: 10, display: 'block' }}
                                        >
                                            Показать по шагам
                                        </Button>
                                    )}
                                    {m.ticket && (
                                        <div style={{ marginTop: 10, border: '1px solid var(--lc-border)', borderRadius: 10, padding: '10px 12px', background: 'var(--lc-card)' }}>
                                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{m.ticket.title}</div>
                                            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--lc-hover)', color: 'var(--lc-text-sec)', fontWeight: 500 }}>
                                                    {CATEGORY_LABEL[m.ticket.category || 'other'] || m.ticket.category}
                                                </span>
                                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--lc-bg)', border: '1px solid var(--lc-border)', fontWeight: 600, color: (SEVERITY_LABEL[m.ticket.severity || 'medium'] || SEVERITY_LABEL.medium).color }}>
                                                    {(SEVERITY_LABEL[m.ticket.severity || 'medium'] || SEVERITY_LABEL.medium).text}
                                                </span>
                                            </div>
                                            {m.ticket.expected && (
                                                <div style={{ fontSize: 11.5, marginBottom: 4 }}>
                                                    <span style={{ color: '#16a34a', fontWeight: 600 }}>Ожидается: </span>
                                                    <span style={{ color: 'var(--lc-text-sec)' }}>{m.ticket.expected}</span>
                                                </div>
                                            )}
                                            {m.ticket.actual && (
                                                <div style={{ fontSize: 11.5, marginBottom: 8 }}>
                                                    <span style={{ color: '#dc2626', fontWeight: 600 }}>Фактически: </span>
                                                    <span style={{ color: 'var(--lc-text-sec)' }}>{m.ticket.actual}</span>
                                                </div>
                                            )}
                                            {m.ticket.orders && m.ticket.orders.length > 0 && (
                                                <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', marginBottom: 8 }}>
                                                    Заявки: {m.ticket.orders.join(', ')}
                                                </div>
                                            )}
                                            <Button
                                                type="primary"
                                                size="small"
                                                loading={ticketSending}
                                                onClick={() => sendTicket(m.ticket as TicketDraft, i)}
                                            >
                                                Отправить в поддержку
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {mode === 'guide' && messages.length === 1 && !loading && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, marginBottom: 8 }}>
                                <button
                                    onClick={() => sendPrompt('Что нового на платформе?')}
                                    className="ai-prompt-btn"
                                >
                                    Что нового?
                                </button>
                                <button
                                    onClick={() => sendPrompt('Как создать заявку?')}
                                    className="ai-prompt-btn"
                                >
                                    Как создать заявку?
                                </button>
                            </div>
                        )}
                        {loading && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--lc-text-ter)', fontSize: 13 }}>
                                <Spin size="small" /> Думаю…
                            </div>
                        )}
                    </div>

                    <div className="ai-footer">
                        <Input.TextArea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); send(); } }}
                            placeholder={mode === 'guide' ? 'Спросите, как что сделать…' : 'Опишите проблему…'}
                            autoSize={{ minRows: 1, maxRows: 3 }}
                            variant="borderless"
                            className="ai-input"
                        />
                        <Button
                            type="primary"
                            shape="circle"
                            icon={<SendOutlined />}
                            onClick={send}
                            loading={loading}
                            className="ai-send-btn"
                        />
                    </div>
                </div>
            )}

            {tourActive && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1500, pointerEvents: 'none' }}>
                    <div ref={ringRef} className="ai-spot-ring" style={{ opacity: 0 }} />
                    <div ref={tipRef} className="ai-spot-tip" style={{ pointerEvents: 'auto' }}>
                        <div style={{ marginBottom: 10, fontWeight: 500 }}>{tipText}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 11.5, opacity: 0.65, fontWeight: 500 }}>{tipMeta.index + 1} / {tipMeta.total}</span>
                            <span style={{ display: 'flex', gap: 6 }}>
                                <button
                                    onClick={endTour}
                                    className="ai-spot-btn-secondary"
                                >
                                    Закрыть
                                </button>
                                <button
                                    onClick={() => advance()}
                                    className="ai-spot-btn-primary"
                                >
                                    {tipMeta.index + 1 >= tipMeta.total ? 'Готово' : 'Дальше'}
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
