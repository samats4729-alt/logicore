'use client';

import { useState } from 'react';
import { Lock, LogOut, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/auth';
import { dayMonth } from '@/lib/ru-date';
import { moneyShort } from '@/lib/money-format';
import SubscriptionBuyModal, { monthsWord } from '@/components/billing/SubscriptionBuyModal';
import type { BillingStatus } from '@/components/dashboard/SubscriptionCard';
import nova from '@/components/nova/nova.module.css';
import styles from './paywall.module.css';

/**
 * Экран «Подписка не активна». Показывается вместо кабинета, когда оплата
 * включена, а у компании закончился пробный период, срок на оплату или
 * оплаченный месяц.
 *
 * Тут же и покупают: до сих пор экран предлагал «связаться с нами», и на
 * этом всё заканчивалось — человек, готовый заплатить, упирался в тупик.
 */
export default function PaywallScreen({ status }: { status?: BillingStatus }) {
    const { logout } = useAuthStore();
    const [buyOpen, setBuyOpen] = useState(false);

    const price = status?.priceMonthly ?? 0;
    const until = status?.until ? dayjs(status.until) : null;
    const request = status?.request ?? null;

    return (
        <div className={styles.wrap}>
            <div className={styles.icon}><Lock size={20} /></div>

            <h1 className={styles.title}>Подписка не активна</h1>
            <p className={styles.lead}>
                {/* Дату называем, только если она действительно прошла: подписку
                    могли отключить и посреди оплаченного месяца, и «срок
                    закончился 13 сентября» в августе читалось бы как ошибка. */}
                {until && until.isBefore(dayjs())
                    ? `Срок закончился ${dayMonth(until)}. Данные компании на месте — кабинет откроется сразу после оплаты.`
                    : 'Данные компании на месте — кабинет откроется сразу после оплаты.'}
            </p>

            <section className={styles.card}>
                {request ? (
                    <>
                        <div className={styles.price}>Запрос отправлен</div>
                        <div className={styles.priceSub}>
                            {monthsWord(request.months)} · {moneyShort(request.amount)} · ждём счёт
                        </div>
                        <div className={styles.note}>
                            Счёт выставим на вашу компанию. Как только оплата придёт, кабинет
                            откроется — перенастраивать ничего не нужно.
                        </div>
                    </>
                ) : (
                    <>
                        <div className={styles.price}>{moneyShort(price)}</div>
                        <div className={styles.priceSub}>в месяц</div>
                        <div className={styles.note}>
                            Оплата по счёту на вашу компанию. Выберите срок — мы выставим счёт.
                        </div>
                        <button
                            type="button"
                            className={`${nova.action} ${nova.actionPrimary} ${styles.buy}`}
                            onClick={() => setBuyOpen(true)}
                        >
                            Купить подписку
                        </button>
                    </>
                )}
            </section>

            <div className={styles.foot}>
                <button type="button" className={nova.action} onClick={() => window.location.reload()}>
                    <RefreshCw size={14} /> Я оплатил — обновить
                </button>
                <button type="button" className={nova.action} onClick={logout}>
                    <LogOut size={14} /> Выйти
                </button>
            </div>

            <SubscriptionBuyModal
                open={buyOpen}
                priceMonthly={price}
                onClose={() => setBuyOpen(false)}
                onSent={() => window.location.reload()}
            />
        </div>
    );
}
