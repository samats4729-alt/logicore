'use client';

import styles from './RecordLink.module.css';

/**
 * Ссылка на запись: номер счёта, акта, заявки.
 *
 * Синим такие переходы быть не должны. Синий в кабинете означает ссылку
 * наружу — на сайт, на карту, на почту; а номер документа в журнале ведёт
 * туда же, где человек и работает. Отличается подчёркиванием, а не цветом.
 *
 * Один компонент на все журналы: номер счёта, акта и входящего документа
 * раньше рисовались тремя одинаковыми кусками разметки, и разъехаться им
 * было делом времени — как однажды разъехались плашки статусов.
 */
export default function RecordLink({
    children,
    onClick,
    title,
}: {
    children: React.ReactNode;
    onClick: () => void;
    title?: string;
}) {
    return (
        <button type="button" className={styles.link} title={title} onClick={onClick}>
            {children}
        </button>
    );
}
