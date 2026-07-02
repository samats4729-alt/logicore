'use client';

import { useEffect, useState } from 'react';
import { Table, Tag, Select, Typography, message, Space, Segmented } from 'antd';
import { CustomerServiceOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

const STATUS_META: Record<string, { label: string; color: string }> = {
    NEW: { label: 'Новый', color: 'red' },
    IN_PROGRESS: { label: 'В работе', color: 'orange' },
    DONE: { label: 'Решён', color: 'green' },
    REJECTED: { label: 'Отклонён', color: 'default' },
};

const SEVERITY_META: Record<string, { label: string; color: string }> = {
    low: { label: 'Низкая', color: 'default' },
    medium: { label: 'Средняя', color: 'orange' },
    high: { label: 'Высокая', color: 'red' },
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

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.get('/assistant/support/tickets');
            setTickets(res.data || []);
        } catch {
            message.error('Не удалось загрузить обращения');
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
            message.success('Статус обновлён');
        } catch {
            message.error('Не удалось обновить статус');
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
                    <div style={{ fontSize: 11, color: '#8c8c8c' }}>{r.userName}{r.userEmail ? ` · ${r.userEmail}` : ''}</div>
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
                        <div style={{ fontSize: 11, color: '#8c8c8c' }}>Заявки: {r.orders.join(', ')}</div>
                    )}
                </div>
            ),
        },
        {
            title: 'Категория',
            dataIndex: 'category',
            key: 'category',
            width: 120,
            render: (c: string) => <Tag>{CATEGORY_LABEL[c] || c}</Tag>,
        },
        {
            title: 'Важность',
            dataIndex: 'severity',
            key: 'severity',
            width: 100,
            render: (s: string) => {
                const meta = SEVERITY_META[s] || SEVERITY_META.medium;
                return <Tag color={meta.color}>{meta.label}</Tag>;
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
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <Title level={4} style={{ margin: 0 }}>
                    <CustomerServiceOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                    Обращения в поддержку
                </Title>
                <Space>
                    <Segmented
                        value={statusFilter}
                        onChange={(v) => setStatusFilter(v as string)}
                        options={[
                            { value: 'all', label: `Все (${tickets.length})` },
                            { value: 'NEW', label: `Новые (${tickets.filter((t) => t.status === 'NEW').length})` },
                            { value: 'IN_PROGRESS', label: 'В работе' },
                            { value: 'DONE', label: 'Решённые' },
                        ]}
                    />
                </Space>
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
                            <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginBottom: 12 }}>{r.description}</Paragraph>
                            {r.details?.where && (
                                <div style={{ marginBottom: 10, fontSize: 13 }}>
                                    <Text strong>Где смотреть: </Text>
                                    <Text>{r.details.where}</Text>
                                </div>
                            )}
                            {r.details?.process && (
                                <div style={{ background: '#f6f8ff', border: '1px solid #dbe3f5', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                                    <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Бизнес-процесс</Text>
                                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.details.process}</div>
                                </div>
                            )}
                            {(r.details?.expected || r.details?.actual) && (
                                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                                    {r.details?.expected && (
                                        <div style={{ flex: 1, minWidth: 260, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12 }}>
                                            <Text strong style={{ fontSize: 12, color: '#15803d', display: 'block', marginBottom: 4 }}>Ожидается</Text>
                                            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.details.expected}</div>
                                        </div>
                                    )}
                                    {r.details?.actual && (
                                        <div style={{ flex: 1, minWidth: 260, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
                                            <Text strong style={{ fontSize: 12, color: '#b91c1c', display: 'block', marginBottom: 4 }}>Фактически</Text>
                                            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.details.actual}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {Array.isArray(r.transcript) && r.transcript.length > 0 && (
                                <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                                    <Text strong style={{ fontSize: 12 }}>Диалог с ассистентом:</Text>
                                    {r.transcript.map((m: any, i: number) => (
                                        <div key={i} style={{ fontSize: 12, margin: '6px 0', color: m.role === 'user' ? '#0958d9' : '#595959' }}>
                                            <b>{m.role === 'user' ? 'Пользователь' : 'Ассистент'}:</b> {m.content}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ),
                }}
            />
        </div>
    );
}
