'use client';

import type { ReactNode } from 'react';
import styles from '@/components/nova/nova.module.css';

/**
 * Переключатель разделов карточки заявки.
 *
 * Тот же вид, что у верхнего меню и у отчётов: пилюли, активная залита
 * тёмным. Подчёркнутые вкладки antd остались от прежнего скина и рядом с
 * переведёнными экранами читались как чужие.
 *
 * Содержимое неактивных разделов не рисуется вовсе — в карточке это
 * тяжёлые таблицы и формы, и держать их в разметке скрытыми значит
 * дважды платить за то, чего не видно.
 */
export interface OrderCardTab {
    key: string;
    label: ReactNode;
    children: ReactNode;
}

export default function OrderCardTabs({
    active,
    onChange,
    items,
}: {
    active: string;
    onChange: (key: string) => void;
    items: OrderCardTab[];
}) {
    const current = items.find((item) => item.key === active) || items[0];

    return (
        <>
            <div className={styles.pills} style={{ marginBottom: 16 }} role="tablist">
                {items.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={item.key === active}
                        className={`${styles.pill} ${item.key === active ? styles.pillActive : ''}`}
                        onClick={() => onChange(item.key)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            <div role="tabpanel">{current?.children}</div>
        </>
    );
}
