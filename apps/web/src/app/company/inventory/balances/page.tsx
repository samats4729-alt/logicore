'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Select, Space, Tag, App } from 'antd';
import { ArrowLeftOutlined, DatabaseOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface Row { warehouseId: string; warehouse: string; nomenclatureId: string; nomenclature: string; unit: string; quantity: number; avgCost: number; value: number }
interface Wh { id: string; name: string }

export default function StockBalancesPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<Row[]>([]);
    const [warehouses, setWarehouses] = useState<Wh[]>([]);
    const [totalValue, setTotalValue] = useState(0);
    const [whFilter, setWhFilter] = useState<string | undefined>(undefined);

    useEffect(() => { fetchBalances(); }, [whFilter]);

    const fetchBalances = async () => {
        setLoading(true);
        try {
            const res = await api.get('/inventory/balances', { params: whFilter ? { warehouseId: whFilter } : {} });
            setRows(res.data?.rows || []);
            setWarehouses(res.data?.warehouses || []);
            setTotalValue(res.data?.totalValue || 0);
        } catch { message.error('Не удалось загрузить остатки'); }
        finally { setLoading(false); }
    };

    const num = (v: number) => (v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    const money = (v: number) => (v || 0).toLocaleString('ru-RU') + ' ₸';

    const columns = [
        { title: 'Склад', dataIndex: 'warehouse', key: 'wh', width: 200, render: (v: string) => <Tag color="blue">{v}</Tag> },
        { title: 'Номенклатура', dataIndex: 'nomenclature', key: 'nom', render: (v: string) => <span style={{ fontWeight: 500, fontSize: 13 }}>{v}</span> },
        { title: 'Остаток', dataIndex: 'quantity', key: 'qty', width: 150, align: 'right' as const, render: (v: number, r: Row) => <strong style={{ fontVariantNumeric: 'tabular-nums', color: v < 0 ? '#dc2626' : undefined }}>{num(v)} {r.unit}</strong> },
        { title: 'Ср. цена', dataIndex: 'avgCost', key: 'cost', width: 120, align: 'right' as const, render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--lc-text-ter)' }}>{v ? money(v) : '—'}</span> },
        { title: 'Сумма', dataIndex: 'value', key: 'value', width: 150, align: 'right' as const, render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v ? money(v) : '—'}</span> },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        ТМЦ · Отчёт
                    </div>
                    <h1 className="lc2-title">Ведомость по остаткам</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0' }}>
                        Сколько и чего сейчас на складах. Остаток считается по документам: поступления плюс, списания и перемещения — минус.
                    </p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#eef2ff', color: '#4f46e5' }}><DatabaseOutlined /></div>
                        <div><div className="lc2-mlabel">Стоимость остатков</div><div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(totalValue)}</div><div className="lc2-msub">{rows.length} позиций</div></div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                <Space wrap>
                    <Select placeholder="Все склады" value={whFilter} onChange={setWhFilter} allowClear style={{ width: 260 }}
                        options={warehouses.map(w => ({ value: w.id, label: w.name }))} />
                </Space>
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table columns={columns} dataSource={rows} rowKey={(r) => `${r.warehouseId}_${r.nomenclatureId}`} loading={loading} size="small"
                    locale={{ emptyText: 'Нет остатков' }} pagination={{ pageSize: 40 }}
                    summary={() => rows.length > 0 ? (
                        <Table.Summary fixed>
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={4}><strong>Итого стоимость остатков</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={4} align="right"><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(totalValue)}</strong></Table.Summary.Cell>
                            </Table.Summary.Row>
                        </Table.Summary>
                    ) : null}
                />
            </div>
        </div>
    );
}
