'use client';

import { useState, useEffect } from 'react';
import { Typography, Card, Button, DatePicker, Row, Col, Statistic, Table, Space, Spin, App, Tag, theme } from 'antd';
import { ArrowLeftOutlined, FileExcelOutlined, DollarOutlined, LineChartOutlined, PercentageOutlined, WalletOutlined, FallOutlined, RiseOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface PnLReport {
    revenueNet: number;
    executorCostNet: number;
    grossProfit: number;
    otherIncomes: Array<{ name: string; amount: number }>;
    otherExpenses: Array<{ name: string; amount: number }>;
    totalOtherIncomes: number;
    totalOtherExpenses: number;
    netProfit: number;
    marginPercentage: number;
}

export default function PnLReportPage() {
    const { token } = theme.useToken();
    const router = useRouter();
    const { message } = App.useApp();

    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ]);
    const [report, setReport] = useState<PnLReport | null>(null);

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
            const res = await api.get('/accounting/pnl', { params });
            setReport(res.data);
        } catch {
            message.error('Не удалось загрузить отчет P&L');
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
            const res = await api.get('/accounting/pnl/export', {
                params,
                responseType: 'blob',
            });
            const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const startStr = dates?.[0]?.format('YYYY-MM-DD') || 'all';
            const endStr = dates?.[1]?.format('YYYY-MM-DD') || 'all';
            link.setAttribute('download', `pnl_${startStr}_${endStr}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            message.success('Отчет P&L экспортирован в Excel');
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

    // Table rows data builder
    const getReportRows = () => {
        if (!report) return [];
        const rows = [
            { key: 'rev', label: '1. Выручка (Revenue Net)', val: report.revenueNet, type: 'header_main' },
            { key: 'cost', label: '2. Себестоимость исполнителя (Net)', val: report.executorCostNet, type: 'header_main' },
            { key: 'gross', label: 'Валовая прибыль (Gross Profit)', val: report.grossProfit, type: 'total_accent' },
            { key: 'spacer1', label: '', val: null, type: 'spacer' },
            { key: 'other_in', label: '3. Прочие операционные доходы (Всего)', val: report.totalOtherIncomes, type: 'header_sub' },
            ...report.otherIncomes.map((i, idx) => ({
                key: `in_${idx}`,
                label: `   └ ${i.name}`,
                val: i.amount,
                type: 'detail'
            })),
            { key: 'spacer2', label: '', val: null, type: 'spacer' },
            { key: 'other_ex', label: '4. Прочие операционные расходы (Всего)', val: report.totalOtherExpenses, type: 'header_sub' },
            ...report.otherExpenses.map((e, idx) => ({
                key: `ex_${idx}`,
                label: `   └ ${e.name}`,
                val: e.amount,
                type: 'detail'
            })),
            { key: 'spacer3', label: '', val: null, type: 'spacer' },
            { key: 'net_profit', label: 'Чистая прибыль (Net Profit)', val: report.netProfit, type: 'final_accent' },
            { key: 'margin', label: 'Рентабельность чистой прибыли (%)', val: `${report.marginPercentage}%`, type: 'final_info' }
        ];
        return rows;
    };

    const columns = [
        {
            title: 'Показатель',
            dataIndex: 'label',
            key: 'label',
            render: (val: string, r: any) => {
                if (r.type === 'total_accent' || r.type === 'final_accent') {
                    return <span style={{ fontWeight: 800, fontSize: 14 }}>{val}</span>;
                }
                if (r.type === 'header_main' || r.type === 'header_sub') {
                    return <span style={{ fontWeight: 600, fontSize: 13 }}>{val}</span>;
                }
                return <span style={{ color: token.colorTextDescription, paddingLeft: 12, fontSize: 13, whiteSpace: 'pre' }}>{val}</span>;
            }
        },
        {
            title: 'Сумма (₸) / Процент',
            dataIndex: 'val',
            key: 'val',
            align: 'right' as const,
            width: 200,
            render: (val: any, r: any) => {
                if (val === null || val === undefined) return '';
                const displayVal = typeof val === 'number' ? formatMoney(val) : val;
                if (r.type === 'final_accent') {
                    const color = (report?.netProfit || 0) >= 0 ? '#389e0d' : '#cf1322';
                    return <span style={{ fontWeight: 800, fontSize: 16, color }}>{displayVal}</span>;
                }
                if (r.type === 'total_accent') {
                    const color = (report?.grossProfit || 0) >= 0 ? '#389e0d' : '#cf1322';
                    return <span style={{ fontWeight: 800, fontSize: 14, color }}>{displayVal}</span>;
                }
                if (r.type === 'header_main') {
                    return <span style={{ fontWeight: 600, fontSize: 13 }}>{displayVal}</span>;
                }
                if (r.type === 'header_sub') {
                    return <span style={{ fontWeight: 600, fontSize: 13 }}>{displayVal}</span>;
                }
                return <span style={{ fontSize: 13 }}>{displayVal}</span>;
            }
        }
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/accounting')} style={{ padding: '4px 8px' }} />
                    <div>
                        <Title level={4} style={{ margin: 0 }}>Прибыли и убытки (P&L / Доходы и расходы)</Title>
                        <Text type="secondary">Финансовые результаты на основе начислений по закрытым сделкам</Text>
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
                    <Spin size="large" tip="Составление отчета..." />
                </div>
            ) : report ? (
                <div>
                    {/* KPI Cards */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                        <Col xs={24} sm={12} md={5}>
                            <Card size="small" style={cardStyle}>
                                <Statistic
                                    title={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>Выручка (Net)</span>}
                                    value={report.revenueNet}
                                    valueStyle={{ fontSize: 16, fontWeight: 700 }}
                                    formatter={(v) => formatMoney(v as number)}
                                    prefix={<WalletOutlined style={{ fontSize: 14, color: token.colorPrimary, marginRight: 4 }} />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={5}>
                            <Card size="small" style={cardStyle}>
                                <Statistic
                                    title={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>Себестоимость (Net)</span>}
                                    value={report.executorCostNet}
                                    valueStyle={{ fontSize: 16, fontWeight: 700, color: token.colorTextSecondary }}
                                    formatter={(v) => formatMoney(v as number)}
                                    prefix={<FallOutlined style={{ fontSize: 14, marginRight: 4, color: '#bfbfbf' }} />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={5}>
                            <Card size="small" style={cardStyle}>
                                <Statistic
                                    title={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>Валовая прибыль</span>}
                                    value={report.grossProfit}
                                    valueStyle={{ fontSize: 16, fontWeight: 700, color: report.grossProfit >= 0 ? '#389e0d' : '#cf1322' }}
                                    formatter={(v) => formatMoney(v as number)}
                                    prefix={<RiseOutlined style={{ fontSize: 14, marginRight: 4 }} />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={5}>
                            <Card size="small" style={cardStyle}>
                                <Statistic
                                    title={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>Чистая прибыль</span>}
                                    value={report.netProfit}
                                    valueStyle={{ fontSize: 18, fontWeight: 800, color: report.netProfit >= 0 ? '#389e0d' : '#cf1322' }}
                                    formatter={(v) => formatMoney(v as number)}
                                    prefix={<DollarOutlined style={{ fontSize: 16, marginRight: 4 }} />}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                            <Card size="small" style={cardStyle}>
                                <Statistic
                                    title={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>Рентабельность</span>}
                                    value={report.marginPercentage}
                                    valueStyle={{ fontSize: 16, fontWeight: 700, color: report.marginPercentage >= 0 ? '#389e0d' : '#cf1322' }}
                                    formatter={(v) => `${v}%`}
                                    prefix={<LineChartOutlined style={{ fontSize: 14, marginRight: 4 }} />}
                                />
                            </Card>
                        </Col>
                    </Row>

                    {/* Report Table */}
                    <Card style={cardStyle} title={<span style={{ fontWeight: 600 }}>Отчёт о прибылях и убытках за выбранный период</span>}>
                        <Table
                            columns={columns}
                            dataSource={getReportRows()}
                            rowKey="key"
                            size="middle"
                            pagination={false}
                            rowClassName={(r) => {
                                if (r.type === 'spacer') return 'spacer-row';
                                if (r.type === 'total_accent') return 'total-accent-row';
                                if (r.type === 'final_accent') return 'final-accent-row';
                                return '';
                            }}
                        />
                    </Card>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>Отчет недоступен</div>
            )}

            <style jsx global>{`
                .spacer-row > td { background: #fcfcfc !important; height: 16px; border: none; padding: 0 !important; }
                .total-accent-row > td { background: #fafafa !important; border-top: 1px solid #f0f0f0; border-bottom: 2px double #d9d9d9; }
                .final-accent-row > td { background: #f6ffed !important; border-top: 2px solid #b7eb8f; border-bottom: 2px solid #b7eb8f; }
            `}</style>
        </div>
    );
}
