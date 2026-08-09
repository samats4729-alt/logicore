'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Empty, Skeleton, Tag } from 'antd';
import {
    ArrowRightOutlined,
    ClockCircleOutlined,
    FileDoneOutlined,
    FileExclamationOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import nova from '@/components/nova/nova.module.css';

interface PendingWorkItem {
    id: string;
    label: string;
    counterparty: string | null;
    amount: number;
    daysWaiting: number;
    orderId?: string;
    documentId?: string;
}

interface PendingWorkGroup {
    count: number;
    total: number;
    truncated: boolean;
    items: PendingWorkItem[];
}

interface PendingWork {
    ordersWithoutAct: PendingWorkGroup;
    actsWithoutInvoice: PendingWorkGroup;
    overdueInvoices: PendingWorkGroup;
}

type GroupKey = keyof PendingWork;

const money = (value: number) =>
    `${(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₸`;

/** Правильное окончание: 1 день, 3 дня, 5 дней. */
const daysLabel = (days: number) => {
    const mod10 = days % 10;
    const mod100 = days % 100;
    if (mod100 >= 11 && mod100 <= 14) return `${days} дней`;
    if (mod10 === 1) return `${days} день`;
    if (mod10 >= 2 && mod10 <= 4) return `${days} дня`;
    return `${days} дней`;
};

const GROUPS: {
    key: GroupKey;
    title: string;
    hint: string;
    icon: React.ReactNode;
    color: string;
    background: string;
}[] = [
    {
        key: 'ordersWithoutAct',
        title: 'Рейс завершён, акта нет',
        hint: 'услуга оказана, но документально не закрыта',
        icon: <FileExclamationOutlined />,
        color: '#b45309',
        background: '#fffbeb',
    },
    {
        key: 'actsWithoutInvoice',
        title: 'Акт есть, счёта нет',
        hint: 'оплату по этим рейсам никто не запрашивал',
        icon: <FileDoneOutlined />,
        color: '#4f46e5',
        background: '#eef2ff',
    },
    {
        key: 'overdueInvoices',
        title: 'Счёт просрочен',
        hint: 'срок оплаты прошёл, деньги не пришли',
        icon: <ClockCircleOutlined />,
        color: '#dc2626',
        background: '#fef2f2',
    },
];

/**
 * «Требует оформления» — незакрытые хвосты между рейсом и бухгалтерией.
 *
 * Отвечает на вопрос «что я забыл оформить», который иначе выясняется
 * обходом трёх журналов со сверкой по памяти. Показывает не всё подряд, а
 * первые несколько строк каждой группы: задача виджета — заметить проблему
 * и увести в нужное место, а не заменить журнал.
 */
export default function PendingWorkCard() {
    const router = useRouter();
    const [data, setData] = useState<PendingWork | null>(null);
    const [loading, setLoading] = useState(true);
    const [available, setAvailable] = useState(true);

    useEffect(() => {
        api.get('/accounting-documents/pending-work')
            .then((res) => setData(res.data))
            .catch(() => setAvailable(false))
            .finally(() => setLoading(false));
    }, []);

    if (!available) return null;

    const openItem = (key: GroupKey, item: PendingWorkItem) => {
        if (key === 'overdueInvoices' && item.documentId) {
            router.push(`/company/accounting/invoices/${item.documentId}`);
            return;
        }
        if (item.orderId) router.push(`/company/orders/${item.orderId}`);
    };

    const totalCount = data
        ? GROUPS.reduce((sum, group) => sum + (data[group.key]?.count ?? 0), 0)
        : 0;

    return (
        <div className={nova.card} style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--nova-fg)', letterSpacing: '-0.01em' }}>
                        Требует оформления
                    </div>
                    <div style={{ color: 'var(--nova-fg-3)', fontSize: 12, marginTop: 2 }}>
                        незакрытые хвосты между рейсами и бухгалтерией
                    </div>
                </div>
                <span className="lc-link" onClick={() => router.push('/company/accounting/invoices')}>
                    Журнал счетов <ArrowRightOutlined style={{ fontSize: 11 }} />
                </span>
            </div>

            {loading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
            ) : totalCount === 0 ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Всё оформлено — хвостов нет"
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {GROUPS.map((group) => {
                        const value = data?.[group.key];
                        if (!value || value.count === 0) return null;
                        return (
                            <div key={group.key}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                    <div
                                        className="lc2-mic"
                                        style={{ background: group.background, color: group.color, flexShrink: 0 }}
                                    >
                                        {group.icon}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nova-fg)' }}>
                                            {group.title}
                                            <Tag color={group.color} style={{ marginLeft: 8 }}>
                                                {value.truncated ? `${value.count}+` : value.count}
                                            </Tag>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--nova-fg-3)' }}>{group.hint}</div>
                                    </div>
                                    <div style={{
                                        fontSize: 14,
                                        fontWeight: 800,
                                        color: 'var(--nova-fg)',
                                        fontVariantNumeric: 'tabular-nums',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {money(value.total)}
                                    </div>
                                </div>

                                <div style={{ paddingLeft: 42 }}>
                                    {value.items.map((item) => (
                                        <div
                                            key={item.id}
                                            onClick={() => openItem(group.key, item)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                padding: '5px 0',
                                                cursor: 'pointer',
                                                fontSize: 12,
                                                borderBottom: '1px solid var(--nova-border-2)',
                                            }}
                                        >
                                            <span style={{ fontWeight: 600, color: 'var(--nova-fg)', whiteSpace: 'nowrap' }}>
                                                {item.label}
                                            </span>
                                            <span style={{
                                                flex: 1,
                                                minWidth: 0,
                                                color: 'var(--nova-fg-2)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {item.counterparty || '—'}
                                            </span>
                                            <span style={{ color: 'var(--nova-fg-3)', whiteSpace: 'nowrap' }}>
                                                {daysLabel(item.daysWaiting)}
                                            </span>
                                            <span style={{
                                                fontWeight: 600,
                                                color: 'var(--nova-fg)',
                                                fontVariantNumeric: 'tabular-nums',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {money(item.amount)}
                                            </span>
                                        </div>
                                    ))}
                                    {value.count > value.items.length && (
                                        <div style={{ fontSize: 11, color: 'var(--nova-fg-3)', paddingTop: 5 }}>
                                            и ещё {value.count - value.items.length}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
