'use client';

import { useState } from 'react';
import { DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { FileCheck2, FileClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { paymentTermsLabel, type OrderSettlements, type SettlementSide } from '@/lib/settlement-terms';
import nova from '@/components/nova/nova.module.css';

/**
 * Оригиналы накладных: пришли или ещё едут.
 *
 * Половина отсрочек в перевозках считается «через N дней с момента получения
 * оригиналов». Сколько дней и от какого события — платформа знала и раньше, а
 * самого события у неё не было: отметить приход конверта было негде. Из-за
 * этого плановая дата платежа по таким условиям не считалась вовсе, и «кому мы
 * должны и когда» жило в голове у человека.
 *
 * Отметка стоит здесь, среди документов, а не в «Финансах»: получить конверт
 * от перевозчика и убедиться, что заказчик его получил, — работа менеджера.
 * Бухгалтеру принадлежит другое — сколько дней отсрочки и от чего их считать.
 *
 * Событий два, и путать их нельзя: оригиналы от перевозчика запускают срок,
 * когда платим мы, оригиналы у заказчика — срок, когда платит он. Между ними
 * несколько дней почты, и это разные деньги.
 */

const dateLabel = (iso?: string | null) => (iso ? dayjs(iso).format('DD.MM.YYYY') : null);

/** Что даёт отметка этой стороне — одной строкой под названием. */
function consequence(side: SettlementSide, marked: boolean): string {
    const terms = paymentTermsLabel(side.days, side.from);
    if (side.from !== 'ORIGINALS') {
        return marked
            ? 'На срок оплаты не влияет — он считается от другого дня'
            : 'Отметьте, когда придут: для архива и для счёта';
    }
    const due = dateLabel(side.dueDate);
    if (marked) {
        return due ? `Отсрочка ${terms} — оплата до ${due}` : `Отсрочка ${terms}`;
    }
    return terms
        ? `Отсрочка ${terms} — без отметки дата платежа не считается`
        : 'Отсрочка идёт с этого дня';
}

/** Одна сторона: дата, кнопка отметки и то, что из неё следует. */
function OriginalsRow({ side, title, sideKey, busy, picking, setPicking, save }: {
    side: SettlementSide;
    title: string;
    sideKey: 'customer' | 'carrier';
    busy: 'customer' | 'carrier' | null;
    picking: 'customer' | 'carrier' | null;
    setPicking: (side: 'customer' | 'carrier' | null) => void;
    save: (side: 'customer' | 'carrier', date: Dayjs | null) => void;
}) {
    const marked = dateLabel(side.originalsAt);
    return (
        <div className={nova.item}>
            <span className={nova.itemIcon}>
                {marked ? <FileCheck2 size={14} /> : <FileClock size={14} />}
            </span>
            <span className={nova.itemText}>
                <span className={nova.itemLabel}>
                    {title}
                    {marked ? ` · ${marked}` : ' · нет отметки'}
                </span>
                <span className={nova.itemDesc}>{consequence(side, !!marked)}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {busy === sideKey && <Loader2 size={14} className="animate-spin" />}
                {picking === sideKey ? (
                    <DatePicker
                        open
                        autoFocus
                        format="DD.MM.YYYY"
                        placeholder="дата"
                        style={{ width: 150 }}
                        // Задним числом — можно: конверт идёт почтой, а отметку
                        // ставят, когда до неё дошли руки. Вперёд — нельзя.
                        disabledDate={(d) => !!d && d > dayjs().endOf('day')}
                        defaultValue={side.originalsAt ? dayjs(side.originalsAt) : dayjs()}
                        onChange={(d) => save(sideKey, d)}
                        onOpenChange={(open) => { if (!open) setPicking(null); }}
                    />
                ) : (
                    <>
                        {/* Обычный случай — «пришли сегодня»: одна кнопка, без
                            календаря. Задним числом отмечают реже, для этого
                            рядом «Другой день». */}
                        {!marked && (
                            <button
                                type="button"
                                className={nova.action}
                                onClick={() => save(sideKey, dayjs())}
                            >
                                Сегодня
                            </button>
                        )}
                        <button
                            type="button"
                            className={nova.action}
                            onClick={() => setPicking(sideKey)}
                        >
                            {marked ? 'Изменить' : 'Другой день'}
                        </button>
                        {marked && (
                            <button
                                type="button"
                                className={nova.action}
                                onClick={() => save(sideKey, null)}
                            >
                                Снять
                            </button>
                        )}
                    </>
                )}
            </span>
        </div>
    );
}

export default function OrderOriginalsCard({
    orderId,
    settlements,
    onChanged,
}: {
    orderId: string;
    settlements: OrderSettlements | null;
    onChanged: () => void;
}) {
    const [busy, setBusy] = useState<'customer' | 'carrier' | null>(null);
    const [picking, setPicking] = useState<'customer' | 'carrier' | null>(null);

    if (!settlements) return null;
    const { customer, carrier } = settlements;
    if (!customer.companyId && !carrier.companyId) return null;

    const save = async (side: 'customer' | 'carrier', date: Dayjs | null) => {
        try {
            setBusy(side);
            // Днём, без времени: срок оплаты — это день, а не момент, и
            // часовой пояс браузера не должен сдвигать его на сутки.
            await api.post(`/orders/${orderId}/originals`, {
                side: side === 'carrier' ? 'CARRIER' : 'CUSTOMER',
                date: date ? date.format('YYYY-MM-DD') : null,
            });
            toast.success(date
                ? `Отмечено: оригиналы ${side === 'carrier' ? 'получены' : 'у заказчика'} ${date.format('DD.MM.YYYY')}`
                : 'Отметка снята');
            setPicking(null);
            onChanged();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось сохранить отметку');
        } finally {
            setBusy(null);
        }
    };

    const rowProps = { busy, picking, setPicking, save };

    return (
        <section className={nova.card} style={{ marginBottom: 14 }}>
            <div className={nova.cardHead}>
                <FileCheck2 size={14} />
                <h2 className={nova.cardTitle}>Оригиналы накладных</h2>
            </div>
            <div className={nova.cardBody}>
                <div className={nova.list}>
                    <OriginalsRow
                        sideKey="carrier"
                        side={carrier}
                        title="Получили от перевозчика"
                        {...rowProps}
                    />
                    <OriginalsRow
                        sideKey="customer"
                        side={customer}
                        title="Заказчик получил оригиналы"
                        {...rowProps}
                    />
                </div>
            </div>
        </section>
    );
}
