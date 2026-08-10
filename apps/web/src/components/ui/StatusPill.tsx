'use client';

import { ArrowDown, ArrowRight, ArrowUp, Check, Clock, FileText, Truck, UserRound, X } from 'lucide-react';
import { STATUS_LABELS } from '@/lib/vocabulary';
import styles from './StatusPill.module.css';

/**
 * Плашка статуса — одна на весь кабинет.
 *
 * Раньше их было две: залитая целиком (карточка рейса, поиск, уведомления,
 * журналы бухгалтерии) и по эталону `design/orders-list` — цветной кружок и
 * обычная подпись. Один и тот же «Завершён» выглядел в двух местах
 * по-разному, и владелец находил это первым.
 *
 * Остался вид эталона: десяток целиком залитых плашек превращает таблицу в
 * светофор, а кружок читается и в плотной строке. Подписи и цвета живут
 * здесь же — их импортируют больше десятка экранов.
 *
 * Знак внутри кружка выбран так, чтобы статус читался и без цвета: на
 * чёрно-белой печати и при дальтонизме подпись остаётся единственной
 * подсказкой, а знак возвращает вторую.
 */

/** Цвета статусов: заливка кружка и подложка на прежних экранах. */
export const STATUS_PILL: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: '#f1f2f4', fg: '#5f6672' },
    PENDING: { bg: '#fff4e5', fg: '#b45309' },
    ASSIGNED: { bg: '#e8f0fe', fg: '#1d4ed8' },
    EN_ROUTE_PICKUP: { bg: '#e6f6fb', fg: '#0e7490' },
    AT_PICKUP: { bg: '#eefbe7', fg: '#4d7c0f' },
    LOADING: { bg: '#f3e8ff', fg: '#7e22ce' },
    IN_TRANSIT: { bg: '#e0f2fe', fg: '#0369a1' },
    AT_DELIVERY: { bg: '#ecfccb', fg: '#3f6212' },
    UNLOADING: { bg: '#fae8ff', fg: '#a21caf' },
    COMPLETED: { bg: '#e7f8ef', fg: '#15803d' },
    PROBLEM: { bg: '#fee2e2', fg: '#dc2626' },
    CANCELLED: { bg: '#fdeaea', fg: '#b91c1c' },
    POSTED: { bg: '#e7f8ef', fg: '#15803d' },
};

// Подписи статусов живут в общем словаре; реэкспорт оставлен, потому что
// STATUS_LABELS импортируют из этого файла больше десятка экранов.
export { STATUS_LABELS };

const GLYPHS: Record<string, React.ComponentType<{ className?: string }>> = {
    DRAFT: FileText,
    PENDING: Clock,
    ASSIGNED: UserRound,
    EN_ROUTE_PICKUP: ArrowRight,
    AT_PICKUP: ArrowDown,
    LOADING: ArrowDown,
    IN_TRANSIT: Truck,
    AT_DELIVERY: ArrowUp,
    UNLOADING: ArrowUp,
    COMPLETED: Check,
    POSTED: Check,
    CANCELLED: X,
};

/** Восклицательный знак: в наборе иконок он есть только внутри кружка, а
 *  кружок здесь уже свой — вложенные кольца читались как помарка. */
function Bang({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
            <rect x="10.6" y="4.6" width="2.8" height="9.4" rx="1.4" />
            <circle cx="12" cy="18" r="1.7" />
        </svg>
    );
}

function hexToRgb(hex: string) {
    const v = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

/**
 * Тот же цвет, осветлённый до светлоты 0,68 при насыщенности ×0,9 —
 * правило из эталона. На тёмном полотне исходные цвета статусов становятся
 * почти чёрными пятнами: #15803d на #20201f не читается.
 */
function lighten(hex: string) {
    const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    let s = 0;
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return `hsl(${Math.round(h)} ${Math.round(Math.min(1, s * 0.9) * 100)}% 68%)`;
}

export default function StatusPill({ status }: { status: string }) {
    const meta = STATUS_PILL[status] || STATUS_PILL.DRAFT;
    const Glyph = status === 'PROBLEM' ? Bang : GLYPHS[status] || FileText;

    return (
        <span
            className={styles.pill}
            style={{ ['--sp' as string]: meta.fg, ['--sp-dark' as string]: lighten(meta.fg) }}
        >
            <i className={styles.dot}>
                <Glyph className={styles.glyph} />
            </i>
            {STATUS_LABELS[status] || status}
        </span>
    );
}
