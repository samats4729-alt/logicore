'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { dayMonth } from '@/lib/ru-date';
import { moneyShort } from '@/lib/money-format';
import SubscriptionBuyModal, { daysWord, monthsWord } from '@/components/billing/SubscriptionBuyModal';
import nova from '@/components/nova/nova.module.css';
import styles from './subscription-card.module.css';

/**
 * Тариф компании на главной кабинета.
 *
 * Один блок отвечает на два вопроса: сколько стоит месяц и до какого числа
 * оплачено. Раньше про подписку в кабинете не было написано нигде — человек
 * узнавал о ней в тот день, когда переставал попадать внутрь.
 */

export interface BillingStatus {
    enabled: boolean;
    blocked: boolean;
    status?: string | null;
    until?: string | null;
    daysLeft?: number | null;
    priceMonthly?: number;
    request?: { id: string; months: number; amount: number; createdAt: string } | null;
}

export default function SubscriptionCard() {
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [buyOpen, setBuyOpen] = useState(false);

    const load = () => api.get('/billing/status').then(res => setStatus(res.data)).catch(() => { });

    useEffect(() => { load(); }, []);

    if (!status) return null;

    const price = status.priceMonthly ?? 0;
    const until = status.until ? dayjs(status.until) : null;
    const left = status.daysLeft ?? null;

    // Слова разные не ради разнообразия: «пробный период» у новой компании и
    // «дни на оплату» у той, что работает год, — это разные новости, и путать
    // их нельзя.
    let value: string;
    let sub: string;
    let action: string | null = null;
    let urgent = false;

    if (!status.enabled) {
        value = '0 ₸ в месяц';
        sub = 'на время тестирования · доступ открыт';
    } else if (status.request) {
        value = 'Запрос отправлен';
        sub = `${monthsWord(status.request.months)} · ${moneyShort(status.request.amount)} · ждём счёт`;
    } else if (status.status === 'ACTIVE' && until) {
        value = `Оплачено до ${dayMonth(until)}`;
        sub = `${moneyShort(price)} в месяц${left != null ? ` · осталось ${daysWord(left)}` : ''}`;
        action = 'Продлить';
    } else if (status.status === 'ACTIVE') {
        value = 'Подписка активна';
        sub = 'бессрочно';
    } else if (status.status === 'GRACE' && until) {
        value = `Осталось ${daysWord(left ?? 0)}`;
        sub = `${moneyShort(price)} в месяц · после ${dayMonth(until)} доступ закроется`;
        action = 'Купить подписку';
        urgent = true;
    } else if (status.status === 'TRIAL' && until) {
        value = `Пробный период до ${dayMonth(until)}`;
        sub = `${left != null ? `осталось ${daysWord(left)} · ` : ''}дальше ${moneyShort(price)} в месяц`;
        action = 'Оформить';
        urgent = (left ?? 99) <= 3;
    } else {
        value = 'Подписка не активна';
        sub = until ? `срок закончился ${dayMonth(until)}` : `${moneyShort(price)} в месяц`;
        action = 'Оформить';
        urgent = true;
    }

    return (
        <>
            <div className={`${styles.card}${urgent ? ` ${styles.urgent}` : ''}`}>
                <div className={styles.body}>
                    <span className={nova.tileLabel}>Тариф</span>
                    {/* Срочность несёт рамка, а не цвет текста: «Осталось 3 дня»
                        читается как факт, и красить сам факт незачем. */}
                    <div className={styles.value}>{value}</div>
                    <div className={styles.sub}>{sub}</div>
                </div>
                {action && (
                    <button
                        type="button"
                        className={`${nova.action} ${nova.actionPrimary}`}
                        onClick={() => setBuyOpen(true)}
                    >
                        {action}
                    </button>
                )}
            </div>

            <SubscriptionBuyModal
                open={buyOpen}
                priceMonthly={price}
                onClose={() => setBuyOpen(false)}
                onSent={load}
            />
        </>
    );
}
