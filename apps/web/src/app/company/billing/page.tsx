'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { dayMonth } from '@/lib/ru-date';
import { moneyShort } from '@/lib/money-format';
import SubscriptionBuyModal, { monthsWord } from '@/components/billing/SubscriptionBuyModal';
import { BillingStatus, subscriptionView } from '@/lib/subscription-state';
import Loader from '@/components/ui/Loader';
import styles from '@/components/nova/nova.module.css';

/**
 * Подписка — отдельной страницей, из меню под именем человека.
 *
 * Про подписку в кабинете было написано в одном месте: плиткой на главной,
 * среди рабочих цифр. Кто продлевает — руководитель — заходит на главную не
 * каждый день, и вопрос «где у вас продлевать» звучал снова и снова.
 *
 * Страница показывает три числа и кнопку. Пояснений здесь нет намеренно:
 * первая версия объясняла, из чего складывается сумма, целым абзацем — и
 * читалась как инструкция для непонятливых. Цифры говорят сами.
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

    const вид = status ? subscriptionView(status) : null;

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Кабинет</div>
                    <h1 className={styles.title}>Подписка</h1>
                </div>
                <div className={styles.heroActions}>
                    <button type="button" className={styles.action} onClick={() => router.push('/company')}>
                        <ArrowLeft size={15} />
                        На главную
                    </button>
                    {/* Кнопки нет, когда делать нечего: на бесплатном доступе
                        и пока ждём счёт по отправленному запросу. */}
                    {вид?.action && (
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

            {!вид || !status ? (
                <div className={styles.card} style={{ padding: '18px 16px', fontSize: 13 }}>
                    Не удалось получить состояние подписки.{' '}
                    <button
                        type="button"
                        className={styles.action}
                        style={{ marginLeft: 8 }}
                        onClick={load}
                    >
                        <RefreshCw size={15} />
                        Обновить
                    </button>
                </div>
            ) : (
                <>
                    <div className={styles.tiles}>
                        <div className={styles.tile}>
                            <span className={styles.tileLabel}>Состояние</span>
                            <div className={styles.tileValue}>{вид.value}</div>
                            <div className={styles.tileSub}>{вид.sub}</div>
                        </div>
                        <div className={styles.tile}>
                            <span className={styles.tileLabel}>В месяц</span>
                            <div className={styles.tileValue}>{moneyShort(вид.price)}</div>
                            <div className={styles.tileSub}>{moneyShort(вид.pricePerUser)} за сотрудника</div>
                        </div>
                        <div className={styles.tile}>
                            <span className={styles.tileLabel}>Сотрудников</span>
                            <div className={styles.tileValue}>{вид.users}</div>
                            <div className={styles.tileSub}>водители не в счёт</div>
                        </div>
                    </div>

                    {/* Отправленный запрос на счёт — состояние, в котором
                        человек ждёт и не понимает, чего именно. Одной строкой. */}
                    {status.request && (
                        <div className={styles.card} style={{ padding: '14px 16px', fontSize: 13 }}>
                            Счёт запрошен: {monthsWord(status.request.months)} на{' '}
                            {moneyShort(status.request.amount)} ·{' '}
                            {dayMonth(dayjs(status.request.createdAt))}
                        </div>
                    )}
                </>
            )}

            <SubscriptionBuyModal
                open={buyOpen}
                pricePerUser={вид?.pricePerUser ?? 0}
                users={вид?.users ?? 1}
                cardPayment={status?.cardPayment}
                onClose={() => setBuyOpen(false)}
                onSent={load}
            />
        </div>
    );
}
