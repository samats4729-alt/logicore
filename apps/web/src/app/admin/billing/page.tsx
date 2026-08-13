'use client';

import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, Popconfirm, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { CreditCard, Inbox, Layers, Wallet } from 'lucide-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import nova from '@/components/nova/nova.module.css';
import styles from './billing.module.css';

const STATUS_LABELS: Record<string, string> = {
    TRIAL: 'Пробный период',
    GRACE: 'Дни на оплату',
    ACTIVE: 'Оплачена',
    PAST_DUE: 'Просрочена',
    CANCELLED: 'Отменена',
};

/** Цветом — только просрочка: остальное обычные состояния подписки. */
const STATUS_CHIP: Record<string, string> = {
    PAST_DUE: 'neg',
};

const REQUEST_LABELS: Record<string, string> = {
    PENDING: 'ждёт ответа',
    APPROVED: 'продлено',
    REJECTED: 'отказ',
};

const money = (value: number) => value.toLocaleString('ru-RU');

interface Plan {
    id: string;
    name: string;
    description?: string | null;
    priceMonthly: number;
    maxUsers?: number | null;
    maxOrdersPerMonth?: number | null;
    features: string[];
    isActive: boolean;
    sortOrder: number;
    _count?: { subscriptions: number };
}

interface Settings {
    enabled: boolean;
    trialDays: number;
    graceDays: number;
}

interface SubscriptionRequest {
    id: string;
    months: number;
    amount: number;
    status: string;
    requesterName?: string | null;
    comment?: string | null;
    decisionNote?: string | null;
    createdAt: string;
    company: { id: string; name: string; bin?: string | null };
}

