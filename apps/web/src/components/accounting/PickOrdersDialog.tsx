'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal, Table, Input, Checkbox } from 'antd';
import { toast } from 'sonner';
import { api } from '@/lib/api';

/**
 * Подобрать рейсы в уже открытый счёт.
 *
 * Просьба бухгалтера: «когда я на этот счёт на оплату зашла и хотела туда
 * добавить, то другие заявки не добавляются». В открытом документе можно
 * было завести только пустую строку и набить всё руками — а у Кока-Колы в
 * счёте пять перевозок, иногда двадцать.
 *
 * Строки собирает сервер: он же знает маршрут, водителя, машину и
 * настройку компании, что именно писать в расшифровке. Здесь только выбор.
 */

export interface PickedLine {
    orderId: string;
    name: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
}

interface OrderRow {
    id: string;
    orderNumber: string;
    customerPrice?: number | null;
    isInvoiced?: boolean;
    routePoints?: { location?: { city?: string | null; name?: string | null } | null }[];
}

export default function PickOrdersDialog({
    open,
    onClose,
    counterpartyId,
    direction,
    onPicked,
}: {
    open: boolean;
    onClose: () => void;
    counterpartyId?: string | null;
    /** Чей счёт: наш клиенту или нам от перевозчика. От этого зависит сумма. */
    direction?: 'OUTGOING' | 'INCOMING';
    onPicked: (lines: PickedLine[]) => void;
}) {
    const [orders, setOrders] = useState<OrderRow[]>([]);
    const [picked, setPicked] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [hideInvoiced, setHideInvoiced] = useState(true);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPicked([]);
        setLoading(true);
        // Поиск идёт по базе, а не по загруженной странице: у экспедитора
        // рейсов тысячи, и нужный редко попадает в первую сотню.
        api.get('/orders', { params: { limit: 100, search: search.trim() || undefined } })
            .then((res) => setOrders(res.data?.data || []))
            .catch(() => toast.error('Не удалось загрузить рейсы'))
            .finally(() => setLoading(false));
    }, [open, search]);

    const visible = useMemo(
        () => (hideInvoiced ? orders.filter((o) => !o.isInvoiced) : orders),
        [orders, hideInvoiced],
    );

    const route = (o: OrderRow) => {
        const points = o.routePoints || [];
        const label = (i: number) => points[i]?.location?.city || points[i]?.location?.name || '';
        const from = label(0);
        const to = label(points.length - 1);
        return from && to ? `${from} → ${to}` : from || to || '—';
    };

    const confirm = async () => {
        if (!picked.length) return;
        try {
            setBusy(true);
            const res = await api.post('/accounting-documents/lines/from-orders', {
                orderIds: picked,
                counterpartyId: counterpartyId || undefined,
                direction,
            });
            onPicked(res.data?.lines || []);
            toast.success(`Перенесено рейсов: ${picked.length}`);
            onClose();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось подобрать рейсы');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            onOk={confirm}
            okText={picked.length ? `Перенести в счёт (${picked.length})` : 'Перенести в счёт'}
            okButtonProps={{ disabled: !picked.length, loading: busy }}
            cancelText="Отмена"
            title="Подобрать рейсы"
            width={860}
        >
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <Input.Search
                    allowClear
                    placeholder="Номер, груз, город или заказчик"
                    onSearch={setSearch}
                    style={{ maxWidth: 420 }}
                />
                <Checkbox checked={hideInvoiced} onChange={(e) => setHideInvoiced(e.target.checked)}>
                    <span style={{ fontSize: 13 }}>Скрыть те, по которым счёт уже выставлен</span>
                </Checkbox>
            </div>

            <Table
                size="small"
                rowKey="id"
                loading={loading}
                dataSource={visible}
                pagination={{ pageSize: 8, size: 'small' }}
                rowSelection={{
                    selectedRowKeys: picked,
                    onChange: (keys) => setPicked(keys as string[]),
                }}
                locale={{ emptyText: 'Рейсов не нашлось. Измените запрос или снимите галочку.' }}
                columns={[
                    { title: 'Заявка', dataIndex: 'orderNumber', width: 130 },
                    { title: 'Маршрут', key: 'route', render: (_: any, r: OrderRow) => route(r) },
                    {
                        title: 'Сумма клиенту', key: 'price', width: 130, align: 'right' as const,
                        render: (_: any, r: OrderRow) =>
                            r.customerPrice ? Number(r.customerPrice).toLocaleString('ru-RU') : '—',
                    },
                    {
                        title: 'Счёт', key: 'invoiced', width: 90,
                        render: (_: any, r: OrderRow) =>
                            r.isInvoiced
                                ? <span style={{ fontSize: 11, color: '#389e0d' }}>выставлен</span>
                                : <span style={{ fontSize: 11, color: 'var(--lc-text-ter)' }}>нет</span>,
                    },
                ]}
            />
        </Modal>
    );
}
