'use client';

import type { ReactNode } from 'react';
import styles from '@/components/nova/nova.module.css';

/**
 * Переключатель разделов внутри страницы.
 *
 * Тот же вид, что у верхнего меню и у отчётов: пилюли, активная залита
 * тёмным. Подчёркнутые вкладки antd остались от прежнего скина и рядом с
 * переведёнными экранами читались как чужие.
 *
 * Один компонент на все страницы: карточка рейса и карточка контрагента
 * переключают разделы одинаково, и второй такой же вводить нельзя — именно
 * так однажды разъехались плашки статусов.
 *
 * Содержимое неактивных разделов не рисуется вовсе — внутри бывают тяжёлые
 * таблицы и формы, и держать их в разметке скрытыми значит дважды платить за
 * то, чего не видно.
 */
export interface PillTab {
    key: string;
    label: ReactNode;
    children: ReactNode;
}

export default function PillTabs({
    active,
    onChange,
    items,
}: {
    active: string;
    onChange: (key: string) => void;
    items: PillTab[];
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
                        // Якорь для ИИ-гида. Проставляется здесь, а не руками на
                        // каждой странице: гид умеет подсвечивать шаги, но
                        // указывать ему внутри экрана было не на что — до
                        // вкладок карточки рейса он довести не мог, хотя туда
                        // ведёт половина вопросов. Одна строка — и якорь
                        // появился у каждой вкладки во всём кабинете.
                        data-guide={`tab-${item.key}`}
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