export default function AdminBillingPage() {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [subs, setSubs] = useState<any[]>([]);
    const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
    const [loading, setLoading] = useState(true);

    // Черновик формы тарифа: сумма и сроки правятся вместе и сохраняются
    // одним действием — иначе владелец включит оплату с прежней ценой.
    const [draft, setDraft] = useState<{ priceMonthly: number; trialDays: number; graceDays: number }>({
        priceMonthly: 0, trialDays: 14, graceDays: 3,
    });

    const [planModalOpen, setPlanModalOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [planForm] = Form.useForm();

    const [subModalOpen, setSubModalOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<any>(null);
    const [subForm] = Form.useForm();

    const [decision, setDecision] = useState<{ request: SubscriptionRequest; approve: boolean } | null>(null);
    const [decisionNote, setDecisionNote] = useState('');
    const [deciding, setDeciding] = useState(false);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [settingsRes, tariffRes, plansRes, subsRes, requestsRes] = await Promise.all([
                api.get('/billing/admin/settings'),
                api.get('/billing/admin/tariff'),
                api.get('/billing/admin/plans'),
                api.get('/billing/admin/subscriptions'),
                api.get('/billing/admin/requests'),
            ]);
            setSettings(settingsRes.data);
            setPlans(plansRes.data || []);
            setSubs(subsRes.data || []);
            setRequests(requestsRes.data || []);
            setDraft({
                // Пока оплата выключена, тариф отдаёт ноль — цену для формы
                // берём из самого плана, иначе сохранение обнулило бы её.
                priceMonthly: (plansRes.data || []).find((p: Plan) => p.isActive)?.priceMonthly
                    ?? tariffRes.data?.priceMonthly ?? 0,
                trialDays: settingsRes.data?.trialDays ?? 14,
                graceDays: settingsRes.data?.graceDays ?? 3,
            });
        } catch {
            toast.error('Не удалось загрузить тариф и подписки');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(); }, []);

    // ==================== Настройки ====================

    /** Сохранить тариф; `enabled` передаётся только когда рубильник трогают. */
    const saveTariff = async (enabled?: boolean) => {
        setSavingSettings(true);
        try {
            const res = await api.put('/billing/admin/settings', { ...draft, enabled });
            setSettings({ enabled: res.data.enabled, trialDays: res.data.trialDays, graceDays: res.data.graceDays });
            if (res.data.graceGranted > 0) {
                toast.success(`Оплата включена. ${res.data.graceGranted} компаниям дано ${res.data.graceDays} дн. на оплату.`);
            } else if (enabled === false) {
                toast.success('Оплата выключена — ограничения сняты со всех');
            } else {
                toast.success('Тариф сохранён');
            }
            loadAll();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось сохранить тариф');
        } finally {
            setSavingSettings(false);
        }
    };

    const handleEnable = () => {
        if (!draft.priceMonthly) {
            toast.error('Сначала назначьте цену — включать оплату с нулём не с чем');
            return;
        }
        Modal.confirm({
            title: 'Включить оплату?',
            content: `Цена ${money(draft.priceMonthly)} ₸ в месяц появится на лендинге и в кабинетах. `
                + `Компании, которые работают сейчас, получат ${draft.graceDays} дн. на оплату, `
                + `новые — пробный период ${draft.trialDays} дн. Выключить можно в любой момент.`,
            okText: 'Включить оплату',
            cancelText: 'Отмена',
            onOk: () => saveTariff(true),
        });
    };

    const handleDisable = () => {
        Modal.confirm({
            title: 'Выключить оплату?',
            content: 'Платформа снова станет бесплатной для всех, на лендинге вместо цены будет «идёт тестирование». '
                + 'Подписки компаний сохранятся.',
            okText: 'Выключить',
            cancelText: 'Отмена',
            onOk: () => saveTariff(false),
        });
    };

    // ==================== Запросы на подписку ====================

    const submitDecision = async () => {
        if (!decision) return;
        setDeciding(true);
        try {
            const path = decision.approve ? 'approve' : 'reject';
            await api.post(`/billing/admin/requests/${decision.request.id}/${path}`, { note: decisionNote });
            toast.success(decision.approve
                ? `Подписка продлена на ${decision.request.months} мес`
                : 'Запрос отклонён');
            setDecision(null);
            setDecisionNote('');
            loadAll();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось ответить на запрос');
        } finally {
            setDeciding(false);
        }
    };

    // ==================== Планы ====================

    const openPlanModal = (plan?: Plan) => {
        setEditingPlan(plan || null);
        planForm.resetFields();
        if (plan) {
            planForm.setFieldsValue({ ...plan, features: (plan.features || []).join('\n') });
        } else {
            planForm.setFieldsValue({ isActive: true, sortOrder: 0 });
        }
        setPlanModalOpen(true);
    };

    const handleSavePlan = async (values: any) => {
        const payload = {
            ...values,
            features: (values.features || '')
                .split('\n')
                .map((f: string) => f.trim())
                .filter(Boolean),
        };
        try {
            if (editingPlan) {
                await api.put(`/billing/admin/plans/${editingPlan.id}`, payload);
                toast.success('План обновлён');
            } else {
                await api.post('/billing/admin/plans', payload);
                toast.success('План создан');
            }
            setPlanModalOpen(false);
            loadAll();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Ошибка сохранения плана');
        }
    };

    const handleDeletePlan = async (id: string) => {
        try {
            await api.delete(`/billing/admin/plans/${id}`);
            toast.success('План удалён');
            loadAll();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Ошибка удаления');
        }
    };

    // ==================== Подписки ====================

    const openSubModal = (company: any) => {
        setEditingCompany(company);
        subForm.resetFields();
        subForm.setFieldsValue({
            planId: company.subscription?.planId ?? undefined,
            status: company.subscription?.status ?? 'TRIAL',
            note: company.subscription?.note ?? '',
            months: undefined,
        });
        setSubModalOpen(true);
    };

    const handleSaveSub = async (values: any) => {
        try {
            await api.put(`/billing/admin/subscriptions/${editingCompany.id}`, {
                planId: values.planId ?? null,
                status: values.status,
                months: values.months || undefined,
                note: values.note || null,
            });
            toast.success('Подписка обновлена');
            setSubModalOpen(false);
            loadAll();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Ошибка сохранения подписки');
        }
    };

    const pendingRequests = requests.filter(r => r.status === 'PENDING');

    // ==================== Колонки таблиц ====================

    const planColumns = [
        { title: 'Название', dataIndex: 'name', key: 'name', render: (t: string, r: Plan) => (
            <b>{t}{!r.isActive && <span className={nova.chip} style={{ marginLeft: 8 }}>выключен</span>}</b>
        ) },
        { title: 'Цена, ₸/мес', dataIndex: 'priceMonthly', key: 'price', render: (v: number) => <b>{v.toLocaleString('ru-RU')}</b> },
        { title: 'Сотрудники', dataIndex: 'maxUsers', key: 'maxUsers', render: (v: number | null) => v ?? '∞' },
        { title: 'Заявки/мес', dataIndex: 'maxOrdersPerMonth', key: 'maxOrders', render: (v: number | null) => v ?? '∞' },
        { title: 'Подписок', key: 'subs', render: (_: any, r: Plan) => r._count?.subscriptions ?? 0 },
        {
            title: '', key: 'actions', width: 90,
            render: (_: any, r: Plan) => (
                <Space>
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openPlanModal(r)} />
                    <Popconfirm title="Удалить план?" okText="Да" cancelText="Нет" onConfirm={() => handleDeletePlan(r.id)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const subColumns = [
        { title: 'Компания', key: 'name', render: (_: any, r: any) => <div><b>{r.name}</b><div style={{ fontSize: 11, color: 'var(--nova-fg-3)' }}>{r.bin || 'БИН не указан'} · {r._count?.users ?? 0} польз.</div></div> },
        {
            title: 'Статус', key: 'status',
            render: (_: any, r: any) => (
                <span className={`${nova.chip}${
                    STATUS_CHIP[r.subscription?.status] === 'neg' ? ` ${nova.chipNeg}` : ''
                }`}>
                    {r.subscription
                        ? STATUS_LABELS[r.subscription.status] || r.subscription.status
                        : 'Нет подписки'}
                </span>
            ),
        },
        { title: 'План', key: 'plan', render: (_: any, r: any) => r.subscription?.plan ? `${r.subscription.plan.name} (${r.subscription.plan.priceMonthly.toLocaleString('ru-RU')} ₸)` : '—' },
        {
            title: 'Действует до', key: 'until',
            render: (_: any, r: any) => {
                const s = r.subscription;
                if (!s) return '—';
                // Бесплатный доступ — пробный период и дни на оплату — живёт
                // в trialEndsAt; оплаченный в periodEnd.
                const d = s.status === 'TRIAL' || s.status === 'GRACE' ? s.trialEndsAt : s.periodEnd;
                return d ? dayjs(d).format('DD.MM.YYYY') : '—';
            },
        },
        { title: 'Заметка', key: 'note', render: (_: any, r: any) => <span style={{ fontSize: 12, color: 'var(--nova-fg-3)' }}>{r.subscription?.note || ''}</span> },
        {
            title: '', key: 'actions', width: 110,
            render: (_: any, r: any) => <Button size="small" onClick={() => openSubModal(r)}>Управлять</Button>,
        },
    ];

    return (
        <div>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Тариф и подписки</h1>
                    <p className={nova.subtitle}>
                        {settings?.enabled
                            ? 'Цена месяца, сроки, запросы на покупку и подписки компаний.'
                            : 'Цена месяца, сроки и подписки компаний. Пока оплата выключена, платформа работает бесплатно для всех.'}
                    </p>
                </div>
            </div>

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <Wallet size={14} />
                    <h2 className={nova.cardTitle}>Тариф</h2>
                    <span className={`${nova.chip}${settings?.enabled ? ` ${nova.chipWarn}` : ''}`}>
                        {settings?.enabled ? 'оплата включена' : 'идёт тестирование'}
                    </span>
                </div>
                <div className={nova.cardBody}>
                    <div className={styles.form}>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>Цена, ₸ в месяц</span>
                            <InputNumber
                                min={0} step={1000} style={{ width: 150 }}
                                value={draft.priceMonthly}
                                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                                parser={(v) => Number((v || '').replace(/\s/g, '')) as 0}
                                onChange={(v) => setDraft(d => ({ ...d, priceMonthly: v ?? 0 }))}
                            />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>Пробный период, дней</span>
                            <InputNumber
                                min={1} max={365} style={{ width: 100 }}
                                value={draft.trialDays}
                                onChange={(v) => setDraft(d => ({ ...d, trialDays: v ?? 14 }))}
                            />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>Дней на оплату</span>
                            <InputNumber
                                min={1} max={90} style={{ width: 100 }}
                                value={draft.graceDays}
                                onChange={(v) => setDraft(d => ({ ...d, graceDays: v ?? 3 }))}
                            />
                        </label>

                        <div className={styles.formActions}>
                            {settings?.enabled ? (
                                <>
                                    <button
                                        type="button"
                                        className={`${nova.action} ${nova.actionPrimary}`}
                                        disabled={savingSettings}
                                        onClick={() => saveTariff()}
                                    >
                                        Сохранить
                                    </button>
                                    <button
                                        type="button"
                                        className={`${nova.action} ${nova.actionDanger}`}
                                        disabled={savingSettings}
                                        onClick={handleDisable}
                                    >
                                        Выключить оплату
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className={nova.action}
                                        disabled={savingSettings}
                                        onClick={() => saveTariff()}
                                    >
                                        Сохранить
                                    </button>
                                    <button
                                        type="button"
                                        className={`${nova.action} ${nova.actionPrimary}`}
                                        disabled={savingSettings}
                                        onClick={handleEnable}
                                    >
                                        Включить оплату
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className={styles.explain}>
                        {settings?.enabled ? (
                            <>
                                На лендинге и в кабинетах — {money(draft.priceMonthly)} ₸ в месяц.
                                Компания без действующей подписки в кабинет не попадает; данные её
                                сохраняются и открываются сразу после продления. Выключить оплату
                                можно в любой момент — ограничения снимутся со всех.
                            </>
                        ) : (
                            <>
                                Сейчас на лендинге и в кабинетах написано «Бесплатно, на время
                                тестирования» — какая бы сумма ни стояла в поле выше. Когда нажмёте «Включить оплату»,
                                цена появится сразу везде, компании, которые уже работают, получат{' '}
                                {draft.graceDays} дн. на оплату, а новые — пробный период {draft.trialDays} дн.
                                Оплаченное вперёд не сгорает.
                            </>
                        )}
                    </div>
                </div>
            </section>

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <Inbox size={14} />
                    <h2 className={nova.cardTitle}>Запросы на подписку</h2>
                    {pendingRequests.length > 0 && <span className={nova.cardCount}>{pendingRequests.length}</span>}
                </div>
                {requests.length === 0 ? (
                    <div className={nova.empty}>
                        {loading ? 'Загружаем…' : 'Запросов нет — компании ещё не просили счёт'}
                    </div>
                ) : (
                    <div className={nova.cardBody}>
                        {requests.map((r) => (
                            <div key={r.id} className={styles.request}>
                                <div className={styles.requestWho}>
                                    <div className={styles.requestName}>{r.company.name}</div>
                                    <div className={styles.requestMeta}>
                                        {r.company.bin ? `БИН ${r.company.bin}` : 'БИН не указан'}
                                        {r.requesterName ? ` · ${r.requesterName}` : ''}
                                        {' · '}{dayjs(r.createdAt).format('DD.MM.YYYY HH:mm')}
                                    </div>
                                    {r.comment && <div className={styles.requestMeta}>{r.comment}</div>}
                                    {r.decisionNote && <div className={styles.requestMeta}>{r.decisionNote}</div>}
                                </div>
                                <div className={styles.requestSum}>
                                    {money(r.amount)} ₸
                                    <div className={styles.requestSumSub}>{r.months} мес</div>
                                </div>
                                {r.status === 'PENDING' ? (
                                    <div className={styles.requestActions}>
                                        <button
                                            type="button"
                                            className={`${nova.action} ${nova.actionPrimary}`}
                                            onClick={() => { setDecision({ request: r, approve: true }); setDecisionNote(''); }}
                                        >
                                            Продлить и закрыть
                                        </button>
                                        <button
                                            type="button"
                                            className={nova.action}
                                            onClick={() => { setDecision({ request: r, approve: false }); setDecisionNote(''); }}
                                        >
                                            Отказать
                                        </button>
                                    </div>
                                ) : (
                                    <span className={`${nova.chip}${r.status === 'REJECTED' ? ` ${nova.chipNeg}` : ''}`}>
                                        {REQUEST_LABELS[r.status] || r.status}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <Layers size={14} />
                    <h2 className={nova.cardTitle}>Тарифные планы</h2>
                    {plans.length > 0 && <span className={nova.cardCount}>{plans.length}</span>}
                    <span className={nova.chip}>цена — из «Тарифа» сверху</span>
                    <button
                        type="button"
                        className={`${nova.action} ${nova.actionPrimary}`}
                        onClick={() => openPlanModal()}
                    >
                        <PlusOutlined /> План
                    </button>
                </div>
                <Table
                    rowKey="id"
                    columns={planColumns}
                    dataSource={plans}
                    loading={loading}
                    size="small"
                    pagination={false}
                    locale={{ emptyText: 'Отдельных планов нет — цена задаётся в «Тарифе» сверху' }}
                />
            </section>

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <CreditCard size={14} />
                    <h2 className={nova.cardTitle}>Подписки компаний</h2>
                    {subs.length > 0 && <span className={nova.cardCount}>{subs.length}</span>}
                </div>
                <Table
                    rowKey="id"
                    columns={subColumns}
                    dataSource={subs}
                    loading={loading}
                    size="small"
                    pagination={{ pageSize: 20, size: 'small' }}
                />
            </section>

            {/* ===== Modal: план ===== */}
            <Modal
                title={editingPlan ? 'Редактировать план' : 'Новый тарифный план'}
                open={planModalOpen}
                onCancel={() => setPlanModalOpen(false)}
                onOk={() => planForm.submit()}
                okText="Сохранить"
                cancelText="Отмена"
            >
                <Form form={planForm} layout="vertical" onFinish={handleSavePlan}>
                    <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
                        <Input placeholder="Например: Стандарт" />
                    </Form.Item>
                    <Form.Item name="description" label="Короткое описание">
                        <Input placeholder="Для небольших команд" />
                    </Form.Item>
                    <Form.Item name="priceMonthly" label="Цена, ₸ в месяц" rules={[{ required: true, message: 'Укажите цену' }]}>
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="50000" />
                    </Form.Item>
                    <Space size="middle" style={{ display: 'flex' }}>
                        <Form.Item name="maxUsers" label="Лимит сотрудников" style={{ flex: 1 }}>
                            <InputNumber min={1} style={{ width: '100%' }} placeholder="Пусто = безлимит" />
                        </Form.Item>
                        <Form.Item name="maxOrdersPerMonth" label="Лимит заявок/мес" style={{ flex: 1 }}>
                            <InputNumber min={1} style={{ width: '100%' }} placeholder="Пусто = безлимит" />
                        </Form.Item>
                    </Space>
                    <Form.Item name="features" label="Пункты (каждый с новой строки)">
                        <Input.TextArea rows={3} placeholder={'GPS-мониторинг\nБухгалтерия и отчёты\nПоддержка'} />
                    </Form.Item>
                    <Space size="middle">
                        <Form.Item name="isActive" label="Показывать клиентам" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                        <Form.Item name="sortOrder" label="Порядок">
                            <InputNumber min={0} style={{ width: 80 }} />
                        </Form.Item>
                    </Space>
                </Form>
            </Modal>

            {/* ===== Modal: ответ на запрос ===== */}
            <Modal
                title={decision?.approve ? 'Продлить подписку' : 'Отказать по запросу'}
                open={!!decision}
                onCancel={() => setDecision(null)}
                onOk={submitDecision}
                okText={decision?.approve ? 'Продлить и закрыть' : 'Отказать'}
                cancelText="Отмена"
                confirmLoading={deciding}
            >
                {decision && (
                    <>
                        <div className={nova.itemDesc} style={{ whiteSpace: 'normal', marginBottom: 12 }}>
                            {decision.approve
                                ? `${decision.request.company.name} оплатила ${money(decision.request.amount)} ₸ — подписка продлится на ${decision.request.months} мес от текущего конца периода.`
                                : `Запрос ${decision.request.company.name} на ${decision.request.months} мес будет закрыт без продления.`}
                        </div>
                        <Input
                            placeholder={decision.approve ? 'Счёт №123 от 01.07.2026' : 'Причина отказа'}
                            value={decisionNote}
                            onChange={(e) => setDecisionNote(e.target.value)}
                        />
                    </>
                )}
            </Modal>

            {/* ===== Modal: подписка компании ===== */}
            <Modal
                title={`Подписка: ${editingCompany?.name || ''}`}
                open={subModalOpen}
                onCancel={() => setSubModalOpen(false)}
                onOk={() => subForm.submit()}
                okText="Сохранить"
                cancelText="Отмена"
            >
                <Form form={subForm} layout="vertical" onFinish={handleSaveSub}>
                    <Form.Item name="planId" label="Тарифный план">
                        <Select
                            allowClear
                            placeholder="Выберите план"
                            options={plans.map(p => ({ value: p.id, label: `${p.name} — ${p.priceMonthly.toLocaleString('ru-RU')} ₸/мес` }))}
                        />
                    </Form.Item>
                    <Form.Item name="months" label="Продлить на, месяцев" extra="Заполни после оплаты счёта: статус станет «Оплачена», срок продлится от текущего конца периода.">
                        <InputNumber min={1} max={36} style={{ width: '100%' }} placeholder="Например: 1, 3, 12" />
                    </Form.Item>
                    <Form.Item name="status" label="Статус (вручную)">
                        <Select
                            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                        />
                    </Form.Item>
                    <Form.Item name="note" label="Заметка (№ счёта, комментарий)">
                        <Input placeholder="Счёт №123 от 01.07.2026" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
