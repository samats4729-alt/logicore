'use client';

import { STATUS_CHAIN } from '@/lib/order-status';
import styles from './order-card.module.css';

/**
 * Где рейс сейчас — словами рядом со статусом: «этап 5 из 8».
 *
 * «Вариант 5» макета владельца (31.10.2026) убрал полосу этапов с кружками:
 * статус в шапке уже говорит, что происходит, а полоса повторяла его ещё
 * восемью подписями. Номер этапа оставляет главное — сколько пройдено.
 *
 * У отменённого рейса и черновика этапов нет. «Ждёт исполнителя» и
 * «Проблема» — не этапы, а состояния: номер тогда не показываем, статус
 * скажет сам.
 */
export function OrderStageText({ status }: { status: string }) {
    const index = STATUS_CHAIN.indexOf(status);
    if (index < 0) return null;
    return <span className={styles.stage}>этап {index + 1} из {STATUS_CHAIN.length}</span>;
}
