'use client';

import { QuoteRequestsPanel } from '@/components/quotes/QuoteRequestsPanel';

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
        <div className="lc-page mx-auto max-w-[1600px]">
            <div className="lc2-hero" style={{ marginBottom: 12 }}>
                <div>
                    <div className="lc-eyebrow">Продажи · Запросы</div>
                    <h1 className="lc2-title" style={{ maxWidth: 'none', margin: 0 }}>Запросы на расчёт</h1>
                    <p className="mt-1.5 text-[13px] text-muted-foreground">
                        Клиент спрашивает цену до заявки. Здесь видно, что предлагали раньше,
                        почём тогда нашли машину и чем всё кончилось.
                    </p>
                </div>
            </div>

            <QuoteRequestsPanel />
        </div>
    );
}
