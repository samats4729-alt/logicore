'use client';

import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Space, DatePicker, Input, Select, Modal, App } from 'antd';
import { ArrowLeftOutlined, FileTextOutlined, SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import StatusPill from '@/components/ui/StatusPill';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface ActRow {
    id: string;
    orderNumber: string;
    status: string;
    date: string;
    customerName: string;
    route: string;
    amount: number;
}

const money = (v: number) => (v || 0).toLocaleString('ru-RU') + ' ₸';

export default function ActsJournalPage() {
    const router = useRouter();
    const { message } = App.useApp();

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<ActRow[]>([]);
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
    const [onlyCompleted, setOnlyCompleted] = useState(false);

    const [createOpen, setCreateOpen] = useState(false);
    const [pickOrder, setPickOrder] = useState<string | undefined>(undefined);

    useEffect(() => { fetchActs(); }, []);

    const fetchActs = async () => {
        setLoading(true);
        try {
            const res = await api.get('/accounting/acts-journal');
            setRows(res.data || []);
        } catch {
            message.error('Не удалось загрузить акты');
        } finally {
            setLoading(false);
        }
    };

    const openAct = (orderId: string) => window.open(`/company/accounting/act-of-work?order=${orderId}`, '_blank');

    const filtered = useMemo(() => rows.filter(r => {
        if (onlyCompleted && r.status !== 'COMPLETED') return false;
        if (dateRange && dateRange[0] && dateRange[1]) {
            const d = dayjs(r.date);
            if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false;
        }
        if (search) {
            const q = search.toLowerCase();
            const hay = `${r.orderNumber} ${r.customerName} ${r.route}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    }), [rows, search, dateRange, onlyCompleted]);

    const total = filtered.reduce((s, r) => s + r.amount, 0);

    const columns = [
        { title: '№ акта', dataIndex: 'orderNumber', key: 'num', width: 120, render: (v: string) => <span style={{ fontWeight: 600, fontSize: 13 }}>{v}</span> },
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 110, render: (v: string) => <span style={{ fontSize: 13 }}>{dayjs(v).format('DD.MM.YYYY')}</span> },
        { title: 'Заказчик', dataIndex: 'customerName', key: 'cust', render: (v: string) => <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span> },
        { title: 'Маршрут', dataIndex: 'route', key: 'route', ellipsis: true, render: (v: string) => <span style={{ fontSize: 13 }}>{v || '—'}</span> },
        { title: 'Статус заявки', dataIndex: 'status', key: 'status', width: 130, render: (s: string) => <StatusPill status={s} /> },
        { title: 'Сумма', dataIndex: 'amount', key: 'amount', width: 140, align: 'right' as const, render: (v: number) => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(v)}</strong> },
        {
            title: '', key: 'act', width: 130,
            render: (_: any, r: ActRow) => <Button size="small" type="primary" ghost icon={<FileTextOutlined />} onClick={() => openAct(r.id)}>Открыть акт</Button>,
        },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1400, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Документы
                    </div>
                    <h1 className="lc2-title">Акты выполненных работ</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0' }}>
                        Журнал актов по заявкам, где вы — исполнитель для заказчика. Откройте акт по заявке, проверьте и распечатайте.
                    </p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}><FileTextOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">На сумму</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(total)}</div>
                            <div className="lc2-msub">{filtered.length} актов</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                <Space wrap>
                    <Input placeholder="Поиск: заявка, заказчик, маршрут…" prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} allowClear />
                    <RangePicker value={dateRange} onChange={d => setDateRange(d as any)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} />
                    <Select
                        value={onlyCompleted ? 'completed' : 'all'}
                        onChange={(v) => setOnlyCompleted(v === 'completed')}
                        style={{ width: 200 }}
                        options={[
                            { value: 'all', label: 'Все заявки' },
                            { value: 'completed', label: 'Только завершённые' },
                        ]}
                    />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setPickOrder(undefined); setCreateOpen(true); }}>Создать акт</Button>
                </Space>
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    locale={{ emptyText: 'Нет заявок для актов' }}
                    pagination={{ pageSize: 30, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }}
                    onRow={(r) => ({ style: { cursor: 'pointer' }, onDoubleClick: () => openAct(r.id) })}
                />
            </div>

            <Modal
                title="Создать акт выполненных работ"
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={() => { if (pickOrder) { openAct(pickOrder); setCreateOpen(false); } else message.warning('Выберите заявку'); }}
                okText="Открыть акт"
                cancelText="Отмена"
                destroyOnClose
            >
                <p style={{ color: 'var(--lc-text-ter)', fontSize: 12.5, marginTop: 0 }}>
                    Акт составляется по заявке. Выберите заявку — откроется готовый акт для проверки и печати.
                </p>
                <Select
                    placeholder="Выберите заявку (по номеру или заказчику)"
                    style={{ width: '100%' }}
                    showSearch optionFilterProp="label"
                    value={pickOrder}
                    onChange={setPickOrder}
                    options={rows.map(r => ({ value: r.id, label: `${r.orderNumber} · ${r.customerName}` }))}
                />
            </Modal>
        </div>
    );
}
