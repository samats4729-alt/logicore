'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Spin, message as antdMessage } from 'antd';
import { RobotOutlined, SendOutlined, CloseOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';

interface GuideAction {
    goto?: string;
    highlight?: string;
    say?: string;
}

interface ChatMsg {
    role: 'user' | 'assistant';
    content: string;
    action?: GuideAction | null;
}

interface Spotlight {
    top: number;
    left: number;
    width: number;
    height: number;
    text: string;
}

const GREETING: ChatMsg = {
    role: 'assistant',
    content: 'Привет! Я гид LogiCore. Спросите, как что сделать — например «Как создать заявку?» или «Где посмотреть взаиморасчёты?»',
};

function parseAction(text: string): { clean: string; action: GuideAction | null } {
    const match = text.match(/```action\s*([\s\S]*?)```/);
    if (!match) return { clean: text.trim(), action: null };
    let action: GuideAction | null = null;
    try {
        action = JSON.parse(match[1].trim());
    } catch {
        action = null;
    }
    const clean = text.replace(match[0], '').trim();
    return { clean, action };
}

export default function AssistantWidget() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const spotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [messages, loading, open]);

    useEffect(() => () => {
        if (spotTimer.current) clearTimeout(spotTimer.current);
    }, []);

    const highlight = (selector: string, text: string) => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) {
            if (text) antdMessage.info(text);
            return;
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            const r = el.getBoundingClientRect();
            setSpotlight({ top: r.top, left: r.left, width: r.width, height: r.height, text });
            if (spotTimer.current) clearTimeout(spotTimer.current);
            spotTimer.current = setTimeout(() => setSpotlight(null), 5000);
        }, 420);
    };

    const runAction = (action: GuideAction) => {
        if (action.goto) {
            router.push(action.goto);
            setTimeout(() => highlight(action.highlight || '[data-guide="content"]', action.say || ''), 650);
        } else if (action.highlight) {
            highlight(action.highlight, action.say || '');
        } else if (action.say) {
            antdMessage.info(action.say);
        }
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
            const res = await api.post('/assistant/chat', { messages: payload });
            const reply: string = res.data?.reply || 'Не удалось получить ответ.';
            const { clean, action } = parseAction(reply);
            setMessages((prev) => [...prev, { role: 'assistant', content: clean, action }]);
        } catch (e: any) {
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Ошибка связи с гидом. Попробуйте ещё раз.' },
            ]);
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
                        position: 'fixed',
                        right: 24,
                        bottom: 24,
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        border: 'none',
                        background: '#1677ff',
                        color: '#fff',
                        fontSize: 24,
                        cursor: 'pointer',
                        boxShadow: '0 8px 24px rgba(22,119,255,0.4)',
                        zIndex: 1600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <RobotOutlined />
                </button>
            )}

            {open && (
                <div
                    style={{
                        position: 'fixed',
                        right: 24,
                        bottom: 24,
                        width: 'min(380px, calc(100vw - 32px))',
                        height: 'min(560px, calc(100vh - 100px))',
                        background: '#fff',
                        borderRadius: 16,
                        border: '1px solid #e4e4e7',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
                        zIndex: 1600,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            background: '#1677ff',
                            color: '#fff',
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                            <RobotOutlined /> Гид LogiCore
                        </span>
                        <CloseOutlined style={{ cursor: 'pointer' }} onClick={() => setOpen(false)} />
                    </div>

                    <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
                        {messages.map((m, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                                    marginBottom: 10,
                                }}
                            >
                                <div
                                    style={{
                                        maxWidth: '85%',
                                        padding: '9px 13px',
                                        borderRadius: 12,
                                        fontSize: 13.5,
                                        lineHeight: 1.5,
                                        whiteSpace: 'pre-wrap',
                                        background: m.role === 'user' ? '#1677ff' : '#fff',
                                        color: m.role === 'user' ? '#fff' : '#0f172a',
                                        border: m.role === 'user' ? 'none' : '1px solid #e4e4e7',
                                    }}
                                >
                                    {m.content}
                                    {m.action?.goto && (
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={<ArrowRightOutlined />}
                                            onClick={() => runAction(m.action!)}
                                            style={{ marginTop: 10, display: 'block' }}
                                        >
                                            Показать
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
                            onPressEnter={(e) => {
                                if (!e.shiftKey) {
                                    e.preventDefault();
                                    send();
                                }
                            }}
                            placeholder="Спросите, как что сделать…"
                            autoSize={{ minRows: 1, maxRows: 3 }}
                            style={{ flex: 1, resize: 'none' }}
                        />
                        <Button type="primary" icon={<SendOutlined />} onClick={send} loading={loading} />
                    </div>
                </div>
            )}

            {spotlight && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1500, pointerEvents: 'none' }}>
                    <div
                        style={{
                            position: 'absolute',
                            top: spotlight.top - 6,
                            left: spotlight.left - 6,
                            width: spotlight.width + 12,
                            height: spotlight.height + 12,
                            borderRadius: 12,
                            boxShadow: '0 0 0 9999px rgba(2,6,23,0.55)',
                            border: '2px solid #1677ff',
                            transition: 'all 0.3s ease',
                        }}
                    />
                    {spotlight.text && (
                        <div
                            style={{
                                position: 'absolute',
                                top: Math.min(spotlight.top + spotlight.height + 14, window.innerHeight - 80),
                                left: Math.min(spotlight.left, window.innerWidth - 320),
                                maxWidth: 300,
                                background: '#0b1220',
                                color: '#fff',
                                padding: '10px 14px',
                                borderRadius: 10,
                                fontSize: 13,
                                border: '1px solid #1677ff',
                            }}
                        >
                            {spotlight.text}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
