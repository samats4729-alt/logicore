'use client';

import { useEffect, useState, useCallback } from 'react';
import { Input, Collapse, Popconfirm, Tooltip, Select } from 'antd';
import { ArrowLeft, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';
import { Button } from '@/components/ui/button';
import nova from '@/components/nova/nova.module.css';
import RequisitesFields, {
    type ПравкиРеквизитов, type СтрокаРеквизитов,
} from '@/components/contracts/RequisitesFields';

const { Panel } = Collapse;
const { TextArea } = Input;

interface ContractParagraph {
    number: string;
    text: string;
}

/**
 * Реквизиты сторон — строка на поле, а не две простыни текста.
 *
 * Блок хранит не значения, а отличия от карточек компаний: `overrides`.
 * Чего там нет — берётся из карточки при печати, поэтому поправленный в
 * справочнике счёт доходит до всех договоров сам.
 *
 * Свободный текст остаётся ради двух случаев: договоры, заведённые до
 * появления полей, и реквизиты, которые в наши поля не укладываются —
 * скажем, у иностранного контрагента.
 */
interface ContractRequisites {
    /** Левая половина — экспедитор. Только у блоков свободным текстом. */
    left?: string;
    /** Правая половина — заказчик. Тоже только свободным текстом. */
    right?: string;
    /** Нет значения — блок из тех времён, когда был только текст. */
    mode?: 'fields' | 'text';
    /** Что в этом договоре отличается от карточек. */
    overrides?: ПравкиРеквизитов;
}

interface ContractArticle {
    title: string;
    paragraphs: ContractParagraph[];
    /** Заполнено — статья печатается таблицей сторон, а не списком пунктов. */
    requisites?: ContractRequisites;
}

/** Организация холдинга — сторона договора. */
interface МояОрганизация {
    id: string;
    name: string;
    bin?: string | null;
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

    /**
     * Реквизиты из карточек обеих сторон.
     *
     * Тянем сразу, а не по нажатию «Добавить»: таблица рисуется этими
     * значениями каждый раз, когда открыт блок полями, — иначе она
     * показывала бы только переписанное руками.
     */
    const [заготовка, setЗаготовка] = useState<СтрокаРеквизитов[]>([]);

    // Своя сторона договора: в холдинге организаций несколько.
    const [мояОрганизация, setМояОрганизация] = useState<string>('');
    const [выбраннаяОрганизация, setВыбраннаяОрганизация] = useState<string>('');
    const [организации, setОрганизации] = useState<МояОрганизация[]>([]);
    const [сменаОрганизации, setСменаОрганизации] = useState(false);

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
                setМояОрганизация(contractRes.data.forwarderCompanyId || '');
                setВыбраннаяОрганизация(contractRes.data.forwarderCompanyId || '');
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

    useEffect(() => {
        api.get(`/contracts/${contractId}/requisites-draft`)
            .then(res => setЗаготовка(res.data?.fields || []))
            .catch(() => { /* Не подтянулось — таблица останется пустой, править можно. */ });
        api.get('/contracts/my-companies')
            .then(res => setОрганизации(res.data || []))
            .catch(() => { /* Одна организация — переключать нечего. */ });
    }, [contractId]);

    /**
     * Передать договор другой организации холдинга.
     *
     * Бывает, что договор завели машинально, пока были переключены в другую
     * организацию. Раньше это чинилось только заведением заново — и вместе с
     * ним терялись правленый текст, реквизиты и доп. соглашения.
     *
     * После передачи договор виден уже из другой организации, а из этой
     * пропадает: договоры и принадлежат организации, а не аккаунту. Поэтому
     * спрашиваем подтверждение и уводим обратно в список — оставлять человека
     * на странице, которая ему больше не отвечает, нельзя.
     */
    const передатьОрганизации = async () => {
        if (!выбраннаяОрганизация || выбраннаяОрганизация === мояОрганизация) return;
        const куда = организации.find(о => о.id === выбраннаяОрганизация)?.name || 'другую организацию';
        try {
            setСменаОрганизации(true);
            await api.put(`/contracts/${contractId}/organization`, { companyId: выбраннаяОрганизация });
            toast.success(`Договор передан: ${куда}. Чтобы работать с ним дальше, переключитесь в эту организацию.`);
            router.push('/company/contracts');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Не удалось сменить организацию');
            setВыбраннаяОрганизация(мояОрганизация);
        } finally {
            setСменаОрганизации(false);
        }
    };

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
     * Значения не копируются: блок заводится пустым от правок и печатает
     * то, что в карточках. Скопируй мы их сюда — поправленный в справочнике
     * счёт до договора уже не дошёл бы.
     */
    const addRequisites = () => {
        setArticles([...articles, {
            title: `${articles.length + 1}. Юридические адреса и реквизиты сторон`,
            paragraphs: [],
            requisites: { mode: 'fields', overrides: {} },
        }]);
        setOpenKeys([...openKeys, String(articles.length)]);
        setHasChanges(true);
    };

    /** Записать правки к реквизитам одной статьи. */
    const updateRequisites = (idx: number, правки: ПравкиРеквизитов) => {
        const updated = [...articles];
        updated[idx] = {
            ...updated[idx],
            requisites: { ...(updated[idx].requisites || {}), mode: 'fields', overrides: правки },
        };
        setArticles(updated);
        setHasChanges(true);
    };

    /** Переписать одну колонку свободного текста. */
    const updateRequisitesText = (idx: number, сторона: 'left' | 'right', text: string) => {
        const updated = [...articles];
        const прежние = updated[idx].requisites || {};
        updated[idx] = {
            ...updated[idx],
            requisites: { ...прежние, mode: 'text', [сторона]: text },
        };
        setArticles(updated);
        setHasChanges(true);
    };

    /**
     * Перейти от полей к свободному тексту.
     *
     * Колонки заполняются тем, что таблица показывает прямо сейчас, — вместе
     * с правками. Отдать человеку пустые окна после заполненной таблицы
     * значило бы заставить его набрать всё заново.
     */
    const switchToText = (idx: number) => {
        const правки = articles[idx].requisites?.overrides || {};
        const колонка = (сторона: 'left' | 'right') => заготовка
            .map(строка => {
                const своё = правки[строка.key]?.[сторона];
                const значение = своё !== undefined && своё !== null ? своё : строка[сторона];
                if (!значение) return '';
                return строка.key === 'name' ? значение : `${строка.label}: ${значение}`;
            })
            .filter(Boolean)
            .join('\n');

        const updated = [...articles];
        updated[idx] = {
            ...updated[idx],
            requisites: { mode: 'text', left: колонка('left'), right: колонка('right') },
        };
        setArticles(updated);
        setHasChanges(true);
    };

    /** Вернуться к полям: свободный текст отбрасывается, его заменяют карточки. */
    const switchToFields = (idx: number) => {
        const updated = [...articles];
        updated[idx] = {
            ...updated[idx],
            requisites: { mode: 'fields', overrides: {} },
        };
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
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Справочники · Договоры</div>
                    <h1 className={nova.title}>
                        {contractNumber ? `Договор №${contractNumber}` : 'Редактирование договора'}
                    </h1>
                    {/*
                      * От какой организации заключён договор. Показываем
                      * только в холдинге: там, где организация одна, строка
                      * ничего не сообщает и только занимает место.
                      */}
                    {организации.length > 1 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            marginTop: 8, fontSize: 12.5, color: 'var(--nova-fg-2)',
                        }}>
                            <span>От организации</span>
                            <Select
                                size="small"
                                style={{ minWidth: 240 }}
                                value={выбраннаяОрганизация || undefined}
                                disabled={сменаОрганизации}
                                onChange={setВыбраннаяОрганизация}
                                options={организации.map(о => ({ value: о.id, label: о.name }))}
                            />
                            {/*
                              * Передача — отдельное нажатие, а не выбор в списке:
                              * договор уходит из текущей организации, и делать
                              * это одним движением мыши слишком легко.
                              */}
                            {выбраннаяОрганизация !== мояОрганизация && (
                                <Popconfirm
                                    title="Передать договор этой организации?"
                                    description="Договор пропадёт из списка текущей организации. Чтобы работать с ним дальше, переключитесь в ту, которой передаёте."
                                    onConfirm={передатьОрганизации}
                                    onCancel={() => setВыбраннаяОрганизация(мояОрганизация)}
                                    okText="Передать"
                                    cancelText="Отмена"
                                >
                                    <Button size="sm" variant="outline" disabled={сменаОрганизации}>
                                        {сменаОрганизации && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                        Передать
                                    </Button>
                                </Popconfirm>
                            )}
                        </div>
                    )}
                </div>
                <div className={nova.heroActions}>
                    <Button variant="ghost" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" /> Назад
                    </Button>
                    <Popconfirm
                        title="Сбросить текст к шаблону по умолчанию?"
                        description="Все ваши изменения будут потеряны."
                        onConfirm={handleReset}
                        okText="Да, сбросить"
                        cancelText="Отмена"
                    >
                        <Button variant="outline" className="text-destructive" disabled={saving}>
                            {saving
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <RotateCcw className="h-4 w-4" />}
                            Сбросить к шаблону
                        </Button>
                    </Popconfirm>
                    <Button onClick={handleSave} disabled={saving || !hasChanges}>
                        {saving
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Save className="h-4 w-4" />}
                        Сохранить
                    </Button>
                </div>
            </div>

            {hasChanges && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', marginBottom: 16,
                    border: '1px solid var(--nova-warn)', borderRadius: 10,
                    background: 'var(--nova-warn-soft)', color: 'var(--nova-warn)',
                    fontSize: 12.5,
                }}>
                    Есть несохранённые изменения
                </div>
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
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive"
                                            aria-label="Удалить статью"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </Popconfirm>
                                </Tooltip>
                            </div>
                        }
                    >
                        {article.requisites ? (
                            article.requisites.mode === 'fields' ? (
                                <RequisitesFields
                                    fields={заготовка}
                                    overrides={article.requisites.overrides || {}}
                                    onChange={(правки) => updateRequisites(articleIdx, правки)}
                                    onSwitchToText={() => switchToText(articleIdx)}
                                />
                            ) : (
                                /* Свободный текст: договоры, заведённые до полей,
                                   и реквизиты, которые в поля не укладываются. */
                                <div>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 11, fontWeight: 600, letterSpacing: '.05em',
                                                textTransform: 'uppercase', color: 'var(--nova-fg-2)',
                                                marginBottom: 6,
                                            }}>
                                                Экспедитор
                                            </div>
                                            <TextArea
                                                value={article.requisites.left || ''}
                                                onChange={(e) => updateRequisitesText(articleIdx, 'left', e.target.value)}
                                                autoSize={{ minRows: 8, maxRows: 24 }}
                                                placeholder="Название, юр. адрес, БИН, банк, счёт, директор"
                                            />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 11, fontWeight: 600, letterSpacing: '.05em',
                                                textTransform: 'uppercase', color: 'var(--nova-fg-2)',
                                                marginBottom: 6,
                                            }}>
                                                Заказчик
                                            </div>
                                            <TextArea
                                                value={article.requisites.right || ''}
                                                onChange={(e) => updateRequisitesText(articleIdx, 'right', e.target.value)}
                                                autoSize={{ minRows: 8, maxRows: 24 }}
                                                placeholder="Название, юр. адрес, БИН, банк, счёт, директор"
                                            />
                                        </div>
                                    </div>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', gap: 12, marginTop: 10,
                                        fontSize: 12.5, color: 'var(--nova-fg-3)',
                                    }}>
                                        <span>Текст записан как есть — из карточек он больше не обновляется</span>
                                        <Popconfirm
                                            title="Вернуться к полям?"
                                            description="Вписанный здесь текст будет заменён данными из карточек."
                                            onConfirm={() => switchToFields(articleIdx)}
                                            okText="Да, к полям"
                                            cancelText="Отмена"
                                        >
                                            <Button variant="link" className="h-auto p-0 text-[12.5px] text-foreground">
                                                Вернуться к полям
                                            </Button>
                                        </Popconfirm>
                                    </div>
                                </div>
                            )
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
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 shrink-0 text-destructive"
                                        aria-label="Удалить пункт"
                                        onClick={() => removeParagraph(articleIdx, paraIdx)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </Tooltip>
                            </div>
                        ))}
                        {!article.requisites && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full border-dashed"
                                onClick={() => addParagraph(articleIdx)}
                            >
                                <Plus className="h-3.5 w-3.5" /> Добавить пункт
                            </Button>
                        )}
                    </Panel>
                ))}
            </Collapse>

            {/* Add article button */}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <Button
                    variant="outline"
                    className="h-12 w-full border-dashed"
                    onClick={addArticle}
                >
                    <Plus className="h-4 w-4" /> Добавить статью
                </Button>
                {/* Отдельная кнопка, а не «ещё одна статья»: у реквизитов
                    свой вид — таблица сторон, и пунктов внутри не бывает.
                    Второй такой блок договору не нужен, поэтому после
                    добавления кнопка исчезает. */}
                {!реквизитыЕсть && (
                    <Button
                        variant="outline"
                        className="h-12 w-full border-dashed"
                        onClick={addRequisites}
                    >
                        <Plus className="h-4 w-4" /> Добавить реквизиты сторон
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
                    <Button onClick={handleSave} disabled={saving}>
                        {saving
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Save className="h-4 w-4" />}
                        Сохранить изменения
                    </Button>
                </div>
            )}
        </div>
    );
}
