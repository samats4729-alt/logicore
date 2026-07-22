'use client';

import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Typography, Tag, Segmented, message } from 'antd';
import { ArrowLeftOutlined, ArrowDownOutlined, ArrowUpOutlined, CalendarOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Text } = Typography;

interface PlannedRow {
    orderId: string;
    orderNumber: string;
    direction: 'IN' | 'OUT';
    party: string;
    amount: number;
    dueDate: string | null;
}

export default function PlannedPaymentsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<PlannedRow[]>([]);
    const [totals, setTotals] = useState<{ totalIn: number; totalOut: number }>({ totalIn: 0, totalOut: 0 });
    const [typeFilter, setTypeFilter] = useState<'all' | 'IN' | 'OUT'>('all');

    useEffect(() => { fetchPlanned(); }, []);

    const fetchPlanned = async () => {
        setLoading(true);
        try {
            const res = await api.get('/accounting/planned-payments');
            setRows(res.data?.rows || []);
            setTotals(res.data?.totals || { totalIn: 0, totalOut: 0 });
        } catch {
            message.error('Не удалось загрузить планируемые платежи');
        } finally {
            setLoading(false);
        }
    };

    const money = (v: number) => v.toLocaleString('ru-RU') + ' ₸';
    const isOverdue = (d: string | null) => !!d && dayjs(d).isBefore(dayjs(), 'day');

    const filtered = useMemo(() => rows.filter(r => typeFilter === 'all' || r.direction === typeFilter), [rows, typeFilter]);

    const columns = [
        {
            title: 'Срок оплаты',
            dataIndex: 'dueDate',
            key: 'dueDate',
            width: 160,
            render: (d: string | null) => {
                if (!d) return <Text type="secondary" style={{ fontSize: 13 }}>дата не указана</Text>;
                return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: isOverdue(d) ? 700 : 400, color: isOverdue(d) ? '#dc2626' : undefined }}>{dayjs(d).format('DD.MM.YYYY')}</span>
                        {isOverdue(d) && <Tag color="red" style={{ margin: 0 }}>просрочено</Tag>}
                    </span>
                );
            },
        },
        {
            title: 'Тип',
            key: 'dir',
            width: 140,
            render: (_: any, r: PlannedRow) => r.direction === 'IN'
                ? <Tag color="green" style={{ margin: 0 }}><ArrowDownOutlined /> Нам должны</Tag>
                : <Tag color="red" style={{ margin: 0 }}><ArrowUpOutlined /> Мы должны</Tag>,
        },
        {
            title: 'Заявка',
            dataIndex: 'orderNumber',
            key: 'order',
            width: 130,
            render: (v: string, r: PlannedRow) => (
                <a onClick={() => router.push(`/company/orders/${r.orderId}`)} style={{ fontWeight: 600 }}>{v}</a>
            ),
        },
        {
            title: 'Контрагент',
            dataIndex: 'party',
            key: 'party',
            render: (v: string) => <span style={{ fontSize: 13 }}>{v}</span>,
        },
        {
            title: 'Сумма',
            dataIndex: 'amount',
            key: 'amount',
            align: 'right' as const,
            width: 150,
            render: (v: number, r: PlannedRow) => (
                <strong style={{ color: r.direction === 'IN' ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                    {r.direction === 'IN' ? '+' : '−'}{money(v)}
                </strong>
            ),
        },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Планирование
                    </div>
                    <h1 className="lc2-title">Планируемые платежи</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Что предстоит по деньгам: кто должен заплатить нам и кому должны мы — с плановой датой оплаты по заявке.
                    </p>
                    <Button icon={<CalendarOutlined />} onClick={() => router.push('/company/accounting/calendar')}>
                        Открыть календарём
                    </Button>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#16a34a' }}><ArrowDownOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Нам должны</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#16a34a' }}>{money(totals.totalIn)}</div>
                            <div className="lc2-msub">ожидаем прихода</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#ffeef0', color: '#dc2626' }}><ArrowUpOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Мы должны</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#dc2626' }}>{money(totals.totalOut)}</div>
                            <div className="lc2-msub">предстоит оплатить</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                <Segmented
                    value={typeFilter}
                    onChange={(v) => setTypeFilter(v as 'all' | 'IN' | 'OUT')}
                    options={[
                        { label: 'Все', value: 'all' },
                        { label: 'Нам должны', value: 'IN' },
                        { label: 'Мы должны', value: 'OUT' },
                    ]}
                />
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey={(r) => `${r.orderId}_${r.direction}`}
                    loading={loading}
                    size="small"
                    locale={{ emptyText: 'Нет незакрытых долгов по заявкам' }}
                    pagination={{ pageSize: 30, showSizeChanger: true }}
                />
            </div>

            <p style={{ color: 'var(--lc-text-ter)', fontSize: 12.5, margin: '14px 4px 0' }}>
                <CalendarOutlined /> Плановая дата берётся из заявки (поля «Плановая дата оплаты заказчиком / перевозчику»). Долг закрывается автоматически, когда вносится оплата по заявке.
            </p>
        </div>
    );
}
