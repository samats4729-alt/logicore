'use client';

import { useState, useEffect } from 'react';
import { Table, Button, DatePicker, Tag, App } from 'antd';
import { ArrowLeftOutlined, CalendarOutlined, WalletOutlined, BarChartOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
dayjs.extend(quarterOfYear);

const { RangePicker } = DatePicker;

interface Row { carrier: string; orders: number; revenue: number; cost: number; margin: number; marginPct: number }
interface Totals { orders: number; revenue: number; cost: number; margin: number }

const money = (v: number) => (v || 0).toLocaleString('ru-RU') + ' ₸';

export default function CarrierProfitPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<Row[]>([]);
    const [totals, setTotals] = useState<Totals>({ orders: 0, revenue: 0, cost: 0, margin: 0 });
    const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([dayjs().startOf('month'), dayjs().endOf('month')]);

    useEffect(() => { fetchReport(); }, [dates]);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (dates && dates[0] && dates[1]) { params.startDate = dates[0].startOf('day').toISOString(); params.endDate = dates[1].endOf('day').toISOString(); }
            const res = await api.get('/accounting/carrier-profit', { params });
            setRows(res.data?.rows || []);
            setTotals(res.data?.totals || { orders: 0, revenue: 0, cost: 0, margin: 0 });
        } catch {
            message.error('Не удалось загрузить отчёт');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { title: 'Перевозчик', dataIndex: 'carrier', key: 'carrier', render: (v: string) => <span style={{ fontWeight: 500, fontSize: 13 }}>{v}</span> },
        { title: 'Заявок', dataIndex: 'orders', key: 'orders', width: 90, align: 'center' as const },
        { title: 'Выручка', dataIndex: 'revenue', key: 'revenue', width: 150, align: 'right' as const, render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(v)}</span> },
        { title: 'Оплата перевозчику', dataIndex: 'cost', key: 'cost', width: 170, align: 'right' as const, render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums', color: '#dc2626' }}>{money(v)}</span> },
        { title: 'Маржа', dataIndex: 'margin', key: 'margin', width: 150, align: 'right' as const, render: (v: number) => <strong style={{ fontVariantNumeric: 'tabular-nums', color: v >= 0 ? '#16a34a' : '#dc2626' }}>{money(v)}</strong> },
        { title: '%', dataIndex: 'marginPct', key: 'pct', width: 80, align: 'right' as const, render: (v: number) => <Tag color={v >= 0 ? 'green' : 'red'} style={{ margin: 0 }}>{v}%</Tag> },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Прибыль
                    </div>
                    <h1 className="lc2-title">Прибыль по перевозчику</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 12px' }}>
                        Сколько заработано на каждом перевозчике: выручка от заказчиков минус оплата перевозчику.
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
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}><WalletOutlined /></div>
                        <div><div className="lc2-mlabel">Выручка</div><div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(totals.revenue)}</div><div className="lc2-msub">{totals.orders} заявок</div></div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#16a34a' }}><BarChartOutlined /></div>
                        <div><div className="lc2-mlabel">Маржа</div><div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#16a34a' }}>{money(totals.margin)}</div><div className="lc2-msub">себестоимость {money(totals.cost)}</div></div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table columns={columns} dataSource={rows} rowKey="carrier" loading={loading} size="small"
                    locale={{ emptyText: 'Нет данных за период' }} pagination={{ pageSize: 30, showSizeChanger: true }}
                    summary={() => rows.length > 0 ? (
                        <Table.Summary fixed>
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0}><strong>Итого</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="center"><strong>{totals.orders}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={2} align="right"><strong>{money(totals.revenue)}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={3} align="right"><strong style={{ color: '#dc2626' }}>{money(totals.cost)}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={4} align="right"><strong style={{ color: '#16a34a' }}>{money(totals.margin)}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={5} align="right"><strong>{totals.revenue > 0 ? Math.round((totals.margin / totals.revenue) * 100) : 0}%</strong></Table.Summary.Cell>
                            </Table.Summary.Row>
                        </Table.Summary>
                    ) : null}
                />
            </div>
        </div>
    );
}
