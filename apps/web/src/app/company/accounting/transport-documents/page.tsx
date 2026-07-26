'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Alert,
    Button,
    DatePicker,
    Dropdown,
    Empty,
    Input,
    Space,
    Table,
    Tabs,
    Tooltip,
    message,
    theme,
} from 'antd';
import {
    DownOutlined,
    EyeOutlined,
    FilePdfOutlined,
    PrinterOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '@/lib/api';
import StatusPill from '@/components/ui/StatusPill';

const { RangePicker } = DatePicker;

type DocumentKind = 'POWER_OF_ATTORNEY' | 'CONTRACT';

const KIND_VIEW: Record<DocumentKind, { path: string; fileName: string; hint: string }> = {
    POWER_OF_ATTORNEY: {
        path: 'power-of-attorney',
        fileName: 'Доверенность',
        hint: 'Доверенность выдаётся водителю на получение груза. Показаны рейсы с назначенным водителем.',
    },
    CONTRACT: {
        path: 'contract',
        fileName: 'Договор-заявка',
        hint: 'Договор-заявка подписывается с перевозчиком и служит основанием для оплаты. Показаны рейсы с выбранным перевозчиком.',
    },
};

const DEFAULT_PERIOD: [Dayjs, Dayjs] = [dayjs().startOf('year'), dayjs().endOf('day')];

const money = (value: number | null) =>
    value == null ? '—' : `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`;

interface JournalRow {
    id: string;
    orderNumber: string;
    status: string;
    createdAt: string;
    route: string | null;
    driverName: string | null;
    driverPlate: string | null;
    carrier: string | null;
    customer: string | null;
    amount: number | null;
}

/**
 * Журнал транспортных документов: доверенности и договоры-заявки.
 *
 * Оба документа печатаются из заявки, но искать их только в карточке рейса
 * неудобно: бухгалтеру нужен список за период. Доверенность к тому же в РК
 * выдаёт бухгалтерия, и по ней принято вести журнал.
 */
export default function TransportDocumentsPage() {
    const router = useRouter();
    const { token } = theme.useToken();

    const [kind, setKind] = useState<DocumentKind>('POWER_OF_ATTORNEY');
    const [rows, setRows] = useState<JournalRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<[Dayjs, Dayjs]>(DEFAULT_PERIOD);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/orders/document-journal', {
                params: {
                    kind,
                    from: period[0].format('YYYY-MM-DD'),
                    to: period[1].format('YYYY-MM-DD'),
                },
            });
            setRows(res.data || []);
        } catch {
            message.error('Не удалось загрузить журнал документов');
        } finally {
            setLoading(false);
        }
    }, [kind, period]);

    useEffect(() => { load(); }, [load]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return rows;
        return rows.filter((row) => [row.orderNumber, row.route, row.driverName, row.carrier, row.customer]
            .some((value) => (value || '').toLowerCase().includes(term)));
    }, [rows, search]);

    const download = async (row: JournalRow, withStamp: boolean) => {
        try {
            const res = await api.get(`/orders/${row.id}/${KIND_VIEW[kind].path}`, {
                params: withStamp ? { withStamp: 'true' } : undefined,
                responseType: 'blob',
            });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `${KIND_VIEW[kind].fileName}_${row.orderNumber}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось сформировать документ');
        }
    };

    const columns = [
        {
            title: 'Заявка',
            dataIndex: 'orderNumber',
            key: 'orderNumber',
            width: 140,
            render: (value: string, record: JournalRow) => (
                <a onClick={() => router.push(`/company/orders/${record.id}`)} style={{ fontWeight: 600 }}>
                    {value}
                </a>
            ),
        },
        {
            title: 'Дата',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 100,
            render: (value: string) => dayjs(value).format('DD.MM.YYYY'),
        },
        {
            title: 'Маршрут',
            dataIndex: 'route',
            key: 'route',
            ellipsis: true,
            render: (value: string | null) => value || <span style={{ color: token.colorTextDisabled }}>—</span>,
        },
        kind === 'POWER_OF_ATTORNEY'
            ? {
                title: 'Водитель',
                key: 'driver',
                width: 220,
                render: (_: unknown, record: JournalRow) => (
                    <div>
                        <div style={{ fontSize: 13 }}>{record.driverName || '—'}</div>
                        {record.driverPlate && (
                            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>{record.driverPlate}</div>
                        )}
                    </div>
                ),
            }
            : {
                title: 'Перевозчик',
                dataIndex: 'carrier',
                key: 'carrier',
                width: 220,
                render: (value: string | null) => value || '—',
            },
        {
            title: 'Статус рейса',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (value: string) => <StatusPill status={value} />,
        },
        {
            title: kind === 'CONTRACT' ? 'Ставка' : 'Сумма рейса',
            dataIndex: 'amount',
            key: 'amount',
            width: 150,
            align: 'right' as const,
            render: (value: number | null) => <span style={{ fontWeight: 600 }}>{money(value)}</span>,
        },
        {
            title: '',
            key: 'actions',
            width: 190,
            render: (_: unknown, record: JournalRow) => (
                <Space size={4}>
                    <Tooltip title="Открыть заявку">
                        <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => router.push(`/company/orders/${record.id}`)}
                        />
                    </Tooltip>
                    <Dropdown.Button
                        size="small"
                        icon={<DownOutlined />}
                        onClick={() => download(record, false)}
                        menu={{
                            items: [{
                                key: 'stamp',
                                label: 'С подписью и печатью',
                                onClick: () => download(record, true),
                            }],
                        }}
                    >
                        <PrinterOutlined /> Печать
                    </Dropdown.Button>
                </Space>
            ),
        },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1500, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Финансы · Документы</div>
                    <h1 className="lc2-title">Доверенности и договоры-заявки</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0' }}>
                        Документы по рейсам за период — чтобы найти нужный, не открывая каждую заявку.
                    </p>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 20 }}>
                <Tabs
                    activeKey={kind}
                    onChange={(key) => setKind(key as DocumentKind)}
                    items={[
                        { key: 'POWER_OF_ATTORNEY', label: 'Доверенности' },
                        { key: 'CONTRACT', label: 'Договоры-заявки' },
                    ]}
                    style={{ marginBottom: 12 }}
                />

                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 14 }}
                    message={KIND_VIEW[kind].hint}
                />

                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <RangePicker
                        value={period}
                        onChange={(value) => { if (value?.[0] && value?.[1]) setPeriod([value[0], value[1]]); }}
                        format="DD.MM.YYYY"
                        allowClear={false}
                    />
                    <Input
                        placeholder="Заявка, маршрут, водитель, перевозчик"
                        prefix={<SearchOutlined style={{ color: token.colorTextDescription }} />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: 300 }}
                        allowClear
                    />
                </div>

                <Table
                    columns={columns}
                    dataSource={visible}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    scroll={{ x: 1100 }}
                    locale={{
                        emptyText: (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={kind === 'POWER_OF_ATTORNEY'
                                    ? 'За период нет рейсов с назначенным водителем'
                                    : 'За период нет рейсов с выбранным перевозчиком'}
                            />
                        ),
                    }}
                    pagination={{ pageSize: 30, showSizeChanger: false, showTotal: (t) => `Всего: ${t}` }}
                />
            </div>
        </div>
    );
}
