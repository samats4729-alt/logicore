'use client';

import { useEffect, useState } from 'react';
import { Table, Select, Space, Button, Tooltip } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { Headset } from 'lucide-react';
import { api } from '@/lib/api';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import nova from '@/components/nova/nova.module.css';
import styles from './support.module.css';

const STATUS_META: Record<string, { label: string }> = {
    NEW: { label: 'Новый' },
    IN_PROGRESS: { label: 'В работе' },
    DONE: { label: 'Решён' },
    REJECTED: { label: 'Отклонён' },
};

/** Важность — единственное, что здесь стоит красить: по ней выбирают, за что браться. */
const SEVERITY_META: Record<string, { label: string; chip?: 'warn' | 'neg' }> = {
    low: { label: 'Низкая' },
    medium: { label: 'Средняя', chip: 'warn' },
    high: { label: 'Высокая', chip: 'neg' },
};

const CATEGORY_LABEL: Record<string, string> = {
    finance: 'Финансы',
    orders: 'Заявки',
    documents: 'Документы',
    display: 'Отображение',
    other: 'Другое',
};

export default function AdminSupportPage() {
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [resending, setResending] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.get('/assistant/support/tickets');
            setTickets(res.data || []);
        } catch {
            toast.error('Не удалось загрузить обращения');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const updateStatus = async (id: string, status: string) => {
        try {
            await api.patch(`/assistant/support/tickets/${id}`, { status });
            setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
            toast.success('Статус обновлён');
        } catch {
            toast.error('Не удалось обновить статус');
        }
    };

    // Не уходило в телеграм — значит либо обращение старше самой отправки,
    // либо мессенджер тогда не ответил. И то и другое чинится досылом.
    const pending = tickets.filter((t) => !t.telegramSentAt);

    const resendAll = async () => {
        setResending(true);
        try {
            const res = await api.post('/assistant/support/telegram/resend', { limit: 50 });
            const { sent, failed, left } = res.data || {};
            if (sent > 0) {
                toast.success(
                    `Отправлено в телеграм: ${sent}` +
                    (left > 0 ? `. Осталось ${left} — нажмите ещё раз.` : ''),
                );
            } else {
                toast.warning('Ничего не отправилось — проверьте настройки бота.');
            }
            if (failed > 0) toast.warning(`Не дошло: ${failed}. Их можно отправить повторно.`);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось отправить в телеграм');
        } finally {
            setResending(false);
        }
    };

    const resendOne = async (id: string) => {
        try {
            const res = await api.post(`/assistant/support/tickets/${id}/telegram`);
            if (res.data?.sent) {
                toast.success('Отправлено в телеграм');
                setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, telegramSentAt: new Date().toISOString() } : t)));
            } else {
                toast.warning('Телеграм не принял сообщение');
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось отправить в телеграм');
        }
    };

    const filtered = statusFilter === 'all' ? tickets : tickets.filter((t) => t.status === statusFilter);

    const columns = [
        {
            title: 'Дата',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 130,
            render: (d: string) => <span style={{ fontSize: 12 }}>{dayjs(d).format('DD.MM.YYYY HH:mm')}</span>,
        },
        {
            title: 'Компания / пользователь',
            key: 'who',
            width: 200,
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{r.companyName}</div>
                    <div style={{ fontSize: 11, color: 'var(--nova-fg-3)' }}>{r.userName}{r.userEmail ? ` · ${r.userEmail}` : ''}</div>
                </div>
            ),
        },
        {
            title: 'Проблема',
            dataIndex: 'title',
            key: 'title',
            render: (t: string, r: any) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div>
                    {r.orders?.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--nova-fg-3)' }}>Заявки: {r.orders.join(', ')}</div>
                    )}
                </div>
            ),
        },
        {
            title: 'Категория',
            dataIndex: 'category',
            key: 'category',
            width: 120,
            render: (c: string) => <span className={nova.chip}>{CATEGORY_LABEL[c] || c}</span>,
        },
        {
            title: 'Важность',
            dataIndex: 'severity',
            key: 'severity',
            width: 100,
            render: (s: string) => {
                const meta = SEVERITY_META[s] || SEVERITY_META.medium;
                return (
                    <span className={`${nova.chip}${
                        meta.chip === 'neg' ? ` ${nova.chipNeg}` : meta.chip === 'warn' ? ` ${nova.chipWarn}` : ''
                    }`}>
                        {meta.label}
                    </span>
                );
            },
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 150,
            render: (s: string, r: any) => (
                <Select
                    size="small"
                    value={s}
                    style={{ width: 130 }}
                    onChange={(v) => updateStatus(r.id, v)}
                    options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
                />
            ),
        },
        {
            title: 'Телеграм',
            key: 'telegram',
            width: 110,
            align: 'center' as const,
            render: (_: any, r: any) =>
                r.telegramSentAt ? (
                    <Tooltip title={`Отправлено ${dayjs(r.telegramSentAt).format('DD.MM.YYYY HH:mm')}. Нажмите, чтобы прислать ещё раз.`}>
                        <Button size="small" type="text" icon={<SendOutlined />} onClick={() => resendOne(r.id)}>
                            <span className={nova.valuePos} style={{ fontSize: 12 }}>Ушло</span>
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip title="В телеграм не уходило — отправить сейчас">
                        <Button size="small" icon={<SendOutlined />} onClick={() => resendOne(r.id)}>
                            Отправить
                        </Button>
                    </Tooltip>
                ),
        },
    ];

    return (
        <div>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Обращения в поддержку</h1>
                    <p className={nova.subtitle}>
                        Что не сработало у людей в кабинетах. Обращение приходит из ассистента и
                        дублируется в телеграм — здесь видно, дошло оно или нет.
                    </p>
                </div>
                <div className={nova.heroActions}>
                    {pending.length > 0 && (
                        <Tooltip title="Отправит в телеграм всё, что туда ещё не уходило — от старых к новым, по 50 за раз">
                            <button
                                type="button"
                                className={`${nova.action} ${nova.actionPrimary}`}
                                disabled={resending}
                                onClick={resendAll}
                            >
                                <SendOutlined /> Отправить в телеграм ({pending.length})
                            </button>
                        </Tooltip>
                    )}
                </div>
            </div>

            <div className={nova.pills} style={{ marginBottom: 14 }} role="tablist">
                {[
                    { value: 'all', label: `Все (${tickets.length})` },
                    { value: 'NEW', label: `Новые (${tickets.filter((t) => t.status === 'NEW').length})` },
                    { value: 'IN_PROGRESS', label: 'В работе' },
                    { value: 'DONE', label: 'Решённые' },
                ].map((tab) => (
                    <button
                        key={tab.value}
                        type="button"
                        role="tab"
                        aria-selected={statusFilter === tab.value}
                        className={`${nova.pill} ${statusFilter === tab.value ? nova.pillActive : ''}`}
                        onClick={() => setStatusFilter(tab.value)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <Headset size={14} />
                    <h2 className={nova.cardTitle}>Обращения</h2>
                    {filtered.length > 0 && <span className={nova.cardCount}>{filtered.length}</span>}
                </div>
            <Table
                dataSource={filtered}
                columns={columns}
                rowKey="id"
                loading={loading}
                size="middle"
                pagination={{ pageSize: 20 }}
                expandable={{
                    expandedRowRender: (r: any) => (
                        <div style={{ maxWidth: 900 }}>
                            <div className={styles.note}>{r.description}</div>
                            {r.details?.where && (
                                <div className={styles.note}>
                                    <span className={styles.noteCap}>Где смотреть</span>
                                    {r.details.where}
                                </div>
                            )}
                            {r.details?.process && (
                                <div className={styles.note}>
                                    <span className={styles.noteCap}>Бизнес-процесс</span>
                                    {r.details.process}
                                </div>
                            )}
                            {(r.details?.expected || r.details?.actual) && (
                                <div className={styles.pair}>
                                    {r.details?.expected && (
                                        <div className={`${styles.note} ${styles.noteGood}`}>
                                            <span className={styles.noteCap}>Ожидается</span>
                                            {r.details.expected}
                                        </div>
                                    )}
                                    {r.details?.actual && (
                                        <div className={`${styles.note} ${styles.noteBad}`}>
                                            <span className={styles.noteCap}>Фактически</span>
                                            {r.details.actual}
                                        </div>
                                    )}
                                </div>
                            )}
                            {Array.isArray(r.transcript) && r.transcript.length > 0 && (
                                <div className={styles.dialog}>
                                    <span className={styles.noteCap}>Диалог с ассистентом</span>
                                    {r.transcript.map((m: any, i: number) => (
                                        <div
                                            key={i}
                                            className={`${styles.line}${m.role === 'user' ? ` ${styles.lineUser}` : ''}`}
                                        >
                                            <b>{m.role === 'user' ? 'Пользователь' : 'Ассистент'}:</b> {m.content}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ),
                }}
                />
            </section>
        </div>
    );
}
