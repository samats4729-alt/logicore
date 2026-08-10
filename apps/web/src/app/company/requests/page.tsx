'use client';

import { useRouter } from 'next/navigation';
import { Calculator } from 'lucide-react';
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
    const router = useRouter();

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
                {/* Калькулятор стоял в «Финансах», рядом с зарплатой. По работе
                    он здесь: клиент спросил цену — посчитали — ответили. */}
                <div className={styles.heroActions}>
                    <button
                        type="button"
                        className={styles.action}
                        onClick={() => router.push('/company/calculator')}
                    >
                        <Calculator size={15} />
                        Калькулятор
                    </button>
                </div>
            </div>

            <QuoteRequestsPanel />
        </div>
    );
}
