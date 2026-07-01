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

interface ChatMsg {
    role: 'user' | 'assistant';
    content: string;
    steps?: Step[] | null;
}

const GREETING: ChatMsg = {
    role: 'assistant',
    content: 'Привет! Я гид LogiCore. Спросите, как что сделать — например «Как создать заявку?». Я проведу по шагам прямо в интерфейсе.',
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
    const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

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
    }, [messages, loading, open]);

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

    const send = async () => {
        const text = input.trim();
        if (!text || loading) return;
        const next: ChatMsg[] = [...messages, { role: 'user', content: text }];
        setMessages(next);
        setInput('');
        setLoading(true);
        try {
            const payload = next
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({ role: m.role, content: m.content }));
            const res = await api.post('/assistant/chat', { messages: payload, context: pathname });
            const reply: string = res.data?.reply || 'Не удалось получить ответ.';
            const { clean, steps } = parseSteps(reply);
            setMessages((prev) => [...prev, { role: 'assistant', content: clean, steps }]);
        } catch {
            setMessages((prev) => [...prev, { role: 'assistant', content: 'Ошибка связи с гидом. Попробуйте ещё раз.' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {!open && (
                <button
                    aria-label="Открыть ИИ-гид"
                    onClick={() => setOpen(true)}
                    style={{
                        position: 'fixed', right: 24, bottom: 24, width: 56, height: 56, borderRadius: '50%',
                        border: 'none', background: '#1677ff', color: '#fff', fontSize: 24, cursor: 'pointer',
                        boxShadow: '0 8px 24px rgba(22,119,255,0.4)', zIndex: 1600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <RobotOutlined />
                </button>
            )}

            {open && (
                <div
                    style={{
                        position: 'fixed', right: 24, bottom: 24,
                        width: 'min(380px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 100px))',
                        background: '#fff', borderRadius: 16, border: '1px solid #e4e4e7',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.18)', zIndex: 1600,
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#1677ff', color: '#fff' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                            <RobotOutlined /> Гид LogiCore
                        </span>
                        <CloseOutlined style={{ cursor: 'pointer' }} onClick={() => setOpen(false)} />
                    </div>

                    <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
                        {messages.map((m, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                                <div
                                    style={{
                                        maxWidth: '85%', padding: '9px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.5,
                                        whiteSpace: 'pre-wrap',
                                        background: m.role === 'user' ? '#1677ff' : '#fff',
                                        color: m.role === 'user' ? '#fff' : '#0f172a',
                                        border: m.role === 'user' ? 'none' : '1px solid #e4e4e7',
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
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13 }}>
                                <Spin size="small" /> Думаю…
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #e4e4e7', background: '#fff' }}>
                        <Input.TextArea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); send(); } }}
                            placeholder="Спросите, как что сделать…"
                            autoSize={{ minRows: 1, maxRows: 3 }}
                            style={{ flex: 1, resize: 'none' }}
                        />
                        <Button type="primary" icon={<SendOutlined />} onClick={send} loading={loading} />
                    </div>
                </div>
            )}

            {tourActive && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1500, pointerEvents: 'none' }}>
                    <div ref={ringRef} className="ai-spot-ring" style={{ opacity: 0 }} />
                    <div ref={tipRef} className="ai-spot-tip" style={{ pointerEvents: 'auto' }}>
                        <div style={{ marginBottom: 10 }}>{tipText}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 11, opacity: 0.6 }}>{tipMeta.index + 1} / {tipMeta.total}</span>
                            <span style={{ display: 'flex', gap: 6 }}>
                                <button
                                    onClick={endTour}
                                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
                                >
                                    Закрыть
                                </button>
                                <button
                                    onClick={() => advance()}
                                    style={{ background: '#1677ff', border: 'none', color: '#fff', borderRadius: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
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
