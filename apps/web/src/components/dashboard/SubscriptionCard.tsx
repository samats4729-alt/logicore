'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import SubscriptionBuyModal from '@/components/billing/SubscriptionBuyModal';
import { BillingStatus, subscriptionView } from '@/lib/subscription-state';
import { CreditCard } from 'lucide-react';
import kpi from './kpi.module.css';

/**
 * Тариф компании на главной кабинета.
 *
 * Один блок отвечает на два вопроса: сколько стоит месяц и до какого числа
 * оплачено. Раньше про подписку в кабинете не было написано нигде — человек
 * узнавал о ней в тот день, когда переставал попадать внутрь.
 *
 * Стоит последней плиткой в ряду показателей. Раньше это была отдельная
 * полоса во всю ширину — ради длинной подписи, которую в общем ряду
 * обрезало многоточием. Теперь подпись у этой плитки переносится на вторую
 * строку, а не обрезается, и отдельный этаж под одну строку не нужен.
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
            {/* Плашка в ряду показателей. Пояснение («до 14 октября»,
                «после 16 августа доступ закроется») — в подсказке при
                наведении, а срочность несёт рамка, а не цвет текста. */}
            <div className={`${kpi.kpi}${urgent ? ` ${kpi.urgent}` : ''}`} title={sub || undefined}>
                <CreditCard size={15} className={kpi.icon} />
                <span className={kpi.label}>Тариф</span>
                <span className={kpi.value}>{value}</span>
                {action && (
                    <button
                        type="button"
                        className={kpi.action}
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
