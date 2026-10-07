'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import nova from '@/components/nova/nova.module.css';
import styles from './dashboard-card.module.css';

/**
 * Карточка блока на дашборде.
 *
 * Все блоки — активность, календарь, счета, события — собираются в одну
 * рамку: одна шапка, один отступ, одно место для перехода на полную
 * страницу. Когда у каждого блока шапка была своя, дашборд выглядел
 * лоскутным, даже если края карточек совпадали.
 *
 * Пустоту и загрузку блок рисует через `DashboardCard.Center` — посередине
 * карточки, а не у верхнего края.
 */
/**
 * Карточка внутри дашборда-конструктора.
 *
 * Там рамку, шапку и меню блоку даёт конструктор (макет «shadcn Nova»), а
 * карточка рисует только содержимое. Переход «Журнал счетов →» из своей
 * шапки она отдаёт в шапку конструктора — через `setAction`.
 */
export const BoardSlotContext = createContext<{ setAction: (a: { label: string; onClick: () => void } | null) => void } | null>(null);

export default function DashboardCard({
    icon,
    title,
    badge,
    link,
    hint,
    flush,
    className,
    bodyClassName,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    /** Плашка сразу за заголовком: сколько ждёт, сколько просрочено. */
    badge?: React.ReactNode;
    /** Переход на полную страницу — в правом углу шапки. */
    link?: { label: string; onClick: () => void };
    /** Одна строка пояснения под шапкой. */
    hint?: React.ReactNode;
    /** Тело без полей — для таблицы, которая встаёт к краям карточки. */
    flush?: boolean;
    className?: string;
    bodyClassName?: string;
    children: React.ReactNode;
}) {
    const slot = useContext(BoardSlotContext);
    // Обработчик перехода меняется на каждой отрисовке — держим последний,
    // а в шапку конструктора отдаём один раз, пока подпись та же.
    const onClick = useRef(link?.onClick);
    onClick.current = link?.onClick;
    useEffect(() => {
        if (!slot) return;
        slot.setAction(link ? { label: link.label, onClick: () => onClick.current?.() } : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slot, link?.label]);

    if (slot) {
        return (
            <div className="flex min-h-0 flex-1 flex-col">
                {hint && <div className={styles.hint}>{hint}</div>}
                <div className={[styles.body, styles.slotBody, flush ? styles.flush : '', bodyClassName].filter(Boolean).join(' ')}>
                    {children}
                </div>
            </div>
        );
    }

    return (
        <section className={[nova.card, styles.card, className].filter(Boolean).join(' ')}>
            <div className={`${nova.cardHead} ${styles.head}`}>
                {icon}
                <h2 className={`${nova.cardTitle} ${styles.title}`}>{title}</h2>
                {badge}
                <span className={styles.spacer} />
                {link && (
                    <button type="button" className={styles.link} onClick={link.onClick}>
                        {link.label} <ArrowRight size={12} />
                    </button>
                )}
            </div>
            {hint && <div className={styles.hint}>{hint}</div>}
            <div className={[styles.body, flush ? styles.flush : '', bodyClassName].filter(Boolean).join(' ')}>
                {children}
            </div>
        </section>
    );
}

/** Надпись посередине карточки: «загружается», «пока пусто». */
DashboardCard.Center = function Center({ children }: { children: React.ReactNode }) {
    return <div className={styles.center}>{children}</div>;
};
