'use client';

import { QuoteRequestsPanel } from '@/components/quotes/QuoteRequestsPanel';
import styles from '@/components/nova/nova.module.css';

/**
 * Общий список запросов по всем клиентам.
 *
 * Заводят запросы обычно из карточки контрагента — там менеджер и
 * находится, когда клиент написал. Этот экран нужен для другого: утром
 * увидеть все неотвеченные запросы разом, не обходя контрагентов по
 * одному.
 */
export default function RequestsPage() {
    return (
        <div className={`${styles.page} ${styles.pageWide}`}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Продажи · Запросы</div>
                    <h1 className={styles.title}>Запросы на расчёт</h1>
                    <p className={styles.subtitle}>
                        Клиент спрашивает цену до заявки. Здесь видно, что предлагали раньше,
                        почём тогда нашли машину и чем всё кончилось.
                    </p>
                </div>
            </div>

            <QuoteRequestsPanel />
        </div>
    );
}
