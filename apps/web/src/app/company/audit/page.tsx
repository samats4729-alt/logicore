'use client';

import { useEffect, useState } from 'react';
import { Table, Tag, Tooltip, Empty } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';

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
};

export default function CompanyAuditPage() {
    const [rows, setRows] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);

    const load = async (p = 1) => {
        setLoading(true);
        try {
            const res = await api.get('/audit/company', { params: { page: p, limit: 50 } });
            setRows(res.data.data || []);
            setTotal(res.data.total || 0);
            setForbidden(false);
        } catch (e: any) {
            if (e.response?.status === 403) setForbidden(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(1); }, []);

    const columns = [
        {
            title: 'Время', dataIndex: 'createdAt', key: 'time', width: 130,
            render: (v: string) => <span style={{ fontSize: 12, color: 'var(--lc-text-sec)' }}>{dayjs(v).format('DD.MM.YY HH:mm')}</span>,
        },
        {
            title: 'Сотрудник', key: 'user', width: 180, ellipsis: true,
            render: (_: any, r: any) => <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.userName || '—'}</span>,
        },
        {
            title: 'Действие', dataIndex: 'action', key: 'action', width: 110,
            render: (v: string) => {
                const meta = ACTION_META[v] || { label: v, color: 'default' };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Что изменилось', key: 'entity',
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.entityLabel || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--lc-text-ter)' }}>{ENTITY_LABELS[r.entity] || r.entity}</div>
                </div>
            ),
        },
        {
            title: 'Детали', dataIndex: 'details', key: 'details', width: 200, ellipsis: true,
            render: (v: any) => v ? (
                <Tooltip title={<pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(v, null, 2)}</pre>}>
                    <span style={{ fontSize: 11.5, color: 'var(--lc-text-ter)' }}>{JSON.stringify(v)}</span>
                </Tooltip>
            ) : null,
        },
    ];

    return (
        <div className="lc-page">
            {/* ===== HERO ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Кабинет · Журнал</div>
                    <h1 className="lc2-title">Журнал действий</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0' }}>
                        Кто и когда менял данные компании: заявки, финансы, контрагенты, сотрудники
                    </p>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16 }}>
                {forbidden ? (
                    <Empty
                        image={<HistoryOutlined style={{ fontSize: 44, color: 'var(--lc-text-ter)' }} />}
                        description="Журнал действий недоступен на вашем тарифе"
                        style={{ padding: '40px 0' }}
                    />
                ) : (
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
                )}
            </div>
        </div>
    );
}
