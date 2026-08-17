'use client';

import { useEffect, useState } from 'react';
import { Input, Select, Button } from 'antd';
import { LifeBuoy, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { loadOrReport } from '@/lib/load';
import nova from '@/components/nova/nova.module.css';
import styles from './support.module.css';

/**
 * Поддержка: письмо владельцу платформы и ответ на него.
 *
 * Раньше обращение писалось внутри ИИ-помощника и уходило в никуда с точки
 * зрения человека: письмо улетало владельцу в телеграм, а на экране
 * оставалось «принято». Ни своих писем, ни ответа компания не видела —
 * значит и написать второй раз было проще, чем найти первое.
 *
 * Здесь всё на одной странице: слева письмо, справа переписка. Помощник ни
 * при чём — он подсказывает по платформе, а это разговор с людьми.
 */

interface Ticket {
    id: string;
    title: string;
    category: string;
    severity: string;
    description: string;
    status: string;
    answer?: string | null;
    answeredAt?: string | null;
    userName: string;
    createdAt: string;
}

const CATEGORIES = [
    { value: 'orders', label: 'Заявки и рейсы' },
    { value: 'finance', label: 'Деньги и документы' },
    { value: 'display', label: 'Что-то отображается неверно' },
    { value: 'access', label: 'Доступы и сотрудники' },
    { value: 'other', label: 'Другое' },
];

const SEVERITY = [
    { value: 'low', label: 'Не срочно' },
    { value: 'medium', label: 'Мешает работать' },
    { value: 'high', label: 'Всё встало' },
];

const STATUS_LABELS: Record<string, string> = {
    NEW: 'Отправлено',
    IN_PROGRESS: 'В работе',
    DONE: 'Решено',
    REJECTED: 'Отклонено',
};

const when = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export default function SupportPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('other');
    const [severity, setSeverity] = useState('medium');
    const [description, setDescription] = useState('');

    const load = async () => {
        const res = await loadOrReport('обращения в поддержку', () => api.get('/assistant/support/my'));
        setTickets(res?.data || []);
        setLoading(false);
    };

    useEffect(() => { void load(); }, []);

    const send = async () => {
        if (!title.trim()) return toast.warning('Напишите, о чём письмо');
        if (description.trim().length < 10) return toast.warning('Опишите подробнее — по одной строке не разобраться');

        setSending(true);
        try {
            await api.post('/assistant/support/ticket', {
                title: title.trim(),
                category,
                severity,
                description: description.trim(),
            });
            toast.success('Письмо отправлено. Ответ появится здесь же');
            setTitle('');
            setDescription('');
            setSeverity('medium');
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось отправить письмо');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className={nova.page}>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Поддержка</h1>
                    <p className={nova.subtitle}>
                        Напишите, что не работает или чего не хватает. Ответ придёт сюда же — и в уведомления.
                    </p>
                </div>
            </div>

            <div className={styles.columns}>
                <section className={nova.card}>
                    <div className={nova.cardHead}>
                        <LifeBuoy size={14} />
                        <h2 className={nova.cardTitle}>Новое письмо</h2>
                    </div>

                    <div className={styles.form}>
                        <label className={styles.field}>
                            <span className={styles.label}>О чём письмо</span>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Например: не печатается договор-заявка"
                                maxLength={120}
                            />
                        </label>

                        <div className={styles.row}>
                            <label className={styles.field}>
                                <span className={styles.label}>Раздел</span>
                                <Select value={category} onChange={setCategory} options={CATEGORIES} />
                            </label>
                            <label className={styles.field}>
                                <span className={styles.label}>Насколько срочно</span>
                                <Select value={severity} onChange={setSeverity} options={SEVERITY} />
                            </label>
                        </div>

                        <label className={styles.field}>
                            <span className={styles.label}>Что произошло</span>
                            <Input.TextArea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={'Что делали, что ожидали увидеть и что увидели.\nЕсли дело в конкретном рейсе — напишите его номер.'}
                                autoSize={{ minRows: 6, maxRows: 14 }}
                                maxLength={4000}
                            />
                        </label>

                        <Button type="primary" onClick={send} loading={sending} icon={<Send size={14} />}>
                            Отправить
                        </Button>
                    </div>
                </section>

                <section className={nova.card}>
                    <div className={nova.cardHead}>
                        <h2 className={nova.cardTitle}>Мои обращения</h2>
                        {tickets.length > 0 && <span className={nova.chip}>{tickets.length}</span>}
                    </div>

                    {loading ? (
                        <div className={nova.empty}>Загружаем…</div>
                    ) : tickets.length === 0 ? (
                        <div className={nova.empty}>Писем пока не было</div>
                    ) : (
                        <div className={styles.list}>
                            {tickets.map((ticket) => (
                                <article key={ticket.id} className={styles.ticket}>
                                    <div className={styles.ticketHead}>
                                        <span className={styles.ticketTitle}>{ticket.title}</span>
                                        <span className={`${nova.chip}${ticket.status === 'DONE' ? ` ${nova.chipWarn}` : ''}`}>
                                            {STATUS_LABELS[ticket.status] || ticket.status}
                                        </span>
                                    </div>
                                    <div className={styles.meta}>
                                        {when(ticket.createdAt)} · {ticket.userName}
                                    </div>
                                    <p className={styles.text}>{ticket.description}</p>

                                    {ticket.answer ? (
                                        <div className={styles.answer}>
                                            <div className={styles.answerLabel}>
                                                Ответ поддержки{ticket.answeredAt ? ` · ${when(ticket.answeredAt)}` : ''}
                                            </div>
                                            <p className={styles.text}>{ticket.answer}</p>
                                        </div>
                                    ) : (
                                        <div className={styles.waiting}>Ждём ответа</div>
                                    )}
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
