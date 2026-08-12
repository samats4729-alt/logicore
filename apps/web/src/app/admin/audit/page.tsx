'use client';

import { useEffect, useState } from 'react';
import { Table, Select, Switch, Space, Tooltip } from 'antd';
import { History, ListFilter } from 'lucide-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { ROLE_LABELS } from '@/lib/vocabulary';
import nova from '@/components/nova/nova.module.css';

/**
 * Журнал действий по всей платформе.
 *
 * Пять видов действия были покрашены в пять цветов: зелёный, синий, красный,
 * оранжевый, фиолетовый. В ленте из полусотни строк это превращалось в
 * светофор, где ничего не выделено, потому что выделено всё. Цветом осталось
 * только удаление — единственное, что нельзя отменить.
 */
const ACTION_META: Record<string, { label: string; danger?: boolean }> = {
    CREATE: { label: 'Создание' },
    UPDATE: { label: 'Изменение' },
    DELETE: { label: 'Удаление', danger: true },
    STATUS: { label: 'Статус' },
    SETTINGS: { label: 'Настройки' },
};

/**
 * Названия объектов. Список полный по тому, что пишет сервер: незнакомый
 * вид показывался как есть, и в журнале стояло «order_document» — владелец
 * читал название таблицы вместо названия дела.
 */
const ENTITY_LABELS: Record<string, string> = {
    order: 'Заявка',
    order_document: 'Документ рейса',
    document: 'Документ',
    accounting_document: 'Бухгалтерский документ',
    accounting_document_numbering: 'Нумерация документов',
    expense: 'Расход',
    income: 'Доход',
    payment: 'Платёж',
    payment_proof: 'Подтверждение оплаты',
    finance_account: 'Счёт организации',
    closed_period: 'Закрытый период',
    exchange_rate: 'Курс валюты',
    currency_revaluation: 'Переоценка валюты',
    partner: 'Контрагент',
    employee: 'Сотрудник',
    driver: 'Водитель',
    permissions: 'Права',
    location: 'Адрес',
    company: 'Организация',
    company_bin_conflict: 'Совпадение БИН',
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
            toast.error('Ошибка загрузки журнала');
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
            toast.success(enabled
                ? 'Журнал действий включён для админов компаний'
                : 'Журнал действий скрыт от компаний');
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Ошибка сохранения');
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
                    {r.userRole && (
                        <div style={{ fontSize: 11, color: 'var(--nova-fg-3)' }}>
                            {ROLE_LABELS[r.userRole] || r.userRole}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Действие', dataIndex: 'action', key: 'action', width: 110,
            render: (v: string) => {
                const meta = ACTION_META[v] || { label: v };
                return (
                    <span className={`${nova.chip}${meta.danger ? ` ${nova.chipNeg}` : ''}`}>
                        {meta.label}
                    </span>
                );
            },
        },
        {
            title: 'Объект', key: 'entity',
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.entityLabel || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--nova-fg-3)' }}>{ENTITY_LABELS[r.entity] || r.entity}</div>
                </div>
            ),
        },
        {
            title: 'Детали', dataIndex: 'details', key: 'details', width: 220, ellipsis: true,
            render: (v: any) => v ? (
                <Tooltip title={<pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(v, null, 2)}</pre>}>
                    <span style={{ fontSize: 11.5, color: 'var(--nova-fg-3)' }}>{JSON.stringify(v)}</span>
                </Tooltip>
            ) : null,
        },
    ];

    return (
        <div>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Журнал действий</h1>
                    <p className={nova.subtitle}>
                        Все изменения данных по всем компаниям платформы: кто, что и когда.
                    </p>
                </div>
            </div>

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <ListFilter size={14} />
                    <h2 className={nova.cardTitle}>Отбор</h2>
                </div>
                <div className={nova.cardBody}>
                    <Space size="large" wrap>
                        <Space>
                            <Switch checked={companiesEnabled} loading={savingFlag} onChange={handleToggleCompanies} />
                            <span style={{ fontSize: 13 }}>
                                Раздел «Журнал действий» виден админам компаний
                            </span>
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
                </div>
            </section>

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <History size={14} />
                    <h2 className={nova.cardTitle}>Что происходило</h2>
                    {total > 0 && <span className={nova.cardCount}>{total}</span>}
                </div>
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
            </section>
        </div>
    );
}
