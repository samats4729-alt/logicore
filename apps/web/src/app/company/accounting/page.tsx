'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Typography, Row, Col, Card, DatePicker, Spin, Space, App } from 'antd';
import {
    DollarOutlined,
    WalletOutlined,
    RightOutlined,
    BarChartOutlined,
    TeamOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    FileTextOutlined,
    CalendarOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

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
        ],
    },
];

export default function CompanyAccountingPage() {
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
        <div style={{ padding: '4px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <Title level={2} style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>Бухгалтерия</Title>
                    <Text type="secondary">Финансовое состояние платформы и аналитика</Text>
                </div>
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
                        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                    />
                </Space>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                    <Spin size="large" tip="Загрузка данных..." />
                </div>
            ) : (
                summary && (
                    <div style={{ marginBottom: 32 }}>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} sm={12} md={8}>
                                <Card
                                    bordered={false}
                                    style={{
                                        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                                        color: '#fff',
                                        borderRadius: 16,
                                        boxShadow: '0 10px 20px rgba(0,0,0,0.08)',
                                    }}
                                >
                                    <Statistic
                                        title={<span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>Выручка за период</span>}
                                        value={summary.revenue}
                                        formatter={(val) => <span style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>{formatMoney(val as number)}</span>}
                                    />
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                                        Всего подтвержденных заказов
                                    </div>
                                </Card>
                            </Col>

                            <Col xs={24} sm={12} md={8}>
                                <Card
                                    bordered={false}
                                    style={{
                                        background: 'linear-gradient(135deg, #065f46 0%, #064e3b 100%)',
                                        color: '#fff',
                                        borderRadius: 16,
                                        boxShadow: '0 10px 20px rgba(0,0,0,0.08)',
                                    }}
                                >
                                    <Statistic
                                        title={<span style={{ color: '#a7f3d0', fontSize: 13, fontWeight: 500 }}>Чистая маржа</span>}
                                        value={summary.margin}
                                        formatter={(val) => <span style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>{formatMoney(val as number)}</span>}
                                        suffix={
                                            <span style={{ fontSize: 14, color: '#34d399', marginLeft: 8, fontWeight: 600 }}>
                                                ({summary.marginPercentage}%)
                                            </span>
                                        }
                                    />
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#047857' }}>
                                        Рентабельность по Net ставкам
                                    </div>
                                </Card>
                            </Col>

                            <Col xs={24} sm={12} md={8}>
                                <Card
                                    bordered={false}
                                    style={{
                                        background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)',
                                        color: '#fff',
                                        borderRadius: 16,
                                        boxShadow: '0 10px 20px rgba(0,0,0,0.08)',
                                    }}
                                >
                                    <Statistic
                                        title={<span style={{ color: '#c084fc', fontSize: 13, fontWeight: 500 }}>Кассовый баланс</span>}
                                        value={summary.cashBalance}
                                        formatter={(val) => <span style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>{formatMoney(val as number)}</span>}
                                    />
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#a855f7' }}>
                                        Фактический остаток на счетах
                                    </div>
                                </Card>
                            </Col>

                            <Col xs={24} sm={12} md={8}>
                                <Card
                                    bordered={false}
                                    style={{
                                        background: '#fff',
                                        borderRadius: 16,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                                        border: '1px solid #f1f5f9',
                                    }}
                                    bodyStyle={{ padding: 20 }}
                                >
                                    <Statistic
                                        title={<span style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>Дебиторка (нам должны)</span>}
                                        value={summary.debtorSum}
                                        valueStyle={{ color: '#b45309', fontWeight: 700, fontSize: 20 }}
                                        formatter={(val) => formatMoney(val as number)}
                                        prefix={<ArrowUpOutlined style={{ fontSize: 16, marginRight: 4, color: '#d97706' }} />}
                                    />
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                                        Ожидаемые поступления от заказчиков
                                    </div>
                                </Card>
                            </Col>

                            <Col xs={24} sm={12} md={8}>
                                <Card
                                    bordered={false}
                                    style={{
                                        background: '#fff',
                                        borderRadius: 16,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                                        border: '1px solid #f1f5f9',
                                    }}
                                    bodyStyle={{ padding: 20 }}
                                >
                                    <Statistic
                                        title={<span style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>Кредиторка (мы должны)</span>}
                                        value={summary.creditorSum}
                                        valueStyle={{ color: '#be123c', fontWeight: 700, fontSize: 20 }}
                                        formatter={(val) => formatMoney(val as number)}
                                        prefix={<ArrowDownOutlined style={{ fontSize: 16, marginRight: 4, color: '#e11d48' }} />}
                                    />
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                                        Обязательства перед перевозчиками
                                    </div>
                                </Card>
                            </Col>

                            <Col xs={24} sm={12} md={8}>
                                <Card
                                    bordered={false}
                                    style={{
                                        background: '#fff',
                                        borderRadius: 16,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                                        border: '1px solid #f1f5f9',
                                    }}
                                    bodyStyle={{ padding: 20 }}
                                >
                                    <Statistic
                                        title={<span style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>Неоплаченные рейсы</span>}
                                        value={summary.unpaidOrdersCount}
                                        valueStyle={{ color: '#334155', fontWeight: 700, fontSize: 20 }}
                                        prefix={<FileTextOutlined style={{ fontSize: 16, marginRight: 6, color: '#475569' }} />}
                                    />
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                                        Количество заявок с задолженностью
                                    </div>
                                </Card>
                            </Col>
                        </Row>
                    </div>
                )
            )}

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {sections.map((section) => (
                    <div key={section.title} style={{ flex: '1 1 300px', minWidth: 300, marginBottom: 20 }}>
                        <Title level={4} style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 12 }}>
                            {section.title}
                        </Title>
                        <div style={{
                            background: '#fff',
                            borderRadius: 16,
                            border: '1px solid #f1f5f9',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)',
                            overflow: 'hidden',
                        }}>
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
                                        borderBottom: idx < section.items.length - 1 ? '1px solid #f1f5f9' : 'none',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#f8fafc';
                                        e.currentTarget.style.transform = 'translateX(4px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.transform = 'translateX(0)';
                                    }}
                                >
                                    <div style={{
                                        background: `${item.color}15`,
                                        color: item.color,
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
                                        <Text style={{ fontSize: 14, fontWeight: 600, display: 'block', color: '#1e293b' }}>
                                            {item.label}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                                            {item.description}
                                        </Text>
                                    </div>
                                    <RightOutlined style={{ color: '#cbd5e1', fontSize: 12 }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Custom mock for Statistic when rendering on server or fallback
const Statistic = ({ title, value, valueStyle, formatter, prefix, suffix }: any) => {
    const formatted = formatter ? formatter(value) : value;
    return (
        <div>
            <div style={{ marginBottom: 4 }}>{title}</div>
            <div style={{ display: 'flex', alignItems: 'center', ...valueStyle }}>
                {prefix}
                <span>{formatted}</span>
                {suffix}
            </div>
        </div>
    );
};
