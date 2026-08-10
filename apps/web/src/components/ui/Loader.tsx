'use client';

import { Loader2 } from 'lucide-react';
import styles from './Loader.module.css';

/**
 * Ожидание — одно на весь кабинет.
 *
 * Раньше на каждом экране крутился `Spin` из Ant Design: синий, с чужой
 * толщиной штриха и своим представлением о размерах. Он выдавал старую
 * библиотеку в первую же секунду работы — до того, как человек увидит
 * страницу. Здесь обычное кольцо на цветах кабинета, как в остальном
 * интерфейсе.
 *
 * `full` — ожидание целого экрана: занимает высоту окна и ставит кольцо по
 * центру. Так грузятся кабинет, вход и страницы, которым нечего показать,
 * пока не пришёл ответ.
 */

const SIZES = { small: 15, default: 20, large: 28 } as const;

export interface LoaderProps {
    size?: keyof typeof SIZES;
    /** Подпись под кольцом: чего именно ждём. */
    tip?: string;
    /** Ожидание во весь экран. */
    full?: boolean;
    className?: string;
}

export default function Loader({ size = 'default', tip, full, className }: LoaderProps) {
    return (
        <div
            className={`${styles.wrap} ${full ? styles.full : ''} ${className || ''}`}
            role="status"
            aria-live="polite"
        >
            <Loader2 size={SIZES[size]} className={styles.ring} aria-hidden />
            {tip ? <span className={styles.tip}>{tip}</span> : <span className={styles.sr}>Загрузка</span>}
        </div>
    );
}
