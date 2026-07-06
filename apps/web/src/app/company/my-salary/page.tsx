'use client';

import { useEffect, useState } from 'react';
import { Typography, Row, Col, DatePicker, Table, Space, Tag, Empty, Spin } from 'antd';
import { DollarOutlined, FileTextOutlined, AccountBookOutlined, StarOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';
import Link from 'next/link';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface Accrual {
    id: string;
    kind: 'SALARY' | 'PERCENT' | 'KPI';
    amount: number;
    periodMonth: string;
    baseAmount?: number | null;
    percentValue?: number | null;
    percentBase?: string | null;
    schemeSnapshot?: any;
    createdAt: string;
    order?: {
        id: string;
        orderNumber: string;
        date: string;
    } | null;
}

export default function MySalaryPage() {
    const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ]);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{
        accruals: Accrual[];
        totals: { salary: number; percentTotal: number; kpiTotal: number; total: number };
    }>({ accruals: [], totals: { salary: 0, percentTotal: 0, kpiTotal: 0, total: 0 } });

    const loadData = async (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
        setLoading(true);
        try {
            const from = start.format('YYYY-MM');
            const to = end.format('YYYY-MM');
            const res = await api.get(`/payroll/my?from=${from}&to=${to}`);
            setData(res.data);
        } catch (err) {
            console.error('Failed to load salary details', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (dates[0] && dates[1]) {
            loadData(dates[0], dates[1]);
        }
    }, [dates]);

    const percentAccruals = data.accruals.filter(a => a.kind === 'PERCENT');
    const salaryAccruals = data.accruals.filter(a => a.kind === 'SALARY');
    const kpiAccruals = data.accruals.filter(a => a.kind === 'KPI');

    const columns = [
        {
            title: 'Заявка',
            key: 'order',
            render: (_: any, r: Accrual) => r.order ? (
                <Link href={`/company/orders/${r.order.id}`} className="lc-ordernum" style={{ fontSize: 13 }}>
                    {r.order.orderNumber}
                </Link>
            ) : '—',
        },
        {
            title: 'Дата завершения',
            key: 'date',
            render: (_: any, r: Accrual) => r.order?.date ? (
                <Text style={{ fontSize: 12 }}>{dayjs(r.order.date).format('DD.MM.YYYY HH:mm')}</Text>
            ) : '—',
        },
        {
            title: 'База расчета',
            dataIndex: 'baseAmount',
            key: 'base',
            align: 'right' as const,
            render: (v: number | null, r: Accrual) => {
                if (v === null || v === undefined) return '—';
                const baseText = r.percentBase === 'MARGIN' ? ' (Маржа)' : ' (Сумма)';
                return (
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                        {v.toLocaleString('ru-RU')} ₸ <span style={{ color: 'var(--lc-text-ter)', fontSize: 10 }}>{baseText}</span>
                    </span>
                );
            },
        },
        {
            title: 'Ставка',
            dataIndex: 'percentValue',
            key: 'rate',
            align: 'center' as const,
            render: (v: number | null) => v !== null ? <Tag color="blue">{v}%</Tag> : '—',
        },
        {
            title: 'Начислено ₸',
            dataIndex: 'amount',
            key: 'amount',
            align: 'right' as const,
            render: (v: number) => <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v.toLocaleString('ru-RU')} ₸</span>,
        },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1200, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Мои финансы</div>
                    <h1 className="lc2-title">Моя зарплата</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Личный кабинет начислений
                    </p>
                    <RangePicker
                        picker="month"
                        value={dates}
                        onChange={(val) => {
                            if (val && val[0] && val[1]) {
                                setDates([val[0], val[1]]);
                            }
                        }}
                        allowClear={false}
                        placeholder={['Начало', 'Конец']}
                    />
                </div>
                {!loading && (
                    <div className="lc2-metrics">
                        <div className="lc2-metric">
                            <div className="lc2-mic" style={{ background: '#fdf2f8', color: '#db2777' }}>
                                <DollarOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Всего</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#db2777' }}>
                                    {data.totals.total.toLocaleString('ru-RU')} ₸
                                </div>
                                <div className="lc2-msub">за период</div>
                            </div>
                        </div>
                        <div className="lc2-metric">
                            <div className="lc2-mic" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <AccountBookOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Оклад</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {data.totals.salary.toLocaleString('ru-RU')} ₸
                                </div>
                                <div className="lc2-msub">фиксированная часть</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
            ) : (
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                    {/* Percent details */}
                    <div className="lc-card" style={{ padding: 20 }}>
                        <div style={{ fontWeight: 600, marginBottom: 16 }}>
                            <FileTextOutlined style={{ marginRight: 8, color: '#2563eb' }} />Начисленные проценты по заявкам
                        </div>
                        <Table
                            columns={columns}
                            dataSource={percentAccruals}
                            rowKey="id"
                            size="small"
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            locale={{ emptyText: <Empty description="Нет начислений за этот период" /> }}
                        />
                    </div>

                    {/* Salary & KPI details side-by-side */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} lg={12}>
                            <div className="lc-card" style={{ padding: 20 }}>
                                <div style={{ fontWeight: 600, marginBottom: 12 }}>
                                    <AccountBookOutlined style={{ marginRight: 8, color: '#16a34a' }} />Оклад по месяцам
                                </div>
                                {salaryAccruals.length === 0 ? (
                                    <Empty description="Оклады не начислялись" style={{ padding: 20 }} />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {salaryAccruals.map(s => (
                                            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
                                                <Text strong>{dayjs(s.periodMonth + '-02').format('MMMM YYYY')}</Text>
                                                <Text style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.amount.toLocaleString('ru-RU')} ₸</Text>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Col>
                        <Col xs={24} lg={12}>
                            <div className="lc-card" style={{ padding: 20 }}>
                                <div style={{ fontWeight: 600, marginBottom: 12 }}>
                                    <StarOutlined style={{ marginRight: 8, color: '#7c3aed' }} />Бонусы KPI
                                </div>
                                {kpiAccruals.length === 0 ? (
                                    <Empty description="KPI бонусы не начислялись" style={{ padding: 20 }} />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {kpiAccruals.map(k => {
                                            const snap = k.schemeSnapshot as any;
                                            return (
                                                <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
                                                    <div>
                                                        <Text strong style={{ display: 'block' }}>{dayjs(k.periodMonth + '-02').format('MMMM YYYY')}</Text>
                                                        <Text type="secondary" style={{ fontSize: 11 }}>Порог: {snap?.threshold || 0} завершенных заявок</Text>
                                                    </div>
                                                    <Text style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#7c3aed' }}>+{k.amount.toLocaleString('ru-RU')} ₸</Text>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </Col>
                    </Row>
                </Space>
            )}
        </div>
    );
}
