'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input, Tag, Typography, message, Space, Empty, Spin, Popconfirm } from 'antd';
import { NotificationOutlined, RobotOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface PlatformUpdate {
    id: string;
    title: string;
    description: string;
    status: string;
    createdAt: string;
    publishedAt?: string;
    sourceCommits: string[];
}

export default function AdminUpdatesPage() {
    const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [edits, setEdits] = useState<Record<string, { title: string; description: string }>>({});

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.get('/assistant/updates');
            setUpdates(res.data || []);
        } catch {
            message.error('Не удалось загрузить нововведения');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const res = await api.post('/assistant/updates/generate');
            message.info(res.data?.message || 'Готово');
            load();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка генерации');
        } finally {
            setGenerating(false);
        }
    };

    const getEdit = (u: PlatformUpdate) => edits[u.id] || { title: u.title, description: u.description };

    const setEdit = (id: string, patch: Partial<{ title: string; description: string }>) => {
        setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || { title: '', description: '' }), ...patch } }));
    };

    const applyStatus = async (u: PlatformUpdate, status: 'PUBLISHED' | 'REJECTED' | 'DRAFT') => {
        try {
            const e = getEdit(u);
            await api.patch(`/assistant/updates/${u.id}`, {
                title: e.title,
                description: e.description,
                status,
            });
            message.success(
                status === 'PUBLISHED'
                    ? 'Опубликовано — гид уже в курсе'
                    : status === 'DRAFT'
                        ? 'Перенесено в черновики'
                        : 'Отклонено'
            );
            setEdits(prev => { const c = { ...prev }; delete c[u.id]; return c; });
            load();
        } catch {
            message.error('Не удалось обновить');
        }
    };

    const drafts = updates.filter(u => u.status === 'DRAFT');
    const published = updates.filter(u => u.status === 'PUBLISHED');
    const rejected = updates.filter(u => u.status === 'REJECTED');

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <Title level={4} style={{ margin: 0 }}>
                    <NotificationOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                    Нововведения платформы
                </Title>
                <Button type="primary" icon={<RobotOutlined />} loading={generating} onClick={handleGenerate}>
                    Найти нововведения (ИИ)
                </Button>
            </div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 20, fontSize: 13 }}>
                ИИ читает свежие коммиты разработки, отбирает заметные пользователям изменения и готовит короткие анонсы.
                Отредактируйте текст при необходимости и опубликуйте — ИИ-гид сразу узнает о нововведениях и сможет рассказывать о них пользователям.
            </Text>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
            ) : (
                <>
                    <Title level={5} style={{ marginBottom: 12 }}>На подтверждении ({drafts.length})</Title>
                    {drafts.length === 0 ? (
                        <Empty description="Черновиков нет — нажмите «Найти нововведения»" style={{ margin: '24px 0 36px' }} />
                    ) : (
                        <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 32 }}>
                            {drafts.map(u => {
                                const e = getEdit(u);
                                return (
                                    <Card key={u.id} size="small" style={{ borderColor: '#c6dcff' }}>
                                        <Input
                                            value={e.title}
                                            onChange={ev => setEdit(u.id, { title: ev.target.value })}
                                            style={{ fontWeight: 600, marginBottom: 8 }}
                                            maxLength={120}
                                        />
                                        <TextArea
                                            value={e.description}
                                            onChange={ev => setEdit(u.id, { description: ev.target.value })}
                                            autoSize={{ minRows: 2, maxRows: 5 }}
                                            style={{ marginBottom: 10 }}
                                            maxLength={2000}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {dayjs(u.createdAt).format('DD.MM.YYYY HH:mm')} · коммитов: {u.sourceCommits.length}
                                            </Text>
                                            <Space>
                                                <Popconfirm title="Отклонить анонс?" okText="Да" cancelText="Нет" onConfirm={() => applyStatus(u, 'REJECTED')}>
                                                    <Button size="small" danger icon={<CloseOutlined />}>Отклонить</Button>
                                                </Popconfirm>
                                                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => applyStatus(u, 'PUBLISHED')}>
                                                    Опубликовать
                                                </Button>
                                            </Space>
                                        </div>
                                    </Card>
                                );
                            })}
                        </Space>
                    )}

                    <Title level={5} style={{ marginBottom: 12 }}>Опубликовано ({published.length})</Title>
                    {published.length === 0 ? (
                        <Empty description="Пока нет опубликованных нововведений" style={{ marginBottom: 24 }} />
                    ) : (
                        <Space direction="vertical" size={10} style={{ width: '100%', marginBottom: 24 }}>
                            {published.map(u => (
                                <Card key={u.id} size="small">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1, minWidth: 240 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                                {u.title} <Tag color="green" style={{ marginLeft: 6 }}>Опубликовано</Tag>
                                            </div>
                                            <div style={{ fontSize: 13, color: '#595959' }}>{u.description}</div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {u.publishedAt ? dayjs(u.publishedAt).format('DD.MM.YYYY HH:mm') : ''}
                                            </Text>
                                            <Popconfirm title="Снять с публикации?" okText="Да" cancelText="Нет" onConfirm={() => applyStatus(u, 'REJECTED')}>
                                                <Button size="small" type="text" danger>Снять</Button>
                                            </Popconfirm>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </Space>
                    )}

                    <Title level={5} style={{ marginBottom: 12 }}>Служебные и отклонённые изменения ({rejected.length})</Title>
                    {rejected.length === 0 ? (
                        <Empty description="Пока нет отклонённых или технических коммитов" />
                    ) : (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            {rejected.map(u => {
                                const e = getEdit(u);
                                return (
                                    <Card key={u.id} size="small" style={{ borderColor: '#f0f0f0', background: '#fafafa' }}>
                                        <Input
                                            value={e.title}
                                            onChange={ev => setEdit(u.id, { title: ev.target.value })}
                                            style={{ fontWeight: 600, marginBottom: 8, background: '#fff' }}
                                            maxLength={120}
                                        />
                                        <TextArea
                                            value={e.description}
                                            onChange={ev => setEdit(u.id, { description: ev.target.value })}
                                            autoSize={{ minRows: 2, maxRows: 5 }}
                                            style={{ marginBottom: 10, background: '#fff' }}
                                            maxLength={2000}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {dayjs(u.createdAt).format('DD.MM.YYYY HH:mm')} · коммитов: {u.sourceCommits.length}
                                            </Text>
                                            <Space>
                                                <Button size="small" icon={<CheckOutlined />} onClick={() => applyStatus(u, 'DRAFT')}>
                                                    Вернуть в черновики
                                                </Button>
                                                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => applyStatus(u, 'PUBLISHED')}>
                                                    Опубликовать
                                                </Button>
                                            </Space>
                                        </div>
                                    </Card>
                                );
                            })}
                        </Space>
                    )}
                </>
            )}
        </div>
    );
}
