'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Typography, Row, Col, Card, DatePicker, Spin, Space, App, theme, Statistic } from 'antd';
import {
    DollarOutlined,
    WalletOutlined,
    RightOutlined,
    BarChartOutlined,
    TeamOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    FileTextOutlined,
    CalendarOutlined,
    SwapOutlined,
    LineChartOutlined,
    SettingOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
dayjs.extend(quarterOfYear);

const { Title, Text } = Typography;
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

interface MenuItem {
    key: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    href: string;
}

interface MenuSection {
    title: string;
    items: MenuItem[];
}

const sections: MenuSection[] = [
    {
        title: 'Операции',
        items: [
            {
                key: 'incomes',
                label: 'Поступления денег',
                description: 'Регистрация и просмотр входящих платежей',
                icon: <WalletOutlined />,
                color: '#10b981',
                href: '/company/accounting/incomes',
            },
            {
                key: 'expenses',
                label: 'Расходы денег',
                description: 'Учет и распределение исходящих платежей',
                icon: <DollarOutlined />,
                color: '#ef4444',
                href: '/company/accounting/expenses',
            },
        ],
    },
    {
        title: 'Аналитика и Закрытие',
        items: [
            {
                key: 'registry',
                label: 'Финансовый реестр заявок',
                description: 'Маржинальность, платежные статусы и сверка по рейсам',
                icon: <BarChartOutlined />,
                color: '#3b82f6',
                href: '/company/accounting/registry',
            },
            {
                key: 'counterparty-report',
                label: 'Взаиморасчёты с контрагентами',
                description: 'Акты сверки, дебиторская и кредиторская задолженность',
                icon: <TeamOutlined />,
                color: '#8b5cf6',
                href: '/company/accounting/counterparty-report',
            },
            {
                key: 'cashflow',
                label: 'Движение денежных средств (ДДС)',
                description: 'Отчет о фактических денежных потоках по счетам и статьям',
                icon: <SwapOutlined />,
                color: '#10b981',
                href: '/company/accounting/cashflow',
            },
            {
                key: 'pnl',
                label: 'Доходы и расходы (P&L)',
                description: 'Операционная прибыль, прочая деятельность и рентабельность',
                icon: <LineChartOutlined />,
                color: '#f59e0b',
                href: '/company/accounting/pnl',
            },
        ],
    },
    {
        title: 'Настройки',
        items: [
            {
                key: 'settings',
                label: 'Счета и статьи',
                description: 'Настройка расчетных счетов, касс и статей доходов/расходов',
                icon: <SettingOutlined />,
                color: '#64748b',
                href: '/company/accounting/settings',
            },
        ],
    },
];

export default function CompanyAccountingPage() {
    const { token } = theme.useToken();
    const router = useRouter();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(true);
    const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ]);
    const [summary, setSummary] = useState<DashboardSummary | null>(null);

    useEffect(() => {
        fetchSummary();
    }, [dates]);

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

    const formatMoney = (val?: number) => {
        if (val === undefined || val === null) return '0 ₸';
        return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'KZT', maximumFractionDigits: 0 }).format(val).replace('KZT', '₸');
    };

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Финансы · Обзор</div>
                    <h1 className="lc2-title">Бухгалтерия</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Финансовое состояние платформы и аналитика
                    </p>
                    <Space direction="horizontal" size={8}>
                        <CalendarOutlined style={{ color: '#8c8c8c' }} />
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
                </div>
                {!loading && summary && (
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

            {/* ===== ADDITIONAL METRICS ===== */}
            {!loading && summary && (
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
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

            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                    <Spin size="large" />
                </div>
            )}

            {/* ===== MENU SECTIONS ===== */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {sections.map((section) => (
                    <div key={section.title} style={{ flex: '1 1 300px', minWidth: 300, marginBottom: 20 }}>
                        <h4 style={{ fontSize: 15, fontWeight: 600, color: '#1f2937', margin: '0 0 12px' }}>
                            {section.title}
                        </h4>
                        <div className="lc-card" style={{ padding: 0, overflow: 'hidden' }}>
                            {section.items.map((item, idx) => (
                                <div
                                    key={item.key}
                                    onClick={() => router.push(item.href)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 14,
                                        padding: '16px 20px',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s, transform 0.15s',
                                        borderBottom: idx < section.items.length - 1 ? '1px solid #f0f0f0' : 'none',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#f9fafb';
                                        e.currentTarget.style.transform = 'translateX(4px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.transform = 'translateX(0)';
                                    }}
                                >
                                    <div style={{
                                        background: item.key === 'incomes' ? '#e6ffed' :
                                                    item.key === 'expenses' ? '#ffeef0' :
                                                    '#e0f2fe',
                                        color: item.key === 'incomes' ? '#28a745' :
                                               item.key === 'expenses' ? '#dc3545' :
                                               '#0369a1',
                                        fontSize: 18,
                                        width: 40,
                                        height: 40,
                                        borderRadius: 12,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        {item.icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 14, fontWeight: 600, display: 'block', color: '#1f2937' }}>
                                            {item.label}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                                            {item.description}
                                        </Text>
                                    </div>
                                    <RightOutlined style={{ color: '#bfbfbf', fontSize: 12 }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
