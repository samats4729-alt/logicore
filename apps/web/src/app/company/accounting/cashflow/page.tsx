'use client';

import { useState, useEffect } from 'react';
import { Typography, Card, Button, DatePicker, Table, Row, Col, Statistic, Tabs, Space, Spin, App, Tag, theme } from 'antd';
import { ArrowLeftOutlined, CalendarOutlined, FileExcelOutlined, ArrowUpOutlined, ArrowDownOutlined, WalletOutlined, DollarOutlined, SwapOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface FlowItem {
    id: string;
    date: string;
    direction: 'IN' | 'OUT';
    amount: number;
    method: string;
    accountName: string;
    categoryName: string;
    counterpartyName: string;
    note: string;
    source: 'payment' | 'income' | 'expense';
}

interface CashflowReport {
    startBalance: number;
    totalIn: number;
    totalOut: number;
    netChange: number;
    endBalance: number;
    accounts: Array<{ name: string; in: number; out: number; balance: number }>;
    methods: Array<{ name: string; in: number; out: number; balance: number }>;
    categories: Array<{ name: string; direction: 'IN' | 'OUT'; amount: number }>;
    flows: FlowItem[];
}

export default function CashflowReportPage() {
    const { token } = theme.useToken();
    const router = useRouter();
    const { message } = App.useApp();

    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ]);
    const [report, setReport] = useState<CashflowReport | null>(null);

    useEffect(() => {
        fetchReport();
    }, [dates]);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (dates && dates[0] && dates[1]) {
                params.startDate = dates[0].startOf('day').toISOString();
                params.endDate = dates[1].endOf('day').toISOString();
            }
            const res = await api.get('/accounting/cashflow', { params });
            setReport(res.data);
        } catch {
            message.error('Не удалось загрузить отчет ДДС');
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = async () => {
        setExporting(true);
        try {
            const params: any = {};
            if (dates && dates[0] && dates[1]) {
                params.startDate = dates[0].startOf('day').toISOString();
                params.endDate = dates[1].endOf('day').toISOString();
            }
            const res = await api.get('/accounting/cashflow/export', {
                params,
                responseType: 'blob',
            });
            const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const startStr = dates?.[0]?.format('YYYY-MM-DD') || 'all';
            const endStr = dates?.[1]?.format('YYYY-MM-DD') || 'all';
            link.setAttribute('download', `cashflow_${startStr}_${endStr}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            message.success('Отчет ДДС экспортирован в Excel');
        } catch {
            message.error('Ошибка при экспорте отчета');
        } finally {
            setExporting(false);
        }
    };

    const formatMoney = (val?: number) => {
        if (val === undefined || val === null) return '0 ₸';
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(val) + ' ₸';
    };

    const cardStyle = {
        borderRadius: 8,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    };

    // Columns config
    const flowColumns = [
        {
            title: 'Дата',
            dataIndex: 'date',
            key: 'date',
            width: 100,
            render: (d: string) => dayjs(d).format('DD.MM.YY')
        },
        {
            title: 'Направление',
            dataIndex: 'direction',
            key: 'direction',
            width: 120,
            render: (dir: 'IN' | 'OUT') => (
                dir === 'IN' ? <Tag color="green">Поступление</Tag> : <Tag color="volcano">Расход</Tag>
            )
        },
        {
            title: 'Сумма',
            dataIndex: 'amount',
            key: 'amount',
            width: 130,
            align: 'right' as const,
            render: (amt: number, r: FlowItem) => (
                <Text strong style={{ color: r.direction === 'IN' ? '#389e0d' : '#cf1322' }}>
                    {r.direction === 'IN' ? '+' : '-'}{formatMoney(amt)}
                </Text>
            )
        },
        {
            title: 'Способ оплаты',
            dataIndex: 'method',
            key: 'method',
            width: 120,
            render: (m: string) => {
                const labels: Record<string, string> = { CASH: 'Наличные', BANK: 'Банк', CARD: 'Карта', OTHER: 'Прочее' };
                return labels[m] || m;
            }
        },
        {
            title: 'Счёт / Касса',
            dataIndex: 'accountName',
            key: 'account',
            width: 140
        },
        {
            title: 'Статья',
            dataIndex: 'categoryName',
            key: 'category',
            width: 150
        },
        {
            title: 'Контрагент',
            dataIndex: 'counterpartyName',
            key: 'counterparty',
            width: 150
        },
        {
            title: 'Примечание',
            dataIndex: 'note',
            key: 'note',
            ellipsis: true
        }
    ];

    const accountColumns = [
        {
            title: 'Счет / Касса',
            dataIndex: 'name',
            key: 'name',
            render: (val: string) => <Text strong style={{ fontSize: 13 }}>{val}</Text>
        },
        {
            title: 'Поступления (+)',
            dataIndex: 'in',
            key: 'in',
            align: 'right' as const,
            render: (val: number) => <Text style={{ color: '#389e0d' }}>{formatMoney(val)}</Text>
        },
        {
            title: 'Списания',
            dataIndex: 'out',
            key: 'out',
            align: 'right' as const,
            render: (val: number) => <Text style={{ color: '#cf1322' }}>{formatMoney(val)}</Text>
        },
        {
            title: 'Сальдо',
            dataIndex: 'balance',
            key: 'balance',
            align: 'right' as const,
            render: (val: number) => <Text strong style={{ color: val >= 0 ? '#389e0d' : '#cf1322' }}>{val >= 0 ? '+' : ''}{formatMoney(val)}</Text>
        }
    ];

    const categoryColumns = [
        {
            title: 'Статья доходов / расходов',
            dataIndex: 'name',
            key: 'name',
            render: (val: string) => <Text strong style={{ fontSize: 13 }}>{val}</Text>
        },
        {
            title: 'Направление',
            dataIndex: 'direction',
            key: 'direction',
            width: 150,
            render: (val: 'IN' | 'OUT') => (
                val === 'IN' ? <Tag color="green">Доход</Tag> : <Tag color="volcano">Расход</Tag>
            )
        },
        {
            title: 'Всего за период',
            dataIndex: 'amount',
            key: 'amount',
            align: 'right' as const,
            render: (val: number, r: any) => (
                <Text strong style={{ color: r.direction === 'IN' ? '#389e0d' : '#cf1322' }}>
                    {formatMoney(val)}
                </Text>
            )
        }
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/accounting')} style={{ padding: '4px 8px' }} />
                    <div>
                        <Title level={4} style={{ margin: 0 }}>Движение денежных средств (ДДС)</Title>
                        <Text type="secondary">Фактическое движение денег по счетам и кассам</Text>
                    </div>
                </div>
                <Space wrap>
                    <RangePicker
                        value={dates}
                        onChange={(val) => setDates(val as any)}
                        allowClear={false}
                        style={cardStyle}
                    />
                    <Button
                        type="primary"
                        icon={<FileExcelOutlined />}
                        onClick={handleExportExcel}
                        loading={exporting}
                        style={{ background: '#10b981', borderColor: '#10b981' }}
                    >
                        Скачать Excel
                    </Button>
                </Space>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 250 }}>
                    <Spin size="large" tip="Вычисление показателей..." />
                </div>
            ) : report ? (
                <div>
                    {/* KPI Balance Cards */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                        <Col xs={24} sm={12} md={5}>
                            <Card size="small" style={cardStyle}>
                                <Statistic
                                    title={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>Начальный остаток</span>}
                                    value={report.startBalance}
                                    valueStyle={{ fontSize: 16, fontWeight: 700 }}
                                    formatter={(v) => formatMoney(v as number)}
                                    prefix={<WalletOutlined style={{ fontSize: 14, color: token.colorPrimary, marginRight: 4 }} />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={5}>
                            <Card size="small" style={cardStyle}>
                                <Statistic
                                    title={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>Поступления (+)</span>}
                                    value={report.totalIn}
                                    valueStyle={{ fontSize: 16, fontWeight: 700, color: '#389e0d' }}
                                    formatter={(v) => formatMoney(v as number)}
                                    prefix={<ArrowUpOutlined style={{ fontSize: 14, marginRight: 4 }} />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={5}>
                            <Card size="small" style={cardStyle}>
                                <Statistic
                                    title={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>Списания</span>}
                                    value={report.totalOut}
                                    valueStyle={{ fontSize: 16, fontWeight: 700, color: '#cf1322' }}
                                    formatter={(v) => formatMoney(v as number)}
                                    prefix={<ArrowDownOutlined style={{ fontSize: 14, marginRight: 4 }} />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                            <Card size="small" style={cardStyle}>
                                <Statistic
                                    title={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>Чистый поток</span>}
                                    value={report.netChange}
                                    valueStyle={{ fontSize: 16, fontWeight: 800, color: report.netChange >= 0 ? '#389e0d' : '#cf1322' }}
                                    formatter={(v) => formatMoney(v as number)}
                                    prefix={<SwapOutlined style={{ fontSize: 14, marginRight: 4 }} />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={5}>
                            <Card size="small" style={cardStyle}>
                                <Statistic
                                    title={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>Конечный остаток</span>}
                                    value={report.endBalance}
                                    valueStyle={{ fontSize: 16, fontWeight: 700 }}
                                    formatter={(v) => formatMoney(v as number)}
                                    prefix={<WalletOutlined style={{ fontSize: 14, color: '#8c8c8c', marginRight: 4 }} />}
                                />
                            </Card>
                        </Col>
                    </Row>

                    {/* Breakdown Tabs */}
                    <Card style={cardStyle}>
                        <Tabs defaultActiveKey="flows" items={[
                            {
                                key: 'flows',
                                label: `Операции (${report.flows.length})`,
                                children: (
                                    <Table
                                        columns={flowColumns}
                                        dataSource={report.flows}
                                        rowKey="id"
                                        size="small"
                                        pagination={{ pageSize: 25, showSizeChanger: true }}
                                        scroll={{ x: true }}
                                    />
                                )
                            },
                            {
                                key: 'accounts',
                                label: 'По счетам и кассам',
                                children: (
                                    <Table
                                        columns={accountColumns}
                                        dataSource={report.accounts}
                                        rowKey="name"
                                        size="small"
                                        pagination={false}
                                    />
                                )
                            },
                            {
                                key: 'categories',
                                label: 'Распределение по статьям',
                                children: (
                                    <Table
                                        columns={categoryColumns}
                                        dataSource={report.categories}
                                        rowKey={(r) => `${r.name}_${r.direction}`}
                                        size="small"
                                        pagination={{ pageSize: 20 }}
                                    />
                                )
                            }
                        ]} />
                    </Card>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>Сводка недоступна</div>
            )}
        </div>
    );
}
