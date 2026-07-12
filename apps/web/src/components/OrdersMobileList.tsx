'use client';

import { Empty, Pagination, Spin } from 'antd';
import StatusPill, { STATUS_PILL } from '@/components/ui/StatusPill';
import { ORDER_STATUS_PROGRESS } from '@/components/ui/FeaturedOrderCard';
import { shortenCompanyName } from '@/lib/company-helper';

interface MobileOrder {
    id: string;
    orderNumber: string;
    status: string;
    createdAt: string;
    customerPrice?: number | null;
    driverCost?: number | null;
    subForwarderPrice?: number | null;
    customerCompanyId?: string | null;
    forwarderId?: string | null;
    customerCompany?: { name: string } | null;
    forwarder?: { name: string } | null;
    subForwarder?: { name: string } | null;
    partner?: { name: string } | null;
    assignedDriverName?: string | null;
    assignedDriverPlate?: string | null;
    driver?: { firstName: string; lastName: string; vehiclePlate?: string | null } | null;
    responsibleManager?: { firstName?: string | null; lastName?: string | null } | null;
}

interface OrdersMobileListProps {
    orders: MobileOrder[];
    loading?: boolean;
    userCompanyId?: string;
    extractCity: (order: any, type: 'pickup' | 'delivery') => string;
    onOpen: (id: string) => void;
    pagination?: {
        current: number;
        pageSize: number;
        total: number;
        onChange: (page: number, pageSize: number) => void;
    };
}

/**
 * Карточный список заявок для телефона — мобильная замена широкой таблице.
 * Чисто презентационный: данные, фильтрация и пагинация приходят со страницы.
 */
export default function OrdersMobileList({ orders, loading, userCompanyId, extractCity, onOpen, pagination }: OrdersMobileListProps) {
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                <Spin />
            </div>
        );
    }

    if (!orders.length) {
        return <Empty description="Нет заявок" style={{ padding: '32px 0' }} />;
    }

    return (
        <div className="lc-mcards">
            {orders.map((r) => {
                const from = extractCity(r, 'pickup');
                const to = extractCity(r, 'delivery');
                const carrierName = (r.forwarderId === userCompanyId && r.subForwarder)
                    ? r.subForwarder.name
                    : (r.forwarder?.name || r.subForwarder?.name || r.partner?.name || '');
                const driverName = r.assignedDriverName
                    || (r.driver ? `${r.driver.lastName} ${r.driver.firstName.substring(0, 1)}.` : '');
                const plate = r.assignedDriverPlate || r.driver?.vehiclePlate || '';
                const cost = r.driverCost || r.subForwarderPrice;
                const barColor = (STATUS_PILL[r.status] || STATUS_PILL.DRAFT).fg;

                return (
                    <div className="lc-mcard" key={r.id} onClick={() => onOpen(r.id)}>
                        <div className="lc-mcard-top">
                            <StatusPill status={r.status} />
                            <span className="lc-ordernum">{r.orderNumber}</span>
                            <span className="lc-mcard-date">
                                {new Date(r.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                            </span>
                        </div>

                        {(from || to) && (
                            <div className="lc-mcard-route">{from || '?'} → {to || '?'}</div>
                        )}
                        <div className="lc-mcard-bar">
                            <i style={{ width: `${ORDER_STATUS_PROGRESS[r.status] ?? 0}%`, background: barColor }} />
                        </div>

                        {r.customerCompany?.name && (
                            <div className="lc-mcard-row">
                                <span>Заказчик</span>
                                <b>{shortenCompanyName(r.customerCompany.name)}</b>
                            </div>
                        )}
                        {carrierName && (
                            <div className="lc-mcard-row">
                                <span>Перевозчик</span>
                                <b>{shortenCompanyName(carrierName)}</b>
                            </div>
                        )}
                        {driverName && (
                            <div className="lc-mcard-row">
                                <span>Водитель</span>
                                <b>{driverName}{plate ? ` · ${plate}` : ''}</b>
                            </div>
                        )}

                        {(r.customerPrice || cost) ? (
                            <div className="lc-mcard-prices">
                                {r.customerPrice ? <span className="lc-mcard-in">{r.customerPrice.toLocaleString('ru-RU')} ₸</span> : null}
                                {cost ? <span className="lc-mcard-out">{cost.toLocaleString('ru-RU')} ₸</span> : null}
                            </div>
                        ) : null}
                    </div>
                );
            })}

            {pagination && pagination.total > pagination.pageSize && (
                <div className="lc-mcards-pager">
                    <Pagination
                        simple
                        current={pagination.current}
                        pageSize={pagination.pageSize}
                        total={pagination.total}
                        onChange={pagination.onChange}
                    />
                </div>
            )}
        </div>
    );
}
