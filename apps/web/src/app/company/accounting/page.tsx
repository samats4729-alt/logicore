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
        <div style={{ padding: '4px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <Title level={2} style={{ margin: 0, fontWeight: 600 }}>Бухгалтерия</Title>
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
                        style={{ boxShadow: `0 1px 3px ${token.colorBorderSecondary}`, borderRadius: 8 }}
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
                        {(() => {
                            const cardStyle = {
                                background: token.colorBgContainer,
                                borderRadius: 12,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                border: `1px solid ${token.colorBorderSecondary}`,
                            };
                            return (
                                <Row gutter={[16, 16]}>
                                    <Col xs={24} sm={12} md={8}>
                                        <Card bordered={false} style={cardStyle} styles={{ body: { padding: 20 } }}>
                                            <Statistic
                                                title={<span style={{ color: token.colorTextSecondary, fontSize: 13, fontWeight: 500 }}>Выручка за период</span>}
                                                value={summary.revenue}
                                                valueStyle={{ color: token.colorText, fontWeight: 700, fontSize: 20 }}
                                                formatter={(val) => formatMoney(val as number)}
                                                prefix={<WalletOutlined style={{ fontSize: 16, marginRight: 6, color: token.colorPrimary }} />}
                                            />
                                            <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                                                Всего подтвержденных заказов
                                            </div>
                                        </Card>
                                    </Col>

                                    <Col xs={24} sm={12} md={8}>
                                        <Card bordered={false} style={cardStyle} styles={{ body: { padding: 20 } }}>
                                            <Statistic
                                                title={<span style={{ color: token.colorTextSecondary, fontSize: 13, fontWeight: 500 }}>Чистая маржа</span>}
                                                value={summary.margin}
                                                valueStyle={{ color: token.colorText, fontWeight: 700, fontSize: 20 }}
                                                formatter={(val) => formatMoney(val as number)}
                                                suffix={
                                                    <span style={{ fontSize: 14, color: token.colorSuccess, marginLeft: 8, fontWeight: 600 }}>
                                                        ({summary.marginPercentage}%)
                                                    </span>
                                                }
                                                prefix={<BarChartOutlined style={{ fontSize: 16, marginRight: 6, color: token.colorPrimary }} />}
                                            />
                                            <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                                                Рентабельность по Net ставкам
                                            </div>
                                        </Card>
                                    </Col>

                                    <Col xs={24} sm={12} md={8}>
                                        <Card bordered={false} style={cardStyle} styles={{ body: { padding: 20 } }}>
                                            <Statistic
                                                title={<span style={{ color: token.colorTextSecondary, fontSize: 13, fontWeight: 500 }}>Кассовый баланс</span>}
                                                value={summary.cashBalance}
                                                valueStyle={{ color: token.colorText, fontWeight: 700, fontSize: 20 }}
                                                formatter={(val) => formatMoney(val as number)}
                                                prefix={<DollarOutlined style={{ fontSize: 16, marginRight: 6, color: token.colorPrimary }} />}
                                            />
                                            <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                                                Фактический остаток на счетах
                                            </div>
                                        </Card>
                                    </Col>

                                    <Col xs={24} sm={12} md={8}>
                                        <Card bordered={false} style={cardStyle} styles={{ body: { padding: 20 } }}>
                                            <Statistic
                                                title={<span style={{ color: token.colorTextSecondary, fontSize: 13, fontWeight: 500 }}>Дебиторка</span>}
                                                value={summary.debtorSum}
                                                valueStyle={{ color: token.colorText, fontWeight: 700, fontSize: 20 }}
                                                formatter={(val) => formatMoney(val as number)}
                                                prefix={<ArrowUpOutlined style={{ fontSize: 16, marginRight: 4, color: token.colorWarning }} />}
                                            />
                                            <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                                                Ожидаемые поступления от заказчиков
                                            </div>
                                        </Card>
                                    </Col>

                                    <Col xs={24} sm={12} md={8}>
                                        <Card bordered={false} style={cardStyle} styles={{ body: { padding: 20 } }}>
                                            <Statistic
                                                title={<span style={{ color: token.colorTextSecondary, fontSize: 13, fontWeight: 500 }}>Кредиторка</span>}
                                                value={summary.creditorSum}
                                                valueStyle={{ color: token.colorText, fontWeight: 700, fontSize: 20 }}
                                                formatter={(val) => formatMoney(val as number)}
                                                prefix={<ArrowDownOutlined style={{ fontSize: 16, marginRight: 4, color: token.colorError }} />}
                                            />
                                            <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                                                Обязательства перед перевозчиками
                                            </div>
                                        </Card>
                                    </Col>

                                    <Col xs={24} sm={12} md={8}>
                                        <Card bordered={false} style={cardStyle} styles={{ body: { padding: 20 } }}>
                                            <Statistic
                                                title={<span style={{ color: token.colorTextSecondary, fontSize: 13, fontWeight: 500 }}>Неоплаченные рейсы</span>}
                                                value={summary.unpaidOrdersCount}
                                                valueStyle={{ color: token.colorText, fontWeight: 700, fontSize: 20 }}
                                                prefix={<FileTextOutlined style={{ fontSize: 16, marginRight: 6, color: token.colorTextSecondary }} />}
                                            />
                                            <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                                                Количество заявок с задолженностью
                                            </div>
                                        </Card>
                                    </Col>
                                </Row>
                            );
                        })()}
                    </div>
                )
            )}

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {sections.map((section) => (
                    <div key={section.title} style={{ flex: '1 1 300px', minWidth: 300, marginBottom: 20 }}>
                        <Title level={4} style={{ fontSize: 15, fontWeight: 600, color: token.colorText, marginBottom: 12 }}>
                            {section.title}
                        </Title>
                        <div style={{
                            background: token.colorBgContainer,
                            borderRadius: 12,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
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
                                        borderBottom: idx < section.items.length - 1 ? `1px solid ${token.colorBorderSecondary}` : 'none',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = token.colorFillAlter;
                                        e.currentTarget.style.transform = 'translateX(4px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.transform = 'translateX(0)';
                                    }}
                                >
                                    <div style={{
                                        background: item.key === 'incomes' ? token.colorSuccessBg :
                                                    item.key === 'expenses' ? token.colorErrorBg :
                                                    token.colorPrimaryBg,
                                        color: item.key === 'incomes' ? token.colorSuccess :
                                               item.key === 'expenses' ? token.colorError :
                                               token.colorPrimary,
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
                                        <Text style={{ fontSize: 14, fontWeight: 600, display: 'block', color: token.colorText }}>
                                            {item.label}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                                            {item.description}
                                        </Text>
                                    </div>
                                    <RightOutlined style={{ color: token.colorTextDescription, fontSize: 12 }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
