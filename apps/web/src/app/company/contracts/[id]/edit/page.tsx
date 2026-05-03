'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    Card, Button, Input, message, Typography, Collapse,
    Space, Spin, Popconfirm, Tooltip, Alert
} from 'antd';
import {
    SaveOutlined, UndoOutlined, ArrowLeftOutlined,
    PlusOutlined, DeleteOutlined, EditOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useParams, useRouter } from 'next/navigation';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { TextArea } = Input;

interface ContractParagraph {
    number: string;
    text: string;
}

interface ContractArticle {
    title: string;
    paragraphs: ContractParagraph[];
}

export default function EditContractContentPage() {
    const params = useParams();
    const router = useRouter();
    const contractId = params.id as string;
    const { token } = useAuthStore();

    const [articles, setArticles] = useState<ContractArticle[]>([]);
    const [contractNumber, setContractNumber] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Ensure auth header is set
    useEffect(() => {
        if (token) {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
    }, [token]);

    const fetchContent = useCallback(async () => {
        if (!token) return;
        try {
            setLoading(true);
            const contentRes = await api.get(`/contracts/${contractId}/content`);
            setArticles(contentRes.data as ContractArticle[]);

            // Try to get contract number from content endpoint or contracts list
            try {
                const contractRes = await api.get(`/contracts/${contractId}`);
                setContractNumber(contractRes.data.contractNumber);
            } catch {
                // Contract number is not critical, continue without it
            }

            setHasChanges(false);
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка загрузки содержимого договора');
        } finally {
            setLoading(false);
        }
    }, [contractId, token]);

    useEffect(() => { fetchContent(); }, [fetchContent]);

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.put(`/contracts/${contractId}/content`, { content: articles });
            message.success('Текст договора сохранён');
            setHasChanges(false);
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        try {
            setSaving(true);
            await api.post(`/contracts/${contractId}/reset-content`);
            message.success('Текст сброшен к шаблону по умолчанию');
            await fetchContent();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка сброса');
        } finally {
            setSaving(false);
        }
    };

    // ============ Article-level operations ============

    const updateArticleTitle = (idx: number, title: string) => {
        const updated = [...articles];
        updated[idx] = { ...updated[idx], title };
        setArticles(updated);
        setHasChanges(true);
    };

    const addArticle = () => {
        const num = articles.length + 1;
        setArticles([...articles, { title: `${num}. Новая статья`, paragraphs: [{ number: `${num}.1.`, text: '' }] }]);
        setHasChanges(true);
    };

    const removeArticle = (idx: number) => {
        setArticles(articles.filter((_, i) => i !== idx));
        setHasChanges(true);
    };

    // ============ Paragraph-level operations ============

    const updateParagraphText = (articleIdx: number, paraIdx: number, text: string) => {
        const updated = [...articles];
        const paras = [...updated[articleIdx].paragraphs];
        paras[paraIdx] = { ...paras[paraIdx], text };
        updated[articleIdx] = { ...updated[articleIdx], paragraphs: paras };
        setArticles(updated);
        setHasChanges(true);
    };

    const updateParagraphNumber = (articleIdx: number, paraIdx: number, number: string) => {
        const updated = [...articles];
        const paras = [...updated[articleIdx].paragraphs];
        paras[paraIdx] = { ...paras[paraIdx], number };
        updated[articleIdx] = { ...updated[articleIdx], paragraphs: paras };
        setArticles(updated);
        setHasChanges(true);
    };

    const addParagraph = (articleIdx: number) => {
        const updated = [...articles];
        const paras = [...updated[articleIdx].paragraphs];
        const lastNumber = paras.length > 0 ? paras[paras.length - 1].number : '';
        const match = lastNumber.match(/^(\d+\.\d+)\./);
        let newNum = '';
        if (match) {
            const parts = match[1].split('.');
            const major = parts[0];
            const minor = parseInt(parts[1]) + 1;
            newNum = `${major}.${minor}.`;
        }
        paras.push({ number: newNum, text: '' });
        updated[articleIdx] = { ...updated[articleIdx], paragraphs: paras };
        setArticles(updated);
        setHasChanges(true);
    };

    const removeParagraph = (articleIdx: number, paraIdx: number) => {
        const updated = [...articles];
        updated[articleIdx] = {
            ...updated[articleIdx],
            paragraphs: updated[articleIdx].paragraphs.filter((_, i) => i !== paraIdx),
        };
        setArticles(updated);
        setHasChanges(true);
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <Spin size="large" tip="Загрузка содержимого договора..." />
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <Space>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
                        Назад
                    </Button>
                    <Title level={3} style={{ margin: 0 }}>
                        <EditOutlined /> Редактирование договора {contractNumber ? `№${contractNumber}` : ''}
                    </Title>
                </Space>
                <Space>
                    <Popconfirm
                        title="Сбросить текст к шаблону по умолчанию?"
                        description="Все ваши изменения будут потеряны."
                        onConfirm={handleReset}
                        okText="Да, сбросить"
                        cancelText="Отмена"
                    >
                        <Button icon={<UndoOutlined />} danger loading={saving}>
                            Сбросить к шаблону
                        </Button>
                    </Popconfirm>
                    <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={handleSave}
                        loading={saving}
                        disabled={!hasChanges}
                        size="large"
                    >
                        Сохранить
                    </Button>
                </Space>
            </div>

            {hasChanges && (
                <Alert
                    message="Есть несохранённые изменения"
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            {/* Articles */}
            <Collapse
                defaultActiveKey={articles.map((_, i) => String(i))}
                style={{ background: '#fafafa' }}
            >
                {articles.map((article, articleIdx) => (
                    <Panel
                        key={String(articleIdx)}
                        header={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                <Input
                                    value={article.title}
                                    onChange={(e) => updateArticleTitle(articleIdx, e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ fontWeight: 'bold', flex: 1 }}
                                    size="small"
                                />
                                <Tooltip title="Удалить статью">
                                    <Popconfirm
                                        title="Удалить эту статью?"
                                        onConfirm={(e) => { e?.stopPropagation(); removeArticle(articleIdx); }}
                                        onCancel={(e) => e?.stopPropagation()}
                                        okText="Да"
                                        cancelText="Нет"
                                    >
                                        <Button
                                            type="text"
                                            danger
                                            icon={<DeleteOutlined />}
                                            size="small"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </Popconfirm>
                                </Tooltip>
                            </div>
                        }
                    >
                        {article.paragraphs.map((para, paraIdx) => (
                            <div
                                key={paraIdx}
                                style={{
                                    display: 'flex',
                                    gap: 8,
                                    marginBottom: 12,
                                    alignItems: 'flex-start',
                                }}
                            >
                                <Input
                                    value={para.number}
                                    onChange={(e) => updateParagraphNumber(articleIdx, paraIdx, e.target.value)}
                                    style={{ width: 80, flexShrink: 0, fontWeight: 600 }}
                                    size="small"
                                />
                                <TextArea
                                    value={para.text}
                                    onChange={(e) => updateParagraphText(articleIdx, paraIdx, e.target.value)}
                                    autoSize={{ minRows: 1, maxRows: 10 }}
                                    style={{ flex: 1 }}
                                />
                                <Tooltip title="Удалить пункт">
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        size="small"
                                        onClick={() => removeParagraph(articleIdx, paraIdx)}
                                    />
                                </Tooltip>
                            </div>
                        ))}
                        <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => addParagraph(articleIdx)}
                            block
                            size="small"
                        >
                            Добавить пункт
                        </Button>
                    </Panel>
                ))}
            </Collapse>

            {/* Add article button */}
            <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={addArticle}
                block
                style={{ marginTop: 16, height: 48 }}
            >
                Добавить статью
            </Button>

            {/* Bottom save bar */}
            {hasChanges && (
                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: '#fff',
                    borderTop: '1px solid #f0f0f0',
                    padding: '12px 24px',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
                    zIndex: 1000,
                }}>
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} size="large">
                        Сохранить изменения
                    </Button>
                </div>
            )}
        </div>
    );
}
