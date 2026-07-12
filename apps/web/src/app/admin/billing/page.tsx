'use client';

import { useEffect, useState } from 'react';
import {
    Card, Table, Button, Tag, Modal, Form, Input, InputNumber, Select, Switch,
    message, Popconfirm, Space, Typography, Alert, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, DollarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';

const { Title, Text } = Typography;

const STATUS_LABELS: Record<string, string> = {
    TRIAL: 'Пробный период',
    ACTIVE: 'Оплачена',
    PAST_DUE: 'Просрочена',
    CANCELLED: 'Отменена',
};

const STATUS_COLORS: Record<string, string> = {
    TRIAL: 'gold',
    ACTIVE: 'green',
    PAST_DUE: 'red',
    CANCELLED: 'default',
};

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

export default function AdminBillingPage() {
    const [settings, setSettings] = useState<{ enabled: boolean; trialDays: number } | null>(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [subs, setSubs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [planModalOpen, setPlanModalOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [planForm] = Form.useForm();

    const [subModalOpen, setSubModalOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<any>(null);
    const [subForm] = Form.useForm();

    const loadAll = async () => {
        setLoading(true);
        try {
            const [settingsRes, plansRes, subsRes] = await Promise.all([
                api.get('/billing/admin/settings'),
                api.get('/billing/admin/plans'),
                api.get('/billing/admin/subscriptions'),
            ]);
            setSettings(settingsRes.data);
            setPlans(plansRes.data || []);
            setSubs(subsRes.data || []);
        } catch {
            message.error('Ошибка загрузки данных биллинга');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(); }, []);

    // ==================== Настройки ====================

    const handleToggleBilling = async (enabled: boolean) => {
        const apply = async () => {
            setSavingSettings(true);
            try {
                const res = await api.put('/billing/admin/settings', { enabled });
                setSettings({ enabled: res.data.enabled, trialDays: res.data.trialDays });
                if (enabled && res.data.trialsCreated > 0) {
                    message.success(`Биллинг включён. Пробный период выдан ${res.data.trialsCreated} компаниям.`);
                } else {
                    message.success(enabled ? 'Биллинг включён' : 'Биллинг выключен — все ограничения сняты');
                }
                loadAll();
            } catch (e: any) {
                message.error(e.response?.data?.message || 'Ошибка сохранения');
            } finally {
                setSavingSettings(false);
            }
        };

        if (enabled) {
            Modal.confirm({
                title: 'Включить биллинг?',
                content: `Все компании без подписки получат пробный период ${settings?.trialDays ?? 14} дней. После его окончания доступ закроется до оплаты. Выключить можно в любой момент.`,
                okText: 'Включить',
                cancelText: 'Отмена',
                onOk: apply,
            });
        } else {
            apply();
        }
    };

    const handleTrialDaysChange = async (trialDays: number | null) => {
        if (!trialDays) return;
        try {
            const res = await api.put('/billing/admin/settings', { trialDays });
            setSettings({ enabled: res.data.enabled, trialDays: res.data.trialDays });
            message.success('Длительность пробного периода сохранена');
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка сохранения');
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
                message.success('План обновлён');
            } else {
                await api.post('/billing/admin/plans', payload);
                message.success('План создан');
            }
            setPlanModalOpen(false);
            loadAll();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка сохранения плана');
        }
    };

    const handleDeletePlan = async (id: string) => {
        try {
            await api.delete(`/billing/admin/plans/${id}`);
            message.success('План удалён');
            loadAll();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка удаления');
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
            message.success('Подписка обновлена');
            setSubModalOpen(false);
            loadAll();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка сохранения подписки');
        }
    };

    // ==================== Колонки таблиц ====================

    const planColumns = [
        { title: 'Название', dataIndex: 'name', key: 'name', render: (t: string, r: Plan) => <b>{t}{!r.isActive && <Tag style={{ marginLeft: 8 }}>выключен</Tag>}</b> },
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
        { title: 'Компания', key: 'name', render: (_: any, r: any) => <div><b>{r.name}</b><div style={{ fontSize: 11, color: '#8a91a0' }}>{r.bin || 'БИН не указан'} · {r._count?.users ?? 0} польз.</div></div> },
        {
            title: 'Статус', key: 'status',
            render: (_: any, r: any) => r.subscription
                ? <Tag color={STATUS_COLORS[r.subscription.status]}>{STATUS_LABELS[r.subscription.status] || r.subscription.status}</Tag>
                : <Tag>Нет подписки</Tag>,
        },
        { title: 'План', key: 'plan', render: (_: any, r: any) => r.subscription?.plan ? `${r.subscription.plan.name} (${r.subscription.plan.priceMonthly.toLocaleString('ru-RU')} ₸)` : '—' },
        {
            title: 'Действует до', key: 'until',
            render: (_: any, r: any) => {
                const s = r.subscription;
                if (!s) return '—';
                const d = s.status === 'TRIAL' ? s.trialEndsAt : s.periodEnd;
                return d ? dayjs(d).format('DD.MM.YYYY') : '—';
            },
        },
        { title: 'Заметка', key: 'note', render: (_: any, r: any) => <span style={{ fontSize: 12, color: '#8a91a0' }}>{r.subscription?.note || ''}</span> },
        {
            title: '', key: 'actions', width: 110,
            render: (_: any, r: any) => <Button size="small" onClick={() => openSubModal(r)}>Управлять</Button>,
        },
    ];

    return (
        <div style={{ padding: '0 4px' }}>
            <Title level={3} style={{ marginBottom: 4 }}><DollarOutlined /> Биллинг</Title>
            <Text type="secondary">Подписки компаний, тарифы и глобальный рубильник</Text>

            {/* ===== Настройки ===== */}
            <Card size="small" style={{ marginTop: 16 }} loading={loading && !settings}>
                <Space size="large" wrap>
                    <Space>
                        <Switch
                            checked={settings?.enabled ?? false}
                            loading={savingSettings}
                            onChange={handleToggleBilling}
                        />
                        <b>{settings?.enabled ? 'Биллинг включён' : 'Биллинг выключен'}</b>
                    </Space>
                    <Space>
                        <span>Пробный период, дней:</span>
                        <InputNumber
                            min={1} max={365}
                            value={settings?.trialDays}
                            onChange={handleTrialDaysChange}
                            style={{ width: 80 }}
                        />
                    </Space>
                </Space>
                <Divider style={{ margin: '12px 0' }} />
                {settings?.enabled ? (
                    <Alert type="warning" showIcon message="Биллинг активен: компании без действующей подписки или пробного периода не имеют доступа к кабинету." />
                ) : (
                    <Alert type="info" showIcon message="Биллинг выключен: платформа работает бесплатно для всех, ограничения и баннеры не показываются." />
                )}
            </Card>

            {/* ===== Тарифные планы ===== */}
            <Card
                size="small"
                style={{ marginTop: 16 }}
                title="Тарифные планы"
                extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openPlanModal()}>Добавить план</Button>}
            >
                <Table rowKey="id" columns={planColumns} dataSource={plans} loading={loading} size="small" pagination={false} />
            </Card>

            {/* ===== Подписки компаний ===== */}
            <Card size="small" style={{ marginTop: 16 }} title="Подписки компаний">
                <Table rowKey="id" columns={subColumns} dataSource={subs} loading={loading} size="small" pagination={{ pageSize: 20, size: 'small' }} />
            </Card>

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
