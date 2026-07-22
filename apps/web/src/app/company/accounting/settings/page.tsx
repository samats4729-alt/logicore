'use client';

import { useState, useEffect } from 'react';
import { Typography, Button, Table, Tabs, Switch, Modal, Form, Input, Select, Space, App, Tag, theme, Spin } from 'antd';
import { ArrowLeftOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

const { Text } = Typography;

interface FinanceAccount {
    id: string;
    name: string;
    kind: 'CASH' | 'BANK';
    isDefault: boolean;
    isActive: boolean;
}

type CostType = 'PER_ORDER' | 'PER_VEHICLE' | 'GENERAL';

interface FinanceCategory {
    id: string;
    name: string;
    direction: 'IN' | 'OUT';
    costType?: CostType | null;
    isSystem: boolean;
    isActive: boolean;
}

const COST_TYPE_OPTIONS: { value: CostType; label: string; hint: string }[] = [
    { value: 'PER_ORDER', label: 'По заявке', hint: 'Себестоимость рейса — уменьшает маржу заявки' },
    { value: 'PER_VEHICLE', label: 'По машине', hint: 'Расход конкретного грузовика' },
    { value: 'GENERAL', label: 'Общехозяйственный', hint: 'Общий расход фирмы (аренда, зарплата…)' },
];
const COST_TYPE_LABELS: Record<string, string> = { PER_ORDER: 'По заявке', PER_VEHICLE: 'По машине', GENERAL: 'Общехозяйственный' };
const COST_TYPE_COLORS: Record<string, string> = { PER_ORDER: 'blue', PER_VEHICLE: 'purple', GENERAL: 'default' };

export default function FinanceSettingsPage() {
    const { token } = theme.useToken();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message } = App.useApp();
    const { user } = useAuthStore();
    const canEditFinance = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT';

    // Вкладку можно задать ссылкой: ?tab=accounts | categories
    const rawTab = searchParams?.get('tab') || '';
    const initialTab = rawTab === 'categories' ? 'categories' : 'accounts';
    const [activeTab, setActiveTab] = useState(initialTab);

    const [loading, setLoading] = useState(false);
    const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
    const [categories, setCategories] = useState<FinanceCategory[]>([]);

    // Modals
    const [accountModalOpen, setAccountModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(null);
    const [accountForm] = Form.useForm();

    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<FinanceCategory | null>(null);
    const [categoryForm] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const watchedDirection = Form.useWatch('direction', categoryForm);
    // Тип затрат нужен только для расходных статей (OUT)
    const categoryDirection = editingCategory ? editingCategory.direction : watchedDirection;

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const [accRes, catRes] = await Promise.all([
                api.get('/accounting/finance-accounts'),
                api.get('/accounting/finance-categories'),
            ]);
            setAccounts(accRes.data || []);
            setCategories(catRes.data || []);
        } catch {
            message.error('Не удалось загрузить настройки');
        } finally {
            setLoading(false);
        }
    };

    const handleEditAccount = (record: FinanceAccount) => {
        if (!canEditFinance) return;
        setEditingAccount(record);
        accountForm.setFieldsValue({ name: record.name });
        setAccountModalOpen(true);
    };

    const handleSaveAccount = async (values: { name: string }) => {
        if (!editingAccount) return;
        setSaving(true);
        try {
            await api.put(`/accounting/finance-accounts/${editingAccount.id}`, values);
            message.success('Счет переименован');
            setAccountModalOpen(false);
            fetchSettings();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка переименования');
        } finally {
            setSaving(false);
        }
    };

    const handleCreateCategory = () => {
        if (!canEditFinance) return;
        setEditingCategory(null);
        categoryForm.resetFields();
        setCategoryModalOpen(true);
    };

    const handleEditCategory = (record: FinanceCategory) => {
        if (!canEditFinance) return;
        setEditingCategory(record);
        categoryForm.setFieldsValue({ name: record.name, costType: record.costType ?? undefined });
        setCategoryModalOpen(true);
    };

    const handleSaveCategory = async (values: { name: string; direction?: 'IN' | 'OUT'; costType?: CostType }) => {
        setSaving(true);
        try {
            if (editingCategory) {
                await api.put(`/accounting/finance-categories/${editingCategory.id}`, {
                    name: values.name,
                    ...(editingCategory.direction === 'OUT' ? { costType: values.costType ?? null } : {}),
                });
                message.success('Статья обновлена');
            } else {
                await api.post('/accounting/finance-categories', {
                    name: values.name,
                    direction: values.direction,
                    ...(values.direction === 'OUT' ? { costType: values.costType ?? null } : {}),
                });
                message.success('Статья добавлена');
            }
            setCategoryModalOpen(false);
            fetchSettings();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка сохранения статьи');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleCategoryActive = async (id: string, active: boolean) => {
        try {
            await api.put(`/accounting/finance-categories/${id}/deactivate`, { active });
            message.success(active ? 'Статья активирована' : 'Статья деактивирована');
            fetchSettings();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Не удалось изменить статус статьи');
        }
    };

    const accountColumns = [
        {
            title: 'Название счёта / кассы',
            dataIndex: 'name',
            key: 'name',
            render: (val: string) => <Text strong style={{ fontSize: 13 }}>{val}</Text>
        },
        {
            title: 'Тип',
            dataIndex: 'kind',
            key: 'kind',
            width: 150,
            render: (val: 'CASH' | 'BANK') => (
                val === 'CASH' ? <Tag color="orange">Касса</Tag> : <Tag color="blue">Расчетный счет</Tag>
            )
        },
        {
            title: 'По умолчанию',
            dataIndex: 'isDefault',
            key: 'default',
            width: 150,
            render: (val: boolean) => val ? <Tag color="green">Да</Tag> : <Text type="secondary">—</Text>
        },
        {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: any, r: FinanceAccount) => (
                canEditFinance && (
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditAccount(r)} />
                )
            )
        }
    ];

    const categoryColumns = [
        {
            title: 'Название статьи',
            dataIndex: 'name',
            key: 'name',
            render: (val: string, r: FinanceCategory) => (
                <Text strong={r.isSystem} style={{ fontSize: 13, color: r.isActive ? undefined : token.colorTextDescription }}>{val}</Text>
            )
        },
        {
            title: 'Тип затрат',
            dataIndex: 'costType',
            key: 'costType',
            width: 190,
            render: (val: CostType | null | undefined, r: FinanceCategory) => (
                r.direction === 'OUT'
                    ? (val ? <Tag color={COST_TYPE_COLORS[val]}>{COST_TYPE_LABELS[val]}</Tag> : <Tag color="warning">не задан</Tag>)
                    : <Text type="secondary">—</Text>
            )
        },
        {
            title: 'Источник',
            dataIndex: 'isSystem',
            key: 'system',
            width: 150,
            render: (val: boolean) => val ? <Tag color="default">Системная</Tag> : <Tag color="cyan">Пользовательская</Tag>
        },
        {
            title: 'Статус',
            dataIndex: 'isActive',
            key: 'active',
            width: 120,
            render: (val: boolean, r: FinanceCategory) => (
                <Switch
                    checked={val}
                    disabled={r.isSystem || !canEditFinance}
                    onChange={(checked) => handleToggleCategoryActive(r.id, checked)}
                    size="small"
                />
            )
        },
        {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: any, r: FinanceCategory) => (
                canEditFinance && !r.isSystem && (
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditCategory(r)} />
                )
            )
        }
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: '4px 8px', marginRight: 8 }} />
                        Финансы · Настройки
                    </div>
                    <h1 className="lc2-title">Настройки финансовых справочников</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Управление счетами, кассами и статьями доходов и расходов
                    </p>
                </div>
            </div>

            {!canEditFinance && (
                <div style={{ marginBottom: 16 }}>
                    <span style={{ color: '#faad14', fontSize: 13 }}>Внимание: У вас нет прав на редактирование финансовых настроек. Разрешен только просмотр.</span>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 250, background: token.colorBgContainer, borderRadius: 8, border: `1px solid ${token.colorBorderSecondary}` }}>
                    <Spin />
                </div>
            ) : (
            <div className="lc-card" style={{ padding: 20 }}>
                <Tabs activeKey={activeTab} onChange={setActiveTab} size="large" type="line" items={[
                    {
                        key: 'accounts',
                        label: 'Счета и кассы',
                        children: (
                            <div style={{ marginTop: 8 }}>
                                <Table
                                    columns={accountColumns}
                                    dataSource={accounts}
                                    rowKey="id"
                                    size="small"
                                    pagination={false}
                                />
                            </div>
                        )
                    },
                    {
                        key: 'categories',
                        label: 'Статьи доходов / расходов',
                        children: (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                                    {canEditFinance && (
                                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateCategory}>Добавить статью</Button>
                                    )}
                                </div>
                                <Tabs defaultActiveKey="IN" size="small" type="card" items={[
                                    {
                                        key: 'IN',
                                        label: 'Поступления',
                                        children: (
                                            <Table
                                                columns={categoryColumns}
                                                dataSource={categories.filter(c => c.direction === 'IN')}
                                                rowKey="id"
                                                size="small"
                                                pagination={false}
                                            />
                                        )
                                    },
                                    {
                                        key: 'OUT',
                                        label: 'Списания',
                                        children: (
                                            <Table
                                                columns={categoryColumns}
                                                dataSource={categories.filter(c => c.direction === 'OUT')}
                                                rowKey="id"
                                                size="small"
                                                pagination={false}
                                            />
                                        )
                                    }
                                ]} />
                            </div>
                        )
                    }
                ]} />
            </div>
            )}

            {/* Account Modal */}
            <Modal
                title="Редактировать счет / кассу"
                open={accountModalOpen}
                onCancel={() => setAccountModalOpen(false)}
                onOk={() => accountForm.submit()}
                confirmLoading={saving}
                okText="Сохранить"
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={accountForm} layout="vertical" onFinish={handleSaveAccount}>
                    <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Укажите название' }]}>
                        <Input size="large" maxLength={60} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Category Modal */}
            <Modal
                title={editingCategory ? "Редактировать статью" : "Создать новую статью"}
                open={categoryModalOpen}
                onCancel={() => setCategoryModalOpen(false)}
                onOk={() => categoryForm.submit()}
                confirmLoading={saving}
                okText={editingCategory ? "Сохранить" : "Создать"}
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={categoryForm} layout="vertical" onFinish={handleSaveCategory}>
                    <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Укажите название' }]}>
                        <Input size="large" maxLength={80} />
                    </Form.Item>
                    
                    {!editingCategory && (
                        <Form.Item name="direction" label="Направление" rules={[{ required: true, message: 'Укажите направление' }]}>
                            <Select size="large">
                                <Select.Option value="IN">Поступление</Select.Option>
                                <Select.Option value="OUT">Расход</Select.Option>
                            </Select>
                        </Form.Item>
                    )}

                    {categoryDirection === 'OUT' && (
                        <Form.Item
                            name="costType"
                            label="Тип затрат"
                            rules={[{ required: true, message: 'Выберите тип' }]}
                            extra="К чему относится расход: к заявке (режет её маржу), к машине (расход ТС) или общий по фирме."
                        >
                            <Select size="large" placeholder="Выберите">
                                {COST_TYPE_OPTIONS.map(o => (
                                    <Select.Option key={o.value} value={o.value}>{o.label} — <span style={{ color: 'var(--lc-text-ter)' }}>{o.hint}</span></Select.Option>
                                ))}
                            </Select>
                        </Form.Item>
                    )}
                </Form>
            </Modal>
        </div>
    );
}
