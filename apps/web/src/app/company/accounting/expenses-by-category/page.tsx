'use client';

import { useState, useEffect } from 'react';
import { Table, Button, DatePicker, Progress, App } from 'antd';
import { ArrowLeftOutlined, CalendarOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
dayjs.extend(quarterOfYear);

const { RangePicker } = DatePicker;

interface Row { category: string; amount: number; count: number; pct: number }

const money = (v: number) => (v || 0).toLocaleString('ru-RU') + ' ₸';

export default function ExpensesByCategoryPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<Row[]>([]);
    const [total, setTotal] = useState(0);
    const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([dayjs().startOf('month'), dayjs().endOf('month')]);

    useEffect(() => { fetchReport(); }, [dates]);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (dates && dates[0] && dates[1]) { params.startDate = dates[0].startOf('day').toISOString(); params.endDate = dates[1].endOf('day').toISOString(); }
            const res = await api.get('/accounting/expenses-by-category', { params });
            setRows(res.data?.rows || []);
            setTotal(res.data?.total || 0);
        } catch {
            message.error('Не удалось загрузить отчёт');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { title: 'Статья расхода', dataIndex: 'category', key: 'category', render: (v: string) => <span style={{ fontWeight: 500, fontSize: 13 }}>{v}</span> },
        { title: 'Операций', dataIndex: 'count', key: 'count', width: 100, align: 'center' as const },
        { title: 'Сумма', dataIndex: 'amount', key: 'amount', width: 160, align: 'right' as const, render: (v: number) => <strong style={{ fontVariantNumeric: 'tabular-nums', color: '#dc2626' }}>{money(v)}</strong> },
        { title: 'Доля', dataIndex: 'pct', key: 'pct', width: 200, render: (v: number) => <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Progress percent={v} size="small" showInfo={false} strokeColor="#dc2626" style={{ flex: 1, margin: 0 }} /><span style={{ fontSize: 12, width: 34, textAlign: 'right' }}>{v}%</span></div> },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Деньги
                    </div>
                    <h1 className="lc2-title">Расходы по статьям</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 12px' }}>
                        Куда уходят деньги: все расходы за период, сгруппированные по статьям, с долей каждой.
                    </p>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CalendarOutlined style={{ color: 'var(--lc-text-ter)' }} />
                        <RangePicker value={dates} onChange={(v) => setDates(v as any)} format="DD.MM.YYYY" presets={[
                            { label: 'Текущий месяц', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
                            { label: 'Прошлый месяц', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
                            { label: 'Квартал', value: [dayjs().startOf('quarter'), dayjs().endOf('quarter')] },
                            { label: 'Год', value: [dayjs().startOf('year'), dayjs().endOf('year')] },
                        ]} />
                    </span>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#ffeef0', color: '#dc2626' }}><ArrowUpOutlined /></div>
                        <div><div className="lc2-mlabel">Всего расходов</div><div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#dc2626' }}>{money(total)}</div><div className="lc2-msub">за период</div></div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table columns={columns} dataSource={rows} rowKey="category" loading={loading} size="small"
                    locale={{ emptyText: 'Нет расходов за период' }} pagination={{ pageSize: 30 }} />
            </div>
        </div>
    );
}
