'use client';

import { useState } from 'react';
import { Modal, Select, Input } from 'antd';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { toast } from 'sonner';
import nova from '@/components/nova/nova.module.css';
import styles from './subscription-buy.module.css';

/**
 * Покупка подписки.
 *
 * Деньги через платформу не идут: оплата по счёту. Поэтому окно не принимает
 * оплату, а отправляет запрос — какая компания, на сколько месяцев и на
 * какую сумму. Сумму считает сервер, здесь она только показана.
 *
 * Одно окно на два места: плитка «Тариф» на главной и экран «Подписка не
 * активна». Формулировки про сгорающие дни должны совпадать слово в слово,
 * а два таких куска разъехались бы в первый же месяц.
 */

const MONTH_OPTIONS = [1, 3, 6, 12];

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
    priceMonthly,
    onClose,
    onSent,
}: {
    open: boolean;
    priceMonthly: number;
    onClose: () => void;
    onSent: () => void;
}) {
    const [months, setMonths] = useState(1);
    const [comment, setComment] = useState('');
    const [sending, setSending] = useState(false);

    const send = async () => {
        setSending(true);
        try {
            await api.post('/billing/requests', { months, comment });
            toast.success('Запрос отправлен — выставим счёт');
            setComment('');
            onClose();
            onSent();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось отправить запрос');
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal
            title="Купить подписку"
            open={open}
            onCancel={onClose}
            onOk={send}
            okText="Отправить запрос"
            cancelText="Отмена"
            confirmLoading={sending}
        >
            <div className={styles.hint}>
                Выберите срок — мы выставим счёт на вашу компанию. Доступ продлится, когда
                оплата придёт. Оплаченные дни не сгорают: новый срок прибавляется к текущему,
                поэтому продлевать можно заранее.
            </div>

            <div className={styles.field}>
                <span className={nova.tileLabel}>Срок</span>
                <Select
                    value={months}
                    onChange={setMonths}
                    options={MONTH_OPTIONS.map(m => ({ value: m, label: monthsWord(m) }))}
                />
            </div>

            <div className={styles.field}>
                <span className={nova.tileLabel}>Комментарий</span>
                <Input.TextArea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Например: счёт на другое юрлицо"
                />
            </div>

            <div className={styles.total}>
                <span>К оплате за {monthsWord(months)}</span>
                <b className={styles.totalValue}>{moneyShort(priceMonthly * months)}</b>
            </div>
        </Modal>
    );
}
