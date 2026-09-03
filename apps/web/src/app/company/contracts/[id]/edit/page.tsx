'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Input, Typography, Collapse, Space, Popconfirm, Tooltip, Alert } from 'antd';
import {
    SaveOutlined, UndoOutlined, ArrowLeftOutlined,
    PlusOutlined, DeleteOutlined, EditOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { TextArea } = Input;

interface ContractParagraph {
    number: string;
    text: string;
}

/**
 * Реквизиты сторон — две половины страницы, а не сплошной текст.
 *
 * Пока такого блока не было, реквизиты вписывали в обычный пункт, и обе
 * стороны сваливались в одно поле: где кончается экспедитор и начинается
 * заказчик, в готовом договоре было не разобрать.
 */
interface ContractRequisites {
    /** Левая половина — экспедитор. */
    left: string;
    /** Правая половина — заказчик. */
    right: string;
}

interface ContractArticle {
    title: string;
    paragraphs: ContractParagraph[];
    /** Заполнено — статья печатается двумя колонками, а не списком пунктов. */
    requisites?: ContractRequisites;
}

export default function EditContractContentPage() {
    const params = useParams();
    const router = useRouter();
    const contractId = params.id as string;

    const [articles, setArticles] = useState<ContractArticle[]>([]);
    const [contractNumber, setContractNumber] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    /**
     * Какие статьи раскрыты.
     *
     * Раскрытые панели были заданы один раз при первой отрисовке, и
     * добавленная статья появлялась свёрнутой: человек нажимал кнопку и
     * не видел ничего. Поэтому состояние теперь своё, и новая статья
     * открывается сразу.
     */
    const [openKeys, setOpenKeys] = useState<string[]>([]);

    const fetchContent = useCallback(async () => {
        try {
            setLoading(true);
            const contentRes = await api.get(`/contracts/${contractId}/content`);
            const загруженные = contentRes.data as ContractArticle[];
            setArticles(загруженные);
            setOpenKeys(загруженные.map((_, i) => String(i)));

            // Try to get contract number from content endpoint or contracts list
            try {
                const contractRes = await api.get(`/contracts/${contractId}`);
                setContractNumber(contractRes.data.contractNumber);
            } catch {
                // Contract number is not critical, continue without it
            }

            setHasChanges(false);
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Ошибка загрузки содержимого договора');
        } finally {
            setLoading(false);
        }
    }, [contractId]);

    useEffect(() => { fetchContent(); }, [fetchContent]);

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.put(`/contracts/${contractId}/content`, { content: articles });
            toast.success('Текст договора сохранён');
            setHasChanges(false);
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        try {
            setSaving(true);
            await api.post(`/contracts/${contractId}/reset-content`);
            toast.success('Текст сброшен к шаблону по умолчанию');
            await fetchContent();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Ошибка сброса');
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
        setOpenKeys([...openKeys, String(articles.length)]);
        setHasChanges(true);
    };

    const removeArticle = (idx: number) => {
        setArticles(articles.filter((_, i) => i !== idx));
        setHasChanges(true);
    };

    /** Есть ли уже статья с реквизитами: вторая такая договору не нужна. */
    const реквизитыЕсть = articles.some((a) => a.requisites);

    /**
     * Добавить статью с реквизитами.
     *
     * Обе колонки заранее заполняются из карточек компаний: перепечатывать
     * банковские реквизиты руками — это лишний повод ошибиться в счёте.
     * Текст остаётся обычным, его правят как угодно.
     */
    const addRequisites = async () => {
        let заготовка: ContractRequisites = { left: '', right: '' };
        try {
            const { data } = await api.get(`/contracts/${contractId}/requisites-draft`);
            заготовка = { left: data?.left || '', right: data?.right || '' };
        } catch {
            // Не подтянулось — не беда: две пустые колонки лучше, чем
            // отказ добавить блок.
        }
        setArticles([...articles, {
            title: `${articles.length + 1}. Юридические адреса и реквизиты сторон`,
            paragraphs: [],
            requisites: заготовка,
        }]);
        setOpenKeys([...openKeys, String(articles.length)]);
        setHasChanges(true);
    };

    const updateRequisites = (idx: number, сторона: keyof ContractRequisites, text: string) => {
        const updated = [...articles];
        const прежние = updated[idx].requisites || { left: '', right: '' };
        updated[idx] = { ...updated[idx], requisites: { ...прежние, [сторона]: text } };
        setArticles(updated);
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
                <Loader size="large" tip="Загрузка содержимого договора..." />
            </div>
        );
    }

    return (
        <div className="lc-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginBottom: 8 }}>
                        Назад
                    </Button>
                    <div className="lc-eyebrow">Справочники · Договоры</div>
                    <h1 className="lc2-title">
                        <EditOutlined style={{ marginRight: 8 }} />
                        {contractNumber ? `Договор №${contractNumber}` : 'Редактирование договора'}
                    </h1>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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
                    >
                        Сохранить
                    </Button>
                </div>
            </div>

            {hasChanges && (
                <Alert
                    message="Есть несохранённые изменения"
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            {/* ===== EDITOR CARD ===== */}
            <div className="lc-card" style={{ padding: '24px', marginTop: 0 }}>
            {/* Articles */}
            <Collapse
                activeKey={openKeys}
                onChange={(k) => setOpenKeys(Array.isArray(k) ? k as string[] : [k as string])}
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
                        {article.requisites ? (
                            /* Две ячейки вместо одного поля: слева экспедитор,
                               справа заказчик. Ровно так реквизиты и стоят в
                               бумажном договоре, и ровно так они печатаются
                               в PDF — половина страницы на сторону. */
                            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text strong style={{ display: 'block', marginBottom: 6 }}>
                                        ЭКСПЕДИТОР
                                    </Text>
                                    <TextArea
                                        value={article.requisites.left}
                                        onChange={(e) => updateRequisites(articleIdx, 'left', e.target.value)}
                                        autoSize={{ minRows: 8, maxRows: 24 }}
                                        placeholder="Название, юр. адрес, БИН, банк, счёт, директор"
                                    />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text strong style={{ display: 'block', marginBottom: 6 }}>
                                        ЗАКАЗЧИК
                                    </Text>
                                    <TextArea
                                        value={article.requisites.right}
                                        onChange={(e) => updateRequisites(articleIdx, 'right', e.target.value)}
                                        autoSize={{ minRows: 8, maxRows: 24 }}
                                        placeholder="Название, юр. адрес, БИН, банк, счёт, директор"
                                    />
                                </div>
                            </div>
                        ) : article.paragraphs.map((para, paraIdx) => (
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
                        {!article.requisites && (
                            <Button
                                type="dashed"
                                icon={<PlusOutlined />}
                                onClick={() => addParagraph(articleIdx)}
                                block
                                size="small"
                            >
                                Добавить пункт
                            </Button>
                        )}
                    </Panel>
                ))}
            </Collapse>

            {/* Add article button */}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={addArticle}
                    block
                    style={{ height: 48 }}
                >
                    Добавить статью
                </Button>
                {/* Отдельная кнопка, а не «ещё одна статья»: у реквизитов
                    свой вид — две колонки, и пунктов внутри не бывает.
                    Второй такой блок договору не нужен, поэтому после
                    добавления кнопка исчезает. */}
                {!реквизитыЕсть && (
                    <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={addRequisites}
                        block
                        style={{ height: 48 }}
                    >
                        Добавить реквизиты сторон
                    </Button>
                )}
            </div>
            </div>

            {/* Bottom save bar */}
            {hasChanges && (
                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'var(--lc-card)',
                    borderTop: '1px solid var(--lc-border)',
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
