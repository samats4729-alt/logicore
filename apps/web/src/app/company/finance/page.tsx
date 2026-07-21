'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Row, Col, DatePicker, Space, App, Typography } from 'antd';
import {
    WalletOutlined,
    BarChartOutlined,
    DollarOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    FileTextOutlined,
    CalendarOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
dayjs.extend(quarterOfYear);

const { RangePicker } = DatePicker;

interface DashboardSummary {
    revenue: number;
    margin: number;
    marginPercentage: number;
    debtorSum: number;
    creditorSum: number;
    cashBalance: number;
    unpaidOrdersCount: number;
}

interface Link {
    label: string;
    href: string;
    show: boolean;
}
interface Group {
    title: string;
    links: Link[];
}

export default function FinanceHubPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const { user } = useAuthStore();

    const isAdmin = ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '');
    const hasPerm = (perm: string) => isAdmin || (user?.permissions || []).includes(perm);
    const acc = hasPerm('accounting');

    const [loading, setLoading] = useState(acc);
    const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ]);
    const [summary, setSummary] = useState<DashboardSummary | null>(null);

    useEffect(() => {
        if (!acc) return;
        const fetchSummary = async () => {
            setLoading(true);
            try {
                const params: any = {};
                if (dates && dates[0] && dates[1]) {
                    params.startDate = dates[0].startOf('day').toISOString();
                    params.endDate = dates[1].endOf('day').toISOString();
                }
                const res = await api.get('/accounting/dashboard-summary', { params });
                setSummary(res.data);
            } catch (err: any) {
                message.error('Не удалось загрузить сводные показатели');
            } finally {
                setLoading(false);
            }
        };
        fetchSummary();
    }, [dates, acc]);

    const formatMoney = (val?: number) => {
        if (val === undefined || val === null) return '0 ₸';
        return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'KZT', maximumFractionDigits: 0 }).format(val).replace('KZT', '₸');
    };

    const groups: Group[] = [
        {
            title: 'Операции',
            links: [
                { label: 'Счета', href: '/company/accounting/invoices', show: acc },
                { label: 'Поступления', href: '/company/accounting/incomes', show: acc },
                { label: 'Расходы', href: '/company/accounting/expenses', show: acc },
                { label: 'Реестр заявок', href: '/company/accounting/registry', show: acc },
            ],
        },
        {
            title: 'Отчёты',
            links: [
                { label: 'ДДС', href: '/company/accounting/cashflow', show: acc },
                { label: 'P&L', href: '/company/accounting/pnl', show: acc },
                { label: 'Взаиморасчёты', href: '/company/accounting/counterparty-report', show: acc },
                { label: 'Отчёты', href: '/company/reports', show: acc },
            ],
        },
        {
            title: 'Инструменты',
            links: [
                { label: 'Зарплата', href: '/company/payroll', show: acc && isAdmin },
                { label: 'Моя зарплата', href: '/company/my-salary', show: user?.role === 'LOGISTICIAN' },
                { label: 'Калькулятор', href: '/company/calculator', show: true },
                { label: 'Статьи доходов и расходов', href: '/company/accounting/settings', show: acc },
            ],
        },
    ]
        .map(g => ({ ...g, links: g.links.filter(l => l.show) }))
        .filter(g => g.links.length > 0);

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            {/* ===== HERO ===== */}
            <div className="lc2-hero" style={{ marginBottom: 24 }}>
                <div>
                    <div className="lc-eyebrow">Финансы · Обзор</div>
                    <h1 className="lc2-title">Учёт и финансы компании</h1>
                    {acc && (
                        <Space direction="horizontal" size={8} style={{ marginTop: 10 }}>
                            <CalendarOutlined style={{ color: 'var(--lc-text-ter)' }} />
                            <RangePicker
                                value={dates}
                                onChange={(val) => setDates(val as any)}
                                allowClear={true}
                                presets={[
                                    { label: 'Сегодня', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
                                    { label: 'Текущий месяц', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
                                    { label: 'Прошлый месяц', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
                                    { label: 'Текущий квартал', value: [dayjs().startOf('quarter'), dayjs().endOf('quarter')] },
                                    { label: 'Текущий год', value: [dayjs().startOf('year'), dayjs().endOf('year')] },
                                ]}
                            />
                        </Space>
                    )}
                </div>
                {acc && !loading && summary && (
                    <div className="lc2-metrics">
                        <div className="lc2-metric">
                            <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                                <WalletOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Выручка</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatMoney(summary.revenue)}
                                </div>
                                <div className="lc2-msub">за период</div>
                            </div>
                        </div>
                        <div className="lc2-metric">
                            <div className="lc2-mic" style={{ background: '#e6ffed', color: '#28a745' }}>
                                <BarChartOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Маржа</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatMoney(summary.margin)}
                                </div>
                                <div className="lc2-msub" style={{ color: '#28a745' }}>{summary.marginPercentage}%</div>
                            </div>
                        </div>
                        <div className="lc2-metric">
                            <div className="lc2-mic" style={{ background: '#fff3e0', color: '#e67e22' }}>
                                <DollarOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Баланс</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatMoney(summary.cashBalance)}
                                </div>
                                <div className="lc2-msub">касса</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== ЗАДОЛЖЕННОСТЬ ===== */}
            {acc && !loading && summary && (
                <Row gutter={[16, 16]} style={{ marginBottom: 28 }}>
                    <Col xs={24} sm={8}>
                        <div className="lc-card" style={{ padding: 16 }}>
                            <div style={{ color: 'var(--lc-text-ter)', fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
                                <ArrowUpOutlined style={{ marginRight: 4, color: '#e67e22' }} />
                                Дебиторка
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
                                {formatMoney(summary.debtorSum)}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}>Ожидаемые поступления от заказчиков</div>
                        </div>
                    </Col>
                    <Col xs={24} sm={8}>
                        <div className="lc-card" style={{ padding: 16 }}>
                            <div style={{ color: 'var(--lc-text-ter)', fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
                                <ArrowDownOutlined style={{ marginRight: 4, color: '#dc3545' }} />
                                Кредиторка
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
                                {formatMoney(summary.creditorSum)}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}>Обязательства перед перевозчиками</div>
                        </div>
                    </Col>
                    <Col xs={24} sm={8}>
                        <div className="lc-card" style={{ padding: 16 }}>
                            <div style={{ color: 'var(--lc-text-ter)', fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
                                <FileTextOutlined style={{ marginRight: 4, color: 'var(--lc-text-sec)' }} />
                                Неоплаченные рейсы
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
                                {summary.unpaidOrdersCount}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}>Количество заявок с задолженностью</div>
                        </div>
                    </Col>
                </Row>
            )}

            {/* ===== НАВИГАЦИЯ ===== */}
            <div className="lc-cabinet-grid">
                {groups.map(g => (
                    <div key={g.title} className="lc-cabinet-group">
                        <div className="lc-cabinet-group-title">{g.title}</div>
                        <ul className="lc-cabinet-links">
                            {g.links.map(l => (
                                <li key={l.label}>
                                    <button type="button" onClick={() => router.push(l.href)}>
                                        {l.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            <style jsx>{`
                .lc-cabinet-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
                    gap: 28px 40px;
                }
                .lc-cabinet-group-title {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: var(--lc-text-ter);
                    padding-bottom: 8px;
                    margin-bottom: 8px;
                    border-bottom: 1px solid var(--lc-border);
                }
                .lc-cabinet-links {
                    list-style: none;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .lc-cabinet-links button {
                    background: none;
                    border: none;
                    padding: 6px 8px;
                    margin: 0 -8px;
                    width: calc(100% + 16px);
                    text-align: left;
                    font-size: 13.5px;
                    color: var(--lc-text-sec);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background .12s ease, color .12s ease;
                }
                .lc-cabinet-links button:hover {
                    background: var(--lc-hover);
                    color: var(--lc-primary, #1677ff);
                }
            `}</style>
        </div>
    );
}
