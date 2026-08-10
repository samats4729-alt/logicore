'use client';

import { useState, useEffect } from 'react';
import { Typography, Button, Table, Tabs, Switch, Modal, Form, Input, InputNumber, DatePicker, Select, Space, Tag, theme } from 'antd';
import { ArrowLeftOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import CurrencySelect from '@/components/orders/CurrencySelect';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';

const { Text } = Typography;

interface FinanceAccount {
    id: string;
    name: string;
    kind: 'CASH' | 'BANK';
    /** Валюта счёта. Один счёт — одна валюта. */
    currency: string;
    isDefault: boolean;
    isActive: boolean;
    openingBalance?: number;
    openingDate?: string | null;
    // Печатные реквизиты банковского счёта: именно они уходят в счёт на
    // оплату, выставленный с этого счёта, и в блок платёжного поручения PDF.
    iban?: string | null;
    bankName?: string | null;
    bankBic?: string | null;
    kbe?: string | null;
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

interface ServiceItem {
    id: string;
    name: string;
    unit: string;
    isActive: boolean;
    isDefault: boolean;
}

const COST_TYPE_OPTIONS: { value: CostType; label: string; hint: string }[] = [
    { value: 'PER_ORDER', label: 'По заявке', hint: 'Себестоимость рейса — уменьшает маржу заявки' },
    { value: 'PER_VEHICLE', label: 'По машине', hint: 'Расход конкретного грузовика' },
    { value: 'GENERAL', label: 'Общехозяйственный', hint: 'Общий расход фирмы: аренда, зарплата…' },
];
const COST_TYPE_LABELS: Record<string, string> = { PER_ORDER: 'По заявке', PER_VEHICLE: 'По машине', GENERAL: 'Общехозяйственный' };
const COST_TYPE_COLORS: Record<string, string> = { PER_ORDER: 'blue', PER_VEHICLE: 'purple', GENERAL: 'default' };

export default function FinanceSettingsPage() {
    const { token } = theme.useToken();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuthStore();
    const canEditFinance = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT';

    // Вкладку можно задать ссылкой: ?tab=accounts | categories | services
    const rawTab = searchParams?.get('tab') || '';
    const initialTab = rawTab === 'categories' ? 'categories' : rawTab === 'services' ? 'services' : 'accounts';
    const [activeTab, setActiveTab] = useState(initialTab);

    const [loading, setLoading] = useState(false);
    const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
    const [categories, setCategories] = useState<FinanceCategory[]>([]);
    const [services, setServices] = useState<ServiceItem[]>([]);

    const [serviceModalOpen, setServiceModalOpen] = useState(false);
    const [editingService, setEditingService] = useState<ServiceItem | null>(null);
    const [serviceForm] = Form.useForm();

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
            const [accRes, catRes, svcRes] = await Promise.all([
                api.get('/accounting/finance-accounts'),
                api.get('/accounting/finance-categories'),
                api.get('/accounting/service-catalog'),
            ]);
            setAccounts(accRes.data || []);
            setCategories(catRes.data || []);
            setServices(svcRes.data || []);
        } catch {
            toast.error('Не удалось загрузить настройки');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAccount = () => {
        if (!canEditFinance) return;
        setEditingAccount(null);
        accountForm.resetFields();
        accountForm.setFieldsValue({ kind: 'BANK', currency: 'KZT', openingBalance: 0 });
        setAccountModalOpen(true);
    };

    const handleEditAccount = (record: FinanceAccount) => {
        if (!canEditFinance) return;
        setEditingAccount(record);
        accountForm.setFieldsValue({
            name: record.name,
            kind: record.kind,
            currency: record.currency || 'KZT',
            openingBalance: record.openingBalance || 0,
            openingDate: record.openingDate ? dayjs(record.openingDate) : null,
            iban: record.iban || '',
            bankName: record.bankName || '',
            bankBic: record.bankBic || '',
            kbe: record.kbe || '',
        });
        setAccountModalOpen(true);
    };

    const handleSaveAccount = async (values: {
        name: string;
        kind?: 'CASH' | 'BANK';
        currency?: string;
        openingBalance?: number;
        openingDate?: dayjs.Dayjs | null;
        iban?: string;
        bankName?: string;
        bankBic?: string;
        kbe?: string;
    }) => {
        setSaving(true);
        try {
            const kind = editingAccount ? editingAccount.kind : (values.kind || 'BANK');
            const isBank = kind === 'BANK';
            // У кассы печатных реквизитов нет — счёт с неё не выставляют.
            const requisites = isBank ? {
                iban: values.iban?.trim() || null,
                bankName: values.bankName?.trim() || null,
                bankBic: values.bankBic?.trim() || null,
                kbe: values.kbe?.trim() || null,
            } : {};
            const payload = {
                name: values.name,
                currency: values.currency || 'KZT',
                openingBalance: values.openingBalance ?? 0,
                openingDate: values.openingDate ? values.openingDate.toISOString() : null,
                ...requisites,
            };

            if (editingAccount) {
                await api.put(`/accounting/finance-accounts/${editingAccount.id}`, payload);
            } else {
                await api.post('/accounting/finance-accounts', { ...payload, kind });
            }
            toast.success(editingAccount ? 'Счёт сохранён' : 'Счёт создан');
            setAccountModalOpen(false);
            fetchSettings();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Ошибка сохранения');
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
                toast.success('Статья обновлена');
            } else {
                await api.post('/accounting/finance-categories', {
                    name: values.name,
                    direction: values.direction,
                    ...(values.direction === 'OUT' ? { costType: values.costType ?? null } : {}),
                });
                toast.success('Статья добавлена');
            }
            setCategoryModalOpen(false);
            fetchSettings();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Ошибка сохранения статьи');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleCategoryActive = async (id: string, active: boolean) => {
        try {
            await api.put(`/accounting/finance-categories/${id}/deactivate`, { active });
            toast.success(active ? 'Статья активирована' : 'Статья деактивирована');
            fetchSettings();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Не удалось изменить статус статьи');
        }
    };

    const handleCreateService = () => {
        if (!canEditFinance) return;
        setEditingService(null);
        serviceForm.resetFields();
        serviceForm.setFieldsValue({ unit: 'услуга', isDefault: false });
        setServiceModalOpen(true);
    };

    const handleEditService = (record: ServiceItem) => {
        if (!canEditFinance) return;
        setEditingService(record);
        serviceForm.setFieldsValue({ name: record.name, unit: record.unit, isDefault: record.isDefault });
        setServiceModalOpen(true);
    };

    const handleSaveService = async (values: { name: string; unit?: string; isDefault?: boolean }) => {
        setSaving(true);
        try {
            if (editingService) {
                await api.put(`/accounting/service-catalog/${editingService.id}`, values);
                toast.success('Услуга обновлена');
            } else {
                await api.post('/accounting/service-catalog', values);
                toast.success('Услуга добавлена');
            }
            setServiceModalOpen(false);
            fetchSettings();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Ошибка сохранения услуги');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleServiceActive = async (id: string, active: boolean) => {
        try {
            await api.put(`/accounting/service-catalog/${id}/deactivate`, { active });
            toast.success(active ? 'Услуга активирована' : 'Услуга скрыта');
            fetchSettings();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Не удалось изменить статус услуги');
        }
    };

    const serviceColumns = [
        {
            title: 'Наименование услуги',
            dataIndex: 'name',
            key: 'name',
            render: (val: string, r: ServiceItem) => (
                <Text style={{ fontSize: 13, color: r.isActive ? undefined : token.colorTextDescription }}>
                    {val}{r.isDefault && <Tag color="green" style={{ marginLeft: 8 }}>по умолчанию</Tag>}
                </Text>
            )
        },
        { title: 'Ед. изм.', dataIndex: 'unit', key: 'unit', width: 130, render: (v: string) => <Text type="secondary">{v}</Text> },
        {
            title: 'Статус', dataIndex: 'isActive', key: 'active', width: 120,
            render: (val: boolean, r: ServiceItem) => (
                <Switch checked={val} disabled={!canEditFinance} onChange={(checked) => handleToggleServiceActive(r.id, checked)} size="small" />
            )
        },
        {
            title: '', key: 'actions', width: 80,
            render: (_: any, r: ServiceItem) => (
                canEditFinance && <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditService(r)} />
            )
        }
    ];

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
            title: 'Валюта',
            dataIndex: 'currency',
            key: 'currency',
            width: 100,
            render: (val: string) => (
                val && val !== 'KZT'
                    ? <Tag color="gold">{val}</Tag>
                    : <Text type="secondary">₸ тенге</Text>
            ),
        },
        {
            // Незаполненные реквизиты видно сразу: без них в счёт уйдут
            // данные из карточки организации, а не этого счёта.
            title: 'Реквизиты для счетов',
            key: 'requisites',
            render: (_: any, r: FinanceAccount) => {
                if (r.kind !== 'BANK') return <Text type="secondary">—</Text>;
                if (!r.iban && !r.bankName) {
                    return <Text type="secondary" style={{ fontSize: 12 }}>Не заполнены</Text>;
                }
                return (
                    <div style={{ fontSize: 12 }}>
                        <div>{r.bankName || '—'}</div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {[r.iban, r.bankBic && `БИК ${r.bankBic}`, r.kbe && `Кбе ${r.kbe}`].filter(Boolean).join(' · ')}
                        </Text>
                    </div>
                );
            }
        },
        {
            title: 'По умолчанию',
            dataIndex: 'isDefault',
            key: 'default',
            width: 130,
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
                        Управление счетами, кассами, статьями доходов и расходов и наименованиями услуг
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
                    <Loader />
                </div>
            ) : (
            <div className="lc-card" style={{ padding: 20 }}>
                <Tabs activeKey={activeTab} onChange={setActiveTab} size="large" type="line" items={[
                    {
                        key: 'accounts',
                        label: 'Счета и кассы',
                        children: (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
                                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                                        Один счёт — одна валюта. Для долларов заведите отдельный счёт: на тенговый
                                        их положить нельзя, иначе остаток перестанет сходиться с банком.
                                    </Text>
                                    {canEditFinance && (
                                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateAccount}>Добавить счёт</Button>
                                    )}
                                </div>
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
                    },
                    {
                        key: 'services',
                        label: 'Наименование услуг',
                        children: (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                                        Формулировки услуг для актов выполненных работ и счетов. Услуга «по умолчанию» подставляется в акт автоматически.
                                    </Text>
                                    {canEditFinance && (
                                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateService}>Добавить услугу</Button>
                                    )}
                                </div>
                                <Table
                                    columns={serviceColumns}
                                    dataSource={services}
                                    rowKey="id"
                                    size="small"
                                    pagination={false}
                                />
                            </div>
                        )
                    }
                ]} />
            </div>
            )}

            {/* Account Modal */}
            <Modal
                title={editingAccount ? 'Редактировать счёт / кассу' : 'Новый счёт или касса'}
                open={accountModalOpen}
                onCancel={() => setAccountModalOpen(false)}
                onOk={() => accountForm.submit()}
                confirmLoading={saving}
                okText={editingAccount ? 'Сохранить' : 'Создать'}
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={accountForm} layout="vertical" onFinish={handleSaveAccount}>
                    <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Укажите название' }]}>
                        <Input size="large" maxLength={60} placeholder="Например: Валютный счёт в Halyk" />
                    </Form.Item>
                    {!editingAccount && (
                        <Form.Item name="kind" label="Тип" rules={[{ required: true }]}>
                            <Select
                                size="large"
                                options={[
                                    { value: 'BANK', label: 'Расчётный счёт в банке' },
                                    { value: 'CASH', label: 'Касса (наличные)' },
                                ]}
                            />
                        </Form.Item>
                    )}
                    <Form.Item
                        name="currency"
                        label="Валюта счёта"
                        rules={[{ required: true, message: 'Выберите валюту' }]}
                        extra={editingAccount
                            ? 'Пока по счёту не было платежей, валюту можно поменять. После первого платежа — только новый счёт.'
                            : 'Все деньги на этом счёте будут в этой валюте. Платёж в другой валюте на него не примут.'}
                    >
                        <CurrencySelect width="100%" />
                    </Form.Item>
                    {(editingAccount ? editingAccount.kind === 'BANK' : true) && (
                        <>
                            <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0 4px', color: 'var(--lc-text-sec)' }}>
                                Реквизиты для счетов
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--lc-text-ter)', marginBottom: 10 }}>
                                Печатаются в счёте на оплату, выставленном с этого счёта. По ним контрагент платит —
                                у компании с двумя банками важно не перепутать.
                            </div>
                            <Form.Item name="iban" label="ИИК (номер счёта)">
                                <Input size="large" maxLength={34} placeholder="KZ00 0000 0000 0000 0000" />
                            </Form.Item>
                            <Form.Item name="bankName" label="Банк">
                                <Input size="large" maxLength={200} placeholder="АО «Kaspi Bank»" />
                            </Form.Item>
                            <Space size={12} style={{ display: 'flex' }}>
                                <Form.Item name="bankBic" label="БИК" style={{ flex: 1 }}>
                                    <Input size="large" maxLength={11} placeholder="CASPKZKA" />
                                </Form.Item>
                                <Form.Item name="kbe" label="Кбе" style={{ width: 110 }}>
                                    <Input size="large" maxLength={2} placeholder="17" />
                                </Form.Item>
                            </Space>
                        </>
                    )}
                    <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0 10px', color: 'var(--lc-text-sec)' }}>Ввод остатка</div>
                    <Form.Item
                        name="openingBalance"
                        label="Начальный остаток"
                        extra="Сколько денег уже есть на этом счёте/в кассе на старте — в валюте счёта"
                    >
                        <InputNumber size="large" style={{ width: '100%' }} min={0} placeholder="0" formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} />
                    </Form.Item>
                    <Form.Item name="openingDate" label="На дату" extra="Движения с этой даты прибавляются к остатку">
                        <DatePicker size="large" style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="Дата начала учёта" />
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

            {/* Service Modal */}
            <Modal
                title={editingService ? 'Редактировать услугу' : 'Новая услуга'}
                open={serviceModalOpen}
                onCancel={() => setServiceModalOpen(false)}
                onOk={() => serviceForm.submit()}
                confirmLoading={saving}
                okText={editingService ? 'Сохранить' : 'Создать'}
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={serviceForm} layout="vertical" onFinish={handleSaveService}>
                    <Form.Item name="name" label="Наименование услуги" rules={[{ required: true, message: 'Укажите наименование' }]}
                        extra="Как услуга будет написана в акте, например «Транспортно-экспедиционные услуги»">
                        <Input size="large" maxLength={120} />
                    </Form.Item>
                    <Form.Item name="unit" label="Единица измерения">
                        <Select size="large" options={[
                            { value: 'услуга', label: 'услуга' },
                            { value: 'рейс', label: 'рейс' },
                            { value: 'км', label: 'км' },
                            { value: 'т', label: 'т' },
                        ]} />
                    </Form.Item>
                    <Form.Item name="isDefault" label="Услуга по умолчанию" valuePropName="checked" extra="Подставляется в акт автоматически (может быть только одна)">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
