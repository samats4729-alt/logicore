'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Typography, Card, Row, Col, Table, Tag, Space, Empty, Spin } from 'antd';
import {
    CheckCircleOutlined, CloseCircleOutlined,
    ExclamationCircleOutlined, ClockCircleOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const statusLabels: Record<string, string> = {
    PENDING: 'Ожидает', ASSIGNED: 'Назначена', EN_ROUTE_PICKUP: 'Едет на погрузку',
    AT_PICKUP: 'На погрузке', LOADING: 'Загрузка', IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке', UNLOADING: 'Разгрузка', COMPLETED: 'Завершена', PROBLEM: 'Проблема',
};

const statusColors: Record<string, string> = {
    PENDING: 'orange', ASSIGNED: 'blue', EN_ROUTE_PICKUP: 'cyan',
    AT_PICKUP: 'geekblue', LOADING: 'purple', IN_TRANSIT: 'processing',
    AT_DELIVERY: 'lime', UNLOADING: 'gold', COMPLETED: 'green', PROBLEM: 'red',
};

const fmt = (n: number) => n.toLocaleString('ru-RU');

function getRoute(order: any): string {
    const pts = order.routePoints || [];
    const pickup = pts.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
    const delivery = pts.find((p: any) => p.pointType === 'DELIVERY');
    const from = pickup?.location?.city || pickup?.location?.address || '—';
    const to = delivery?.location?.city || delivery?.location?.address || '—';
    return `${from} → ${to}`;
}

export default function SharedReportPage() {
    const params = useParams();
    const token = params.token as string;
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const res = await axios.get(`${API_URL}/public/accounting/report/${token}`);
                setData(res.data);
            } catch (err: any) {
                if (err.response?.status === 404) {
                    setError('Ссылка недействительна или срок действия истёк');
                } else {
                    setError('Ошибка загрузки отчёта');
                }
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    const columns = [
        {
            title: '№', dataIndex: 'orderNumber', key: 'num', width: 120,
            sorter: (a: any, b: any) => a.orderNumber.localeCompare(b.orderNumber),
            render: (t: string) => <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>{t}</span>,
        },
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 100,
            sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            render: (d: string) => <span style={{ fontSize: 12, color: '#6b7280' }}>{dayjs(d).format('DD.MM.YY')}</span>,
        },
        {
            title: 'Маршрут', key: 'route', width: 220, ellipsis: true,
            render: (_: any, r: any) => <span style={{ fontSize: 13, color: '#374151' }}>{getRoute(r)}</span>,
        },
        {
            title: 'Груз', dataIndex: 'cargoDescription', key: 'cargo', width: 160, ellipsis: true,
            render: (t: string) => <span style={{ fontSize: 13, color: '#6b7280' }}>{t || '—'}</span>,
        },
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 120,
            render: (s: string) => <Tag color={statusColors[s] || 'default'} style={{ fontSize: 11, fontWeight: 500, borderRadius: 4 }}>{statusLabels[s] || s}</Tag>,
        },
        {
            title: 'Направление', key: 'direction', width: 140,
            render: (_: any, r: any) => (
                <span style={{
                    fontSize: 12, fontWeight: 500, letterSpacing: '0.2px',
                    color: r.direction === 'theyOwe' ? '#059669' : '#dc2626',
                }}>
                    {r.direction === 'theyOwe' ? 'Дебиторская' : 'Кредиторская'}
                </span>
            ),
        },
        {
            title: 'Сумма, ₸', dataIndex: 'amount', key: 'amount', width: 130, align: 'right' as const,
            sorter: (a: any, b: any) => a.amount - b.amount,
            render: (v: number) => v ? <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{fmt(v)}</span> : <span style={{ color: '#d1d5db' }}>—</span>,
        },
        {
            title: 'Оплата', key: 'paid', width: 100, align: 'center' as const,
            render: (_: any, r: any) => (
                r.isPaid
                    ? <span style={{ color: '#059669', fontSize: 12, fontWeight: 500 }}><CheckCircleOutlined style={{ marginRight: 4 }} />Да</span>
                    : <span style={{ color: '#dc2626', fontSize: 12, fontWeight: 500 }}><CloseCircleOutlined style={{ marginRight: 4 }} />Нет</span>
            ),
        },
    ];

    // --- Loading state ---
    if (loading) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: '#f8f9fb',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16, color: '#9ca3af', fontSize: 14, letterSpacing: '0.3px' }}>
                        Загрузка отчёта...
                    </div>
                </div>
            </div>
        );
    }

    // --- Error state ---
    if (error) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: '#f8f9fb',
            }}>
                <div style={{
                    maxWidth: 420, textAlign: 'center', padding: '48px 40px',
                    background: '#fff', borderRadius: 20,
                    boxShadow: '0 8px 40px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
                }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
                        background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <ExclamationCircleOutlined style={{ fontSize: 28, color: '#d97706' }} />
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>
                        Ссылка недействительна
                    </div>
                    <div style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6 }}>
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    // --- No data ---
    if (!data || !data.counterparty) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: '#f8f9fb',
            }}>
                <div style={{
                    maxWidth: 420, textAlign: 'center', padding: '48px 40px',
                    background: '#fff', borderRadius: 20,
                    boxShadow: '0 8px 40px rgba(0,0,0,0.06)',
                }}>
                    <Empty description={<span style={{ color: '#9ca3af' }}>Нет данных по взаиморасчётам</span>} />
                </div>
            </div>
        );
    }

    const cp = data.counterparty;
    const totals = data.totals;

    return (
        <div style={{ minHeight: '100vh', background: '#f8f9fb' }}>
            {/* ===== HEADER ===== */}
            <div style={{
                background: '#0f172a',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Subtle gradient overlay */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(139,92,246,0.1) 50%, rgba(236,72,153,0.08) 100%)',
                }} />

                <div style={{ position: 'relative', maxWidth: 1040, margin: '0 auto', padding: '36px 24px 40px' }}>
                    {/* Logo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: 12,
                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, fontWeight: 800, color: '#fff',
                            boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
                        }}>
                            LC
                        </div>
                        <div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>LogiCore</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                                Система управления логистикой
                            </div>
                        </div>
                    </div>

                    {/* Report title */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 14,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <FileTextOutlined style={{ fontSize: 22, color: 'rgba(255,255,255,0.5)' }} />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6 }}>
                                Отчёт по взаиморасчётам
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                                {data.senderCompany}
                            </div>
                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                    width: 24, height: 1,
                                    background: 'linear-gradient(90deg, rgba(255,255,255,0.3), rgba(255,255,255,0))',
                                }} />
                                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>для</span>
                                <span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                                    {data.counterpartyName}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== CONTENT ===== */}
            <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 24px 80px' }}>
                {/* Summary Cards */}
                <Row gutter={16} style={{ marginBottom: 24 }}>
                    <Col xs={24} sm={8}>
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: '24px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.02)',
                            borderLeft: '4px solid #059669',
                        }}>
                            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 8 }}>
                                Дебиторская задолженность
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', letterSpacing: '-1px' }}>
                                {fmt(totals.unpaidTheyOweUs)} <span style={{ fontSize: 16, fontWeight: 500 }}>₸</span>
                            </div>
                            {totals.theyOweUs > 0 && (
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                                    всего: {fmt(totals.theyOweUs)} ₸
                                </div>
                            )}
                        </div>
                    </Col>
                    <Col xs={24} sm={8}>
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: '24px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.02)',
                            borderLeft: '4px solid #dc2626',
                        }}>
                            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 8 }}>
                                Кредиторская задолженность
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626', letterSpacing: '-1px' }}>
                                {fmt(totals.unpaidWeOweThem)} <span style={{ fontSize: 16, fontWeight: 500 }}>₸</span>
                            </div>
                            {totals.weOweThem > 0 && (
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                                    всего: {fmt(totals.weOweThem)} ₸
                                </div>
                            )}
                        </div>
                    </Col>
                    <Col xs={24} sm={8}>
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: '24px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.02)',
                            borderLeft: `4px solid ${totals.balance >= 0 ? '#3b82f6' : '#f59e0b'}`,
                        }}>
                            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 8 }}>
                                Сальдо
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: totals.balance >= 0 ? '#1e40af' : '#dc2626', letterSpacing: '-1px' }}>
                                {totals.balance >= 0 ? '+' : ''}{fmt(totals.balance)} <span style={{ fontSize: 16, fontWeight: 500 }}>₸</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                                {totals.totalOrders} {totals.totalOrders === 1 ? 'сделка' : totals.totalOrders < 5 ? 'сделки' : 'сделок'}
                            </div>
                        </div>
                    </Col>
                </Row>

                {/* Orders Table */}
                <div style={{
                    background: '#fff', borderRadius: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.02)',
                    overflow: 'hidden',
                }}>
                    {/* Table header */}
                    <div style={{
                        padding: '20px 24px 16px',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
                    }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', letterSpacing: '-0.3px' }}>
                            Реестр сделок
                        </div>
                        <div style={{ display: 'flex', gap: 24 }}>
                            <div style={{ fontSize: 13 }}>
                                <span style={{ color: '#9ca3af' }}>Дебиторская: </span>
                                <span style={{ fontWeight: 600, color: '#059669' }}>{fmt(cp.theyOweUs)} ₸</span>
                                <span style={{ color: '#d1d5db', margin: '0 4px' }}>|</span>
                                <span style={{ color: '#9ca3af', fontSize: 12 }}>оплачено {fmt(cp.theyOweUsPaid)} ₸</span>
                            </div>
                            <div style={{ fontSize: 13 }}>
                                <span style={{ color: '#9ca3af' }}>Кредиторская: </span>
                                <span style={{ fontWeight: 600, color: '#dc2626' }}>{fmt(cp.weOweThem)} ₸</span>
                                <span style={{ color: '#d1d5db', margin: '0 4px' }}>|</span>
                                <span style={{ color: '#9ca3af', fontSize: 12 }}>оплачено {fmt(cp.weOweThemPaid)} ₸</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '0 8px 8px' }}>
                        <Table
                            columns={columns}
                            dataSource={cp.orders}
                            rowKey="id"
                            size="small"
                            pagination={cp.orders.length > 20 ? { pageSize: 20, size: 'small', showTotal: (t: number) => `Всего: ${t}` } : false}
                            scroll={{ x: 1000 }}
                            rowClassName={(record: any) => {
                                if (record.status === 'COMPLETED') return 'row-completed';
                                if (record.status === 'PROBLEM') return 'row-problem';
                                return '';
                            }}
                            summary={() => {
                                if (cp.orders.length < 2) return null;
                                const totalAmount = cp.orders.reduce((s: number, o: any) => s + o.amount, 0);
                                const paidAmount = cp.orders.filter((o: any) => o.isPaid).reduce((s: number, o: any) => s + o.amount, 0);
                                return (
                                    <Table.Summary>
                                        <Table.Summary.Row style={{ background: '#f8f9fb' }}>
                                            <Table.Summary.Cell index={0} colSpan={6}>
                                                <Text strong style={{ fontSize: 13, color: '#1a1a2e' }}>ИТОГО</Text>
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={6} align="right">
                                                <Text strong style={{ fontSize: 13, color: '#1a1a2e' }}>{fmt(totalAmount)} ₸</Text>
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={7} align="center">
                                                <Text style={{ fontSize: 12, color: '#9ca3af' }}>{fmt(paidAmount)} опл.</Text>
                                            </Table.Summary.Cell>
                                        </Table.Summary.Row>
                                    </Table.Summary>
                                );
                            }}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    textAlign: 'center', marginTop: 40, padding: '20px 0',
                }}>
                    <div style={{ color: '#d1d5db', fontSize: 12, lineHeight: 1.8 }}>
                        Отчёт сформирован {dayjs(data.createdAt).format('DD.MM.YYYY в HH:mm')}
                    </div>
                    <div style={{ color: '#e5e7eb', fontSize: 11, marginTop: 2 }}>
                        Ссылка действительна {data.expiresIn}
                    </div>
                    <div style={{
                        width: 32, height: 2, borderRadius: 1,
                        background: 'linear-gradient(90deg, transparent, #e5e7eb, transparent)',
                        margin: '16px auto 0',
                    }} />
                    <div style={{ color: '#d1d5db', fontSize: 11, marginTop: 12, letterSpacing: '0.5px' }}>
                        LogiCore
                    </div>
                </div>
            </div>

            {/* Table styles */}
            <style jsx global>{`
                .ant-table-small .ant-table-thead > tr > th {
                    padding: 10px 14px !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    background: #f8f9fb !important;
                    text-transform: uppercase;
                    letter-spacing: 0.8px;
                    color: #9ca3af !important;
                    border-bottom: 1px solid #f1f5f9 !important;
                }
                .ant-table-small .ant-table-tbody > tr > td {
                    padding: 10px 14px !important;
                    font-size: 13px !important;
                    border-bottom: 1px solid #f8f9fb !important;
                    transition: background 0.15s ease;
                }
                .ant-table-small .ant-table-tbody > tr:hover > td {
                    background: #f0f4ff !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-completed > td {
                    background: #f0fdf4 !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-problem > td {
                    background: #fef2f2 !important;
                }
            `}</style>
        </div>
    );
}
