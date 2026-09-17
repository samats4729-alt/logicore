'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, FileText, RefreshCw, Users } from 'lucide-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { dayMonth } from '@/lib/ru-date';
import { moneyShort } from '@/lib/money-format';
import SubscriptionBuyModal, { monthsWord } from '@/components/billing/SubscriptionBuyModal';
import { BillingStatus, subscriptionView } from '@/lib/subscription-state';
import Loader from '@/components/ui/Loader';
import styles from '@/components/nova/nova.module.css';

/**
 * Подписка и тариф — отдельной страницей, из меню профиля.
 *
 * Про подписку в кабинете было написано в одном месте: плиткой на главной,
 * среди рабочих цифр. Кто продлевает — руководитель — заходит на главную не
 * каждый день, а плитка ничем не отличается от соседних, и вопрос «где у вас
 * продлевать» звучал снова и снова. Теперь есть адрес, который можно назвать
 * словами: профиль → «Подписка».
 *
 * Страница отвечает на три вопроса в порядке, в котором их задают: до какого
 * числа оплачено, сколько стоит месяц и из чего сумма, как заплатить.
 */
export default function BillingPage() {
    const router = useRouter();
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [buyOpen, setBuyOpen] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/billing/status')
            .then((res) => setStatus(res.data))
            .catch(() => setStatus(null))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return <div style={{ padding: 48, textAlign: 'center' }}><Loader /></div>;
    }

    if (!status) {
        return (
            <div className={styles.page}>
                <div className={styles.hero}>
                    <div>
                        <div className={styles.eyebrow}>Кабинет · Подписка</div>
                        <h1 className={styles.title}>Подписка и тариф</h1>
                        <p className={styles.subtitle}>
                            Не удалось получить состояние подписки. Обновите страницу
                            или напишите в поддержку.
                        </p>
                    </div>
                    <div className={styles.heroActions}>
                        <button type="button" className={styles.action} onClick={load}>
                            <RefreshCw size={15} />
                            Обновить
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const вид = subscriptionView(status);
    const until = status.until ? dayjs(status.until) : null;

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Кабинет · Подписка</div>
                    <h1 className={styles.title}>Подписка и тариф</h1>
                    <p className={styles.subtitle}>
                        Сколько стоит месяц, до какого числа оплачено и как продлить.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    <button type="button" className={styles.action} onClick={() => router.push('/company')}>
                        <ArrowLeft size={15} />
                        На главную
                    </button>
                    {/* Кнопки нет, когда делать нечего: на бесплатном доступе и
                        пока ждём счёт по отправленному запросу. */}
                    {вид.action && (
                        <button
                            type="button"
                            className={`${styles.action} ${styles.actionPrimary}`}
                            onClick={() => setBuyOpen(true)}
                        >
                            <CreditCard size={15} />
                            {вид.action}
                        </button>
                    )}
                </div>
            </div>

            {/* Три цифры в том порядке, в каком про них спрашивают. */}
            <div className={styles.tiles}>
                <div className={styles.tile}>
                    <span className={styles.tileLabel}>Состояние</span>
                    <div className={styles.tileValue}>{вид.value}</div>
                    <div className={styles.tileSub}>{вид.sub}</div>
                </div>
                <div className={styles.tile}>
                    <span className={styles.tileLabel}>В месяц</span>
                    <div className={styles.tileValue}>{moneyShort(вид.price)}</div>
                    <div className={styles.tileSub}>{вид.perMonthText}</div>
                </div>
                <div className={styles.tile}>
                    <span className={styles.tileLabel}>Оплачивается сотрудников</span>
                    <div className={styles.tileValue}>{вид.users}</div>
                    <div className={styles.tileSub}>водители в счёт не идут</div>
                </div>
            </div>

            {/* Отправленный запрос на счёт — состояние, в котором человек
                ждёт и не понимает, чего именно. Говорим прямо. */}
            {status.request && (
                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <FileText size={15} />
                        <h2 className={styles.cardTitle}>Счёт запрошен</h2>
                    </div>
                    <div style={{ padding: '10px 16px 14px', fontSize: 13 }}>
                        {monthsWord(status.request.months)} на {moneyShort(status.request.amount)}.
                        Запрос отправлен {dayMonth(dayjs(status.request.createdAt))} — счёт придёт
                        на почту компании, доступ продлится в день оплаты.
                    </div>
                </section>
            )}

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Users size={15} />
                    <h2 className={styles.cardTitle}>Как считается оплата</h2>
                </div>
                <div style={{ padding: '10px 16px 16px', fontSize: 13, lineHeight: 1.65 }}>
                    <p style={{ margin: '0 0 8px' }}>
                        Платёж зависит от числа сотрудников в кабинете: {moneyShort(вид.pricePerUser)} за
                        одного в месяц. Водители не считаются — за них платить не нужно.
                    </p>
                    <p style={{ margin: 0 }}>
                        Сейчас оплачивается {вид.users} — это {moneyShort(вид.price)} в месяц.
                        Добавите или уберёте сотрудника в «Кабинет → Сотрудники» — сумма
                        пересчитается со следующего платежа.
                        {until && status.enabled ? ` Текущий доступ действует до ${dayMonth(until)}.` : ''}
                    </p>
                </div>
            </section>

            <SubscriptionBuyModal
                open={buyOpen}
                pricePerUser={вид.pricePerUser}
                users={вид.users}
                cardPayment={status.cardPayment}
                onClose={() => setBuyOpen(false)}
                onSent={load}
            />
        </div>
    );
}
