'use client';

import { useState, useEffect } from 'react';
import { Alert, Typography, Button, DatePicker, Table, Space, Tag, theme } from 'antd';
import { ArrowLeftOutlined, FileExcelOutlined, DollarOutlined, LineChartOutlined, WalletOutlined, FallOutlined, RiseOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { money } from '@/lib/money-format';
import Loader from '@/components/ui/Loader';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface PnLReport {
    revenueNet: number;
    executorCostNet: number;
    grossProfit: number;
    otherIncomes: Array<{ name: string; amount: number }>;
    otherExpenses: Array<{ name: string; amount: number }>;
    totalOtherIncomes: number;
    totalOtherExpenses: number;
    /**
     * Курсовые разницы за период. Счёт выставили по одному курсу, деньги
     * пришли по другому — эта разница не выручка и не затрата, поэтому идёт
     * своей строкой.
     */
    exchangeGain?: number;
    exchangeLoss?: number;
    exchangeNet?: number;
    exchangeRows?: Array<{
        documentNumber: string;
        counterpartyName: string;
        currency: string;
        paymentDate: string;
        closed: number;
        documentRate: number | null;
        paymentRate: number | null;
        outcome: 'GAIN' | 'LOSS' | 'NONE';
        amount: number;
    }>;
    /** Валюты, для которых не нашлось курса: их суммы в отчёт не вошли. */
    unconvertedCurrencies?: string[];
    netProfit: number;
    marginPercentage: number;
}

export default function PnLReportPage() {
    const { token } = theme.useToken();
    const router = useRouter();

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
            toast.error('Не удалось загрузить отчет P&L');
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
            toast.success('Отчет P&L экспортирован в Excel');
        } catch {
            toast.error('Ошибка при экспорте отчета');
        } finally {
            setExporting(false);
        }
    };

    const formatMoney = (val?: number) => {
        if (val === undefined || val === null) return '0 ₸';
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(val) + ' ₸';
    };

    // Table rows data builder
    const getReportRows = () => {
        if (!report) return [];
        const rows = [
            { key: 'rev', label: '1. Выручка', val: report.revenueNet, type: 'header_main' },
            { key: 'cost', label: '2. Себестоимость исполнителя', val: report.executorCostNet, type: 'header_main' },
            { key: 'gross', label: 'Валовая прибыль', val: report.grossProfit, type: 'total_accent' },
            { key: 'spacer1', label: '', val: null, type: 'spacer' },
            { key: 'other_in', label: '3. Прочие операционные доходы', val: report.totalOtherIncomes, type: 'header_sub' },
            ...report.otherIncomes.map((i, idx) => ({
                key: `in_${idx}`,
                label: `   └ ${i.name}`,
                val: i.amount,
                type: 'detail'
            })),
            { key: 'spacer2', label: '', val: null, type: 'spacer' },
            { key: 'other_ex', label: '4. Прочие операционные расходы', val: report.totalOtherExpenses, type: 'header_sub' },
            ...report.otherExpenses.map((e, idx) => ({
                key: `ex_${idx}`,
                label: `   └ ${e.name}`,
                val: e.amount,
                type: 'detail'
            })),
            { key: 'spacer3', label: '', val: null, type: 'spacer' },
            // Курсовые разницы показываются обеими сторонами: «ноль» вместо
            // «выиграли 30 000 и потеряли 30 000» скрывает движение денег.
            ...((report.exchangeGain || report.exchangeLoss) ? [
                { key: 'fx', label: '5. Курсовые разницы', val: report.exchangeNet ?? 0, type: 'header_sub' },
                { key: 'fx_gain', label: '   └ доход от курса', val: report.exchangeGain ?? 0, type: 'detail' },
                { key: 'fx_loss', label: '   └ расход от курса', val: report.exchangeLoss ?? 0, type: 'detail' },
                { key: 'spacer4', label: '', val: null, type: 'spacer' },
            ] : []),
            { key: 'net_profit', label: 'Чистая прибыль', val: report.netProfit, type: 'final_accent' },
            { key: 'margin', label: 'Рентабельность чистой прибыли', val: `${report.marginPercentage}%`, type: 'final_info' }
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
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: '4px 8px', marginRight: 8 }} />
                        Бухгалтерия · P&L
                    </div>
                    <h1 className="lc2-title">Прибыли и убытки (P&L)</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Заработок по начислению: доход по заявкам − себестоимость перевозок − прочие расходы. Считается по заявкам, а не по факту оплаты.
                        Все суммы — в тенге: валютные пересчитаны по курсу на дату операции и задним числом не меняются.
                    </p>
                    {!!report?.unconvertedCurrencies?.length && (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message={`Нет курса: ${report.unconvertedCurrencies.join(', ')}`}
                            description="Суммы в этих валютах в отчёт не вошли — иначе они попали бы в него как тенге. Загрузите курс в разделе «Кабинет → Курсы валют», и отчёт пересчитается."
                        />
                    )}
                    <Space wrap>
                        <RangePicker
                            value={dates}
                            onChange={(val) => setDates(val as any)}
                            allowClear={false}
                            style={{
                                borderRadius: 8,
                                background: token.colorBgContainer,
                                border: `1px solid ${token.colorBorderSecondary}`,
                            }}
                        />
                        <Button
                            type="default"
                            icon={<FileExcelOutlined />}
                            onClick={handleExportExcel}
                            loading={exporting}
                            className="lc-cta"
                            style={{
                                borderColor: token.colorSuccess,
                                color: token.colorSuccess,
                                fontWeight: 600,
                                boxShadow: `0 2px 4px ${token.colorSuccess}20`,
                            }}
                        >
                            Скачать Excel
                        </Button>
                    </Space>
                </div>
                {report && (
                    <div className="lc2-metrics">
                        <div className="lc2-metric">
                            <div className="lc2-mic">
                                <WalletOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Выручка</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(report.revenueNet)}</div>
                                <div className="lc2-msub">за период</div>
                            </div>
                        </div>
                        <div className="lc2-metric">
                            <div className="lc2-mic">
                                <FallOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Себестоимость</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(report.executorCostNet)}</div>
                                <div className="lc2-msub">расходы</div>
                            </div>
                        </div>
                        <div className="lc2-metric">
                            <div className="lc2-mic" style={{ background: report.grossProfit >= 0 ? '#e6ffed' : '#ffeef0', color: report.grossProfit >= 0 ? '#28a745' : '#dc3545' }}>
                                <RiseOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Валовая прибыль</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: report.grossProfit >= 0 ? '#28a745' : '#dc3545' }}>{formatMoney(report.grossProfit)}</div>
                                <div className="lc2-msub">{report.grossProfit >= 0 ? 'доход' : 'убыток'}</div>
                            </div>
                        </div>
                        <div className="lc2-metric">
                            <div className="lc2-mic" style={{ background: report.netProfit >= 0 ? '#e6ffed' : '#ffeef0', color: report.netProfit >= 0 ? '#28a745' : '#dc3545' }}>
                                <DollarOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Чистая прибыль</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: report.netProfit >= 0 ? '#28a745' : '#dc3545' }}>{formatMoney(report.netProfit)}</div>
                                <div className="lc2-msub">{report.netProfit >= 0 ? 'прибыль' : 'убыток'}</div>
                            </div>
                        </div>
                        <div className="lc2-metric">
                            <div className="lc2-mic" style={{ background: report.marginPercentage >= 0 ? '#e6ffed' : '#ffeef0', color: report.marginPercentage >= 0 ? '#28a745' : '#dc3545' }}>
                                <LineChartOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Рентабельность</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: report.marginPercentage >= 0 ? '#28a745' : '#dc3545' }}>{report.marginPercentage}%</div>
                                <div className="lc2-msub">чистой прибыли</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 250 }}>
                    <Loader size="large" tip="Составление отчета..." />
                </div>
            ) : report ? (
                <div className="lc-card" style={{ padding: 20 }}>
                    <h2 style={{ fontWeight: 600, fontSize: 15, marginBottom: 16, color: token.colorText }}>Отчёт о прибылях и убытках за выбранный период</h2>
                    <Table
                        columns={columns}
                        dataSource={getReportRows()}
                        rowKey="key"
                        size="small"
                        pagination={false}
                        rowClassName={(r) => {
                            if (r.type === 'spacer') return 'spacer-row';
                            if (r.type === 'total_accent') return 'total-accent-row';
                            if (r.type === 'final_accent') return 'final-accent-row';
                            return '';
                        }}
                    />

                    {/* Расшифровка курсовых разниц: по какому курсу выставили
                        счёт и по какому закрыли долг. Именно это бухгалтер
                        ищет, когда деньги пришли, а суммы не совпали. */}
                    {!!report.exchangeRows?.length && (
                        <div style={{ marginTop: 24 }}>
                            <h2 style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, color: token.colorText }}>
                                Откуда взялись курсовые разницы
                            </h2>
                            <Table
                                size="small"
                                pagination={false}
                                rowKey={(r: any) => `${r.documentNumber}-${r.paymentDate}-${r.amount}`}
                                dataSource={report.exchangeRows}
                                columns={[
                                    {
                                        title: 'Счёт', dataIndex: 'documentNumber', key: 'doc',
                                        render: (v: string, r: any) => (
                                            <span>
                                                <span style={{ fontWeight: 600, fontSize: 12.5 }}>{v}</span>
                                                <span style={{ color: token.colorTextSecondary, fontSize: 12 }}> · {r.counterpartyName}</span>
                                            </span>
                                        ),
                                    },
                                    {
                                        title: 'Оплата', dataIndex: 'paymentDate', key: 'date', width: 110,
                                        render: (v: string) => <span style={{ fontSize: 12 }}>{dayjs(v).format('DD.MM.YYYY')}</span>,
                                    },
                                    {
                                        title: 'Закрыто долга', key: 'closed', width: 140, align: 'right' as const,
                                        render: (_: any, r: any) => (
                                            <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                                                {money(r.closed, r.currency)}
                                            </span>
                                        ),
                                    },
                                    {
                                        title: 'Курс счёта → курс оплаты', key: 'rates', width: 190, align: 'right' as const,
                                        render: (_: any, r: any) => (
                                            <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: token.colorTextSecondary }}>
                                                {r.documentRate?.toLocaleString('ru-RU')} → {r.paymentRate?.toLocaleString('ru-RU')}
                                            </span>
                                        ),
                                    },
                                    {
                                        title: 'Разница', key: 'amount', width: 150, align: 'right' as const,
                                        render: (_: any, r: any) => (
                                            <span style={{
                                                fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                                                color: r.outcome === 'GAIN' ? token.colorSuccess : token.colorError,
                                            }}>
                                                {r.amount > 0 ? '+' : '−'}{formatMoney(Math.abs(r.amount))}
                                                <span style={{ fontWeight: 400 }}> · {r.outcome === 'GAIN' ? 'доход' : 'расход'}</span>
                                            </span>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>Отчет недоступен</div>
            )}

            <style jsx global>{`
                .spacer-row > td { background: var(--lc-card-2) !important; height: 16px; border: none; padding: 0 !important; }
                .total-accent-row > td { background: var(--lc-card-2) !important; border-top: 1px solid var(--lc-border); border-bottom: 2px double var(--lc-border); }
                .final-accent-row > td { background: #f6ffed !important; border-top: 2px solid #b7eb8f; border-bottom: 2px solid #b7eb8f; }
            `}</style>
        </div>
    );
}
