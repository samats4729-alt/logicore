'use client';

import { useEffect, useState } from 'react';
import { Input, Space, Popconfirm } from 'antd';
import { RobotOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';
import nova from '@/components/nova/nova.module.css';
import styles from './updates.module.css';

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
            toast.error('Не удалось загрузить нововведения');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const res = await api.post('/assistant/updates/generate');
            toast.info(res.data?.message || 'Готово');
            load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Ошибка генерации');
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
            toast.success(
                status === 'PUBLISHED'
                    ? 'Опубликовано — гид уже в курсе'
                    : status === 'DRAFT'
                        ? 'Перенесено в черновики'
                        : 'Отклонено'
            );
            setEdits(prev => { const c = { ...prev }; delete c[u.id]; return c; });
            load();
        } catch {
            toast.error('Не удалось обновить');
        }
    };

    const drafts = updates.filter(u => u.status === 'DRAFT');
    const published = updates.filter(u => u.status === 'PUBLISHED');
    const rejected = updates.filter(u => u.status === 'REJECTED');

    /** Одна карточка анонса с правкой текста — черновик и отклонённый правятся одинаково. */
    const Editable = ({ u, actions }: { u: PlatformUpdate; actions: React.ReactNode }) => {
        const e = getEdit(u);
        return (
            <div className={styles.item} key={u.id}>
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
                <div className={styles.itemFoot}>
                    <span className={nova.itemDesc}>
                        {dayjs(u.createdAt).format('DD.MM.YYYY HH:mm')} · коммитов: {u.sourceCommits.length}
                    </span>
                    <Space>{actions}</Space>
                </div>
            </div>
        );
    };

    return (
        <div>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Нововведения</h1>
                    <p className={nova.subtitle}>
                        ИИ читает свежие коммиты разработки, отбирает заметные пользователям
                        изменения и готовит короткие анонсы. Поправьте текст и опубликуйте — гид
                        сразу узнает о нововведении и сможет рассказывать о нём людям.
                    </p>
                </div>
                <div className={nova.heroActions}>
                    <button
                        type="button"
                        className={`${nova.action} ${nova.actionPrimary}`}
                        disabled={generating}
                        onClick={handleGenerate}
                    >
                        <RobotOutlined /> Найти нововведения
                    </button>
                </div>
            </div>

            {loading ? (
                <div className={nova.empty}><Loader size="large" /></div>
            ) : (
                <>
                    <section className={nova.card}>
                        <div className={nova.cardHead}>
                            <Megaphone size={14} />
                            <h2 className={nova.cardTitle}>На подтверждении</h2>
                            {drafts.length > 0 && <span className={nova.cardCount}>{drafts.length}</span>}
                        </div>
                        <div className={nova.cardBody}>
                            {drafts.length === 0 ? (
                                <div className={nova.empty}>
                                    Черновиков нет — нажмите «Найти нововведения»
                                </div>
                            ) : drafts.map(u => (
                                <Editable
                                    key={u.id}
                                    u={u}
                                    actions={(
                                        <>
                                            <Popconfirm
                                                title="Отклонить анонс?"
                                                okText="Да"
                                                cancelText="Нет"
                                                onConfirm={() => applyStatus(u, 'REJECTED')}
                                            >
                                                <button type="button" className={`${nova.action} ${nova.actionDanger}`}>
                                                    <CloseOutlined /> Отклонить
                                                </button>
                                            </Popconfirm>
                                            <button
                                                type="button"
                                                className={`${nova.action} ${nova.actionPrimary}`}
                                                onClick={() => applyStatus(u, 'PUBLISHED')}
                                            >
                                                <CheckOutlined /> Опубликовать
                                            </button>
                                        </>
                                    )}
                                />
                            ))}
                        </div>
                    </section>

                    <section className={nova.card}>
                        <div className={nova.cardHead}>
                            <Megaphone size={14} />
                            <h2 className={nova.cardTitle}>Опубликовано</h2>
                            {published.length > 0 && <span className={nova.cardCount}>{published.length}</span>}
                        </div>
                        <div className={nova.cardBody}>
                            {published.length === 0 ? (
                                <div className={nova.empty}>Пока нет опубликованных нововведений</div>
                            ) : published.map(u => (
                                <div className={styles.item} key={u.id}>
                                    <div className={styles.published}>
                                        <div>
                                            <div className={styles.publishedTitle}>{u.title}</div>
                                            <div className={styles.publishedText}>{u.description}</div>
                                        </div>
                                        <div className={styles.publishedSide}>
                                            <span className={nova.itemDesc}>
                                                {u.publishedAt ? dayjs(u.publishedAt).format('DD.MM.YYYY HH:mm') : ''}
                                            </span>
                                            <Popconfirm
                                                title="Снять с публикации?"
                                                okText="Да"
                                                cancelText="Нет"
                                                onConfirm={() => applyStatus(u, 'REJECTED')}
                                            >
                                                <button type="button" className={`${nova.action} ${nova.actionDanger}`}>
                                                    Снять
                                                </button>
                                            </Popconfirm>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className={nova.card}>
                        <div className={nova.cardHead}>
                            <Megaphone size={14} />
                            <h2 className={nova.cardTitle}>Служебные и отклонённые</h2>
                            {rejected.length > 0 && <span className={nova.cardCount}>{rejected.length}</span>}
                        </div>
                        <div className={nova.cardBody}>
                            {rejected.length === 0 ? (
                                <div className={nova.empty}>Пока нет отклонённых или технических коммитов</div>
                            ) : rejected.map(u => (
                                <Editable
                                    key={u.id}
                                    u={u}
                                    actions={(
                                        <>
                                            <button
                                                type="button"
                                                className={nova.action}
                                                onClick={() => applyStatus(u, 'DRAFT')}
                                            >
                                                Вернуть в черновики
                                            </button>
                                            <button
                                                type="button"
                                                className={`${nova.action} ${nova.actionPrimary}`}
                                                onClick={() => applyStatus(u, 'PUBLISHED')}
                                            >
                                                <CheckOutlined /> Опубликовать
                                            </button>
                                        </>
                                    )}
                                />
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
