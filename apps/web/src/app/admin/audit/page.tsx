'use client';

import { useEffect, useState } from 'react';
import { Card, Table, Tag, Select, Switch, Space, Typography, message, Tooltip } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';

const { Title, Text } = Typography;

const ACTION_META: Record<string, { label: string; color: string }> = {
    CREATE: { label: 'Создание', color: 'green' },
    UPDATE: { label: 'Изменение', color: 'blue' },
    DELETE: { label: 'Удаление', color: 'red' },
    STATUS: { label: 'Статус', color: 'orange' },
    SETTINGS: { label: 'Настройки', color: 'purple' },
};

const ENTITY_LABELS: Record<string, string> = {
    order: 'Заявка',
    expense: 'Расход',
    income: 'Доход',
    payment: 'Платёж',
    partner: 'Контрагент',
    employee: 'Сотрудник',
    driver: 'Водитель',
    permissions: 'Права',
    location: 'Адрес',
    subscription: 'Подписка',
    billing: 'Биллинг',
};

export default function AdminAuditPage() {
    const [rows, setRows] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [companies, setCompanies] = useState<any[]>([]);
    const [companyFilter, setCompanyFilter] = useState<string | undefined>(undefined);
    const [companiesEnabled, setCompaniesEnabled] = useState(false);
    const [savingFlag, setSavingFlag] = useState(false);

    const load = async (p = page, companyId = companyFilter) => {
        setLoading(true);
        try {
            const res = await api.get('/audit/admin', {
                params: { page: p, limit: 50, companyId: companyId || undefined },
            });
            setRows(res.data.data || []);
            setTotal(res.data.total || 0);
        } catch {
            message.error('Ошибка загрузки журнала');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(1);
        api.get('/billing/admin/subscriptions').then(res => setCompanies(res.data || [])).catch(() => {});
        api.get('/audit/status').then(res => setCompaniesEnabled(!!res.data.companiesEnabled)).catch(() => {});
    }, []);

    const handleToggleCompanies = async (enabled: boolean) => {
        setSavingFlag(true);
        try {
            await api.put('/audit/admin/settings', { companiesEnabled: enabled });
            setCompaniesEnabled(enabled);
            message.success(enabled
                ? 'Журнал действий включён для админов компаний'
                : 'Журнал действий скрыт от компаний');
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка сохранения');
        } finally {
            setSavingFlag(false);
        }
    };

    const companyName = (id: string | null) =>
        id ? (companies.find(c => c.id === id)?.name || id.slice(0, 8)) : 'Платформа';

    const columns = [
        {
            title: 'Время', dataIndex: 'createdAt', key: 'time', width: 140,
            render: (v: string) => <span style={{ fontSize: 12 }}>{dayjs(v).format('DD.MM.YY HH:mm')}</span>,
        },
        {
            title: 'Компания', dataIndex: 'companyId', key: 'company', width: 180, ellipsis: true,
            render: (v: string | null) => <span style={{ fontSize: 12 }}>{companyName(v)}</span>,
        },
        {
            title: 'Пользователь', key: 'user', width: 170, ellipsis: true,
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{r.userName || '—'}</div>
                    {r.userRole && <div style={{ fontSize: 11, color: '#8a91a0' }}>{r.userRole}</div>}
                </div>
            ),
        },
        {
            title: 'Действие', dataIndex: 'action', key: 'action', width: 110,
            render: (v: string) => {
                const meta = ACTION_META[v] || { label: v, color: 'default' };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Объект', key: 'entity',
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.entityLabel || '—'}</div>
                    <div style={{ fontSize: 11, color: '#8a91a0' }}>{ENTITY_LABELS[r.entity] || r.entity}</div>
                </div>
            ),
        },
        {
            title: 'Детали', dataIndex: 'details', key: 'details', width: 220, ellipsis: true,
            render: (v: any) => v ? (
                <Tooltip title={<pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(v, null, 2)}</pre>}>
                    <span style={{ fontSize: 11.5, color: '#8a91a0' }}>{JSON.stringify(v)}</span>
                </Tooltip>
            ) : null,
        },
    ];

    return (
        <div style={{ padding: '0 4px' }}>
            <Title level={3} style={{ marginBottom: 4 }}><HistoryOutlined /> Журнал действий</Title>
            <Text type="secondary">Все изменения данных по всем компаниям платформы</Text>

            <Card size="small" style={{ marginTop: 16 }}>
                <Space size="large" wrap>
                    <Space>
                        <Switch checked={companiesEnabled} loading={savingFlag} onChange={handleToggleCompanies} />
                        <span>Раздел «Журнал действий» виден админам компаний</span>
                    </Space>
                    <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Все компании"
                        style={{ width: 260 }}
                        value={companyFilter}
                        onChange={(v) => { setCompanyFilter(v); setPage(1); load(1, v); }}
                        options={companies.map(c => ({ value: c.id, label: c.name }))}
                    />
                </Space>
            </Card>

            <Card size="small" style={{ marginTop: 12 }}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={rows}
                    loading={loading}
                    size="small"
                    pagination={{
                        current: page,
                        pageSize: 50,
                        total,
                        showSizeChanger: false,
                        onChange: (p) => { setPage(p); load(p); },
                        showTotal: (t) => `Всего: ${t}`,
                    }}
                />
            </Card>
        </div>
    );
}
