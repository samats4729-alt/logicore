'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import SubscriptionBuyModal from '@/components/billing/SubscriptionBuyModal';
import { BillingStatus, subscriptionView } from '@/lib/subscription-state';
import nova from '@/components/nova/nova.module.css';
import styles from './subscription-card.module.css';

/**
 * Тариф компании на главной кабинета.
 *
 * Один блок отвечает на два вопроса: сколько стоит месяц и до какого числа
 * оплачено. Раньше про подписку в кабинете не было написано нигде — человек
 * узнавал о ней в тот день, когда переставал попадать внутрь.
 */

export default function SubscriptionCard() {
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [buyOpen, setBuyOpen] = useState(false);

    const load = () => api.get('/billing/status').then(res => setStatus(res.data)).catch(() => { });

    useEffect(() => { load(); }, []);

    if (!status) return null;

    // Слова про подписку — из общего места: ту же строку читает страница
    // «Подписка», и разъехаться им нельзя.
    const { value, sub, action, urgent, pricePerUser: perUser, users } = subscriptionView(status);

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
                pricePerUser={perUser}
                users={users}
                cardPayment={status.cardPayment}
                onClose={() => setBuyOpen(false)}
                onSent={load}
            />
        </>
    );
}
