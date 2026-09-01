'use client';

import { useState, type ReactNode } from 'react';
import { Modal, Select, Input } from 'antd';
import { CreditCard, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { toast } from 'sonner';
import nova from '@/components/nova/nova.module.css';
import styles from './subscription-buy.module.css';

/**
 * Покупка подписки.
 *
 * Два пути к одному и тому же: заплатить картой прямо сейчас или попросить
 * счёт на компанию. Картой доступ открывается в ту же минуту, по счёту — в
 * тот день, когда придут деньги; на этом и построен выбор, а не на списке
 * технических возможностей.
 *
 * Оплата картой показывается, только если она настроена на сервере
 * (`cardPayment` в статусе подписки). Кнопка, ведущая в неработающую
 * оплату, хуже её отсутствия: человек уже достал карту.
 *
 * Одно окно на два места: плитка «Тариф» на главной и экран «Подписка не
 * активна». Формулировки про сгорающие дни должны совпадать слово в слово,
 * а два таких куска разъехались бы в первый же месяц.
 */

const MONTH_OPTIONS = [1, 3, 6, 12];

type Способ = 'card' | 'invoice';

/** «1 месяц» / «3 месяца» / «6 месяцев». */
export function monthsWord(n: number): string {
    const last = n % 10;
    const tens = n % 100;
    if (tens >= 11 && tens <= 14) return `${n} месяцев`;
    if (last === 1) return `${n} месяц`;
    if (last >= 2 && last <= 4) return `${n} месяца`;
    return `${n} месяцев`;
}

/** «1 день» / «3 дня» / «5 дней» — иначе на плитке «осталось 3 дней». */
export function daysWord(n: number): string {
    const last = n % 10;
    const tens = n % 100;
    if (tens >= 11 && tens <= 14) return `${n} дней`;
    if (last === 1) return `${n} день`;
    if (last >= 2 && last <= 4) return `${n} дня`;
    return `${n} дней`;
}

export default function SubscriptionBuyModal({
    open,
    pricePerUser,
    users,
    cardPayment = false,
    onClose,
    onSent,
}: {
    open: boolean;
    /** Цена за одного сотрудника в месяц. */
    pricePerUser: number;
    /** Сколько сотрудников оплачивается — водители не в счёт. */
    users: number;
    /** Настроена ли оплата картой. Решает сервер, не экран. */
    cardPayment?: boolean;
    onClose: () => void;
    onSent: () => void;
}) {
    const [months, setMonths] = useState(1);
    const [comment, setComment] = useState('');
    const [sending, setSending] = useState(false);
    const [способ, setСпособ] = useState<Способ>(cardPayment ? 'card' : 'invoice');

    // Способ оплаты держим в согласии с тем, что доступно: настройки могли
    // измениться, пока окно закрыто.
    const выбран: Способ = cardPayment ? способ : 'invoice';
    const итого = pricePerUser * users * months;

    const запросСчёта = async () => {
        await api.post('/billing/requests', { months, comment });
        toast.success('Запрос отправлен — выставим счёт');
        setComment('');
        onClose();
        onSent();
    };

    const оплатаКартой = async () => {
        const { data } = await api.post('/billing/card-payment', { months });
        if (!data?.redirectUrl) throw new Error('Платёжная система не прислала адрес оплаты');
        // Уходим на страницу банка целиком, а не в новом окне: возврат
        // оттуда идёт обратным переходом, и вкладка-сирота осталась бы
        // висеть с устаревшим кабинетом.
        window.location.href = data.redirectUrl;
    };

    const send = async () => {
        setSending(true);
        try {
            if (выбран === 'card') await оплатаКартой();
            else await запросСчёта();
        } catch (e: any) {
            toast.error(e.response?.data?.message || e.message || 'Не удалось отправить запрос');
            setSending(false);
        }
        // При оплате картой браузер уже уходит на страницу банка — снимать
        // ожидание с кнопки незачем, и мигать ею тем более.
        if (выбран === 'invoice') setSending(false);
    };

    return (
        <Modal
            title="Купить подписку"
            open={open}
            onCancel={onClose}
            onOk={send}
            okText={выбран === 'card' ? `Оплатить ${moneyShort(итого)}` : 'Отправить запрос'}
            cancelText="Отмена"
            confirmLoading={sending}
        >
            <div className={styles.hint}>
                Оплаченные дни не сгорают: новый срок прибавляется к текущему, поэтому
                продлевать можно заранее.
            </div>

            <div className={styles.field}>
                <span className={nova.tileLabel}>Срок</span>
                <Select
                    value={months}
                    onChange={setMonths}
                    options={MONTH_OPTIONS.map(m => ({ value: m, label: monthsWord(m) }))}
                />
            </div>

            {cardPayment && (
                <div className={styles.field}>
                    <span className={nova.tileLabel}>Как платите</span>
                    <div className={styles.ways}>
                        <WayOption
                            active={выбран === 'card'}
                            onSelect={() => setСпособ('card')}
                            icon={<CreditCard size={16} />}
                            name="Картой онлайн"
                            desc="Visa или Mastercard. Доступ откроется сразу после оплаты."
                        />
                        <WayOption
                            active={выбран === 'invoice'}
                            onSelect={() => setСпособ('invoice')}
                            icon={<FileText size={16} />}
                            name="По счёту"
                            desc="Выставим счёт на вашу компанию. Доступ откроется, когда придут деньги."
                        />
                    </div>
                </div>
            )}

            {выбран === 'invoice' && (
                <div className={styles.field}>
                    <span className={nova.tileLabel}>Комментарий</span>
                    <Input.TextArea
                        rows={2}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Например: счёт на другое юрлицо"
                    />
                </div>
            )}

            {/* Разбор суммы обязателен: цена зависит от числа сотрудников, и
                без него итог выглядит взятым с потолка. Считаем ровно так же,
                как сервер при выставлении счёта. */}
            <div className={styles.total}>
                <span>
                    К оплате за {monthsWord(months)}
                    <span style={{ display: 'block', fontSize: 12, opacity: 0.65 }}>
                        {moneyShort(pricePerUser)} × {users} {сотрудниковСловом(users)} × {monthsWord(months)}
                    </span>
                </span>
                <b className={styles.totalValue}>{moneyShort(итого)}</b>
            </div>
        </Modal>
    );
}

/** Одна из двух карточек выбора: как платим. */
function WayOption({
    active,
    onSelect,
    icon,
    name,
    desc,
}: {
    active: boolean;
    onSelect: () => void;
    icon: ReactNode;
    name: string;
    desc: string;
}) {
    return (
        <button
            type="button"
            className={`${styles.way}${active ? ` ${styles.wayActive}` : ''}`}
            onClick={onSelect}
            aria-pressed={active}
        >
            <span className={styles.wayIcon}>{icon}</span>
            <span className={styles.wayText}>
                <span className={styles.wayName}>{name}</span>
                <span className={styles.wayDesc}>{desc}</span>
            </span>
        </button>
    );
}

/** «сотрудник» / «сотрудника» / «сотрудников». */
export function сотрудниковСловом(n: number): string {
    const хвост = n % 100;
    const последняя = n % 10;
    if (хвост > 10 && хвост < 20) return 'сотрудников';
    if (последняя === 1) return 'сотрудник';
    if (последняя >= 2 && последняя <= 4) return 'сотрудника';
    return 'сотрудников';
}
