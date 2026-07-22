'use client';

import { useState, useEffect, useMemo } from 'react';
import { Calendar, Button, Typography, Tag, Empty, Spin, message } from 'antd';
import type { Dayjs } from 'dayjs';
import { ArrowLeftOutlined, ArrowDownOutlined, ArrowUpOutlined, UnorderedListOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Text } = Typography;

interface PlannedRow {
    orderId: string;
    orderNumber: string;
    direction: 'IN' | 'OUT';
    party: string;
    amount: number;
    dueDate: string | null;
}

export default function PaymentCalendarPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<PlannedRow[]>([]);
    const [value, setValue] = useState<Dayjs>(dayjs());
    const [selected, setSelected] = useState<Dayjs>(dayjs());

    useEffect(() => { fetchPlanned(); }, []);

    const fetchPlanned = async () => {
        setLoading(true);
        try {
            const res = await api.get('/accounting/planned-payments');
            setRows(res.data?.rows || []);
        } catch {
            message.error('Не удалось загрузить платёжный календарь');
        } finally {
            setLoading(false);
        }
    };

    const money = (v: number) => v.toLocaleString('ru-RU') + ' ₸';
    const short = (v: number) => {
        if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1).replace('.', ',') + ' млн';
        if (v >= 1_000) return Math.round(v / 1_000) + ' тыс';
        return String(v);
    };

    // Группировка по дню (YYYY-MM-DD) только для строк с датой
    const byDay = useMemo(() => {
        const m = new Map<string, { in: number; out: number; items: PlannedRow[] }>();
        for (const r of rows) {
            if (!r.dueDate) continue;
            const key = dayjs(r.dueDate).format('YYYY-MM-DD');
            const cur = m.get(key) || { in: 0, out: 0, items: [] };
            if (r.direction === 'IN') cur.in += r.amount; else cur.out += r.amount;
            cur.items.push(r);
            m.set(key, cur);
        }
        return m;
    }, [rows]);

    const noDate = useMemo(() => rows.filter(r => !r.dueDate), [rows]);
    const selectedKey = selected.format('YYYY-MM-DD');
    const selectedDay = byDay.get(selectedKey);

    const cellRender = (current: Dayjs, info: { type: string }) => {
        if (info.type !== 'date') return null;
        const day = byDay.get(current.format('YYYY-MM-DD'));
        if (!day) return null;
        const overdue = current.isBefore(dayjs(), 'day');
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                {day.in > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
                        +{short(day.in)}
                    </span>
                )}
                {day.out > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
                        −{short(day.out)}
                    </span>
                )}
                {overdue && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />}
            </div>
        );
    };

    const totalIn = useMemo(() => rows.filter(r => r.direction === 'IN').reduce((s, r) => s + r.amount, 0), [rows]);
    const totalOut = useMemo(() => rows.filter(r => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0), [rows]);

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Планирование
                    </div>
                    <h1 className="lc2-title">Платёжный календарь</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Видно по дням: в какой день сколько денег придёт (зелёным) и сколько уйдёт (красным). Точка — есть просроченные платежи.
                    </p>
                    <Button icon={<UnorderedListOutlined />} onClick={() => router.push('/company/accounting/planned')}>
                        Показать списком
                    </Button>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#16a34a' }}><ArrowDownOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Нам должны</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#16a34a' }}>{money(totalIn)}</div>
                            <div className="lc2-msub">всего ожидаем</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#ffeef0', color: '#dc2626' }}><ArrowUpOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Мы должны</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#dc2626' }}>{money(totalOut)}</div>
                            <div className="lc2-msub">всего к оплате</div>
                        </div>
                    </div>
                </div>
            </div>

            {noDate.length > 0 && (
                <div className="lc-card" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ExclamationCircleOutlined style={{ color: '#e67e22' }} />
                    <Text style={{ fontSize: 13 }}>
                        {noDate.length}&nbsp;{noDate.length === 1 ? 'платёж' : 'платежей'} без плановой даты — не попадают в календарь.{' '}
                        <a onClick={() => router.push('/company/accounting/planned')}>Открыть списком</a>, чтобы проставить даты в заявках.
                    </Text>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, alignItems: 'start' }} className="lc-cal-grid">
                <div className="lc-card" style={{ padding: 12 }}>
                    <Spin spinning={loading}>
                        <Calendar
                            value={value}
                            onSelect={(d) => { setSelected(d); setValue(d); }}
                            onPanelChange={(d) => setValue(d)}
                            cellRender={cellRender}
                        />
                    </Spin>
                </div>

                <div className="lc-card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{selected.format('D MMMM YYYY')}</div>
                    {selectedDay ? (
                        <>
                            <div style={{ display: 'flex', gap: 12, margin: '8px 0 14px', flexWrap: 'wrap' }}>
                                {selectedDay.in > 0 && <Tag color="green" style={{ margin: 0 }}>Придёт +{money(selectedDay.in)}</Tag>}
                                {selectedDay.out > 0 && <Tag color="red" style={{ margin: 0 }}>Уйдёт −{money(selectedDay.out)}</Tag>}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {selectedDay.items.map((r, i) => (
                                    <div key={`${r.orderId}_${r.direction}_${i}`} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--lc-hover)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                            <a onClick={() => router.push(`/company/orders/${r.orderId}`)} style={{ fontWeight: 600, fontSize: 13 }}>{r.orderNumber}</a>
                                            <strong style={{ color: r.direction === 'IN' ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                                                {r.direction === 'IN' ? '+' : '−'}{money(r.amount)}
                                            </strong>
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {r.direction === 'IN' ? 'Нам заплатит: ' : 'Мы платим: '}{r.party}
                                        </Text>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="На этот день платежей нет" style={{ margin: '24px 0' }} />
                    )}
                </div>
            </div>

            <style jsx>{`
                @media (max-width: 860px) {
                    .lc-cal-grid { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </div>
    );
}
