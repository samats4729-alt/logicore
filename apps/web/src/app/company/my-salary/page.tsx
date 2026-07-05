'use client';

import { useEffect, useState } from 'react';
import { Typography, Card, Row, Col, DatePicker, Table, Space, Tag, Empty, Spin } from 'antd';
import { DollarOutlined, FileTextOutlined, AccountBookOutlined, StarOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';
import Link from 'next/link';

const { Title, Text } = Typography;
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
                    <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                        {v.toLocaleString('ru-RU')} ₸ <Text type="secondary" style={{ fontSize: 10 }}>{baseText}</Text>
                    </Text>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div className="lc-eyebrow">Мои финансы</div>
                    <Title level={3} style={{ margin: 0 }}>Личный кабинет начислений</Title>
                </div>
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

            {loading ? (
                <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
            ) : (
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                    {/* Summary cards */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={12} lg={6}>
                            <Card size="small" bordered={false} style={{ background: '#fdf2f8', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Всего за период</Text>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#db2777', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
                                    {data.totals.total.toLocaleString('ru-RU')} ₸
                                </div>
                                <Text style={{ fontSize: 10, color: '#f472b6' }}>Все начисления суммарно</Text>
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <Card size="small" bordered={false} style={{ background: '#f0fdf4', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Оклад</Text>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
                                    {data.totals.salary.toLocaleString('ru-RU')} ₸
                                </div>
                                <Text style={{ fontSize: 10, color: '#4ade80' }}>Фиксированная часть</Text>
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <Card size="small" bordered={false} style={{ background: '#eff6ff', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Проценты с заявок</Text>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
                                    {data.totals.percentTotal.toLocaleString('ru-RU')} ₸
                                </div>
                                <Text style={{ fontSize: 10, color: '#60a5fa' }}>От маржи или сумм заявок</Text>
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <Card size="small" bordered={false} style={{ background: '#faf5ff', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Бонусы KPI</Text>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
                                    {data.totals.kpiTotal.toLocaleString('ru-RU')} ₸
                                </div>
                                <Text style={{ fontSize: 10, color: '#a78bfa' }}>За выполнение показателей</Text>
                            </Card>
                        </Col>
                    </Row>

                    {/* Percent details */}
                    <Card title={<span style={{ fontWeight: 600 }}><FileTextOutlined style={{ marginRight: 8, color: '#2563eb' }} />Начисленные проценты по заявкам</span>} size="small">
                        <Table
                            columns={columns}
                            dataSource={percentAccruals}
                            rowKey="id"
                            size="small"
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            locale={{ emptyText: <Empty description="Нет начислений за этот период" /> }}
                        />
                    </Card>

                    {/* Salary & KPI details side-by-side */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} lg={12}>
                            <Card title={<span style={{ fontWeight: 600 }}><AccountBookOutlined style={{ marginRight: 8, color: '#16a34a' }} />Оклад по месяцам</span>} size="small" style={{ height: '100%' }}>
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
                            </Card>
                        </Col>
                        <Col xs={24} lg={12}>
                            <Card title={<span style={{ fontWeight: 600 }}><StarOutlined style={{ marginRight: 8, color: '#7c3aed' }} />Бонусы KPI</span>} size="small" style={{ height: '100%' }}>
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
                            </Card>
                        </Col>
                    </Row>
                </Space>
            )}
        </div>
    );
}
