'use client';

import { ArrowDown, ArrowRight, ArrowUp, Check, Clock, FileText, Truck, UserRound, X } from 'lucide-react';
import { STATUS_LABELS, STATUS_PILL } from './StatusPill';
import styles from './OrderStatusPill.module.css';

/**
 * Плашка статуса журнала заявок по эталону `design/orders-list`.
 *
 * Отличается от `StatusPill` тем, что цветом залит только кружок, а подпись
 * идёт обычным текстом: строк в журнале много, и десяток целиком залитых
 * плашек превращал таблицу в светофор. Старый вид остался на остальных
 * экранах — кабинет переезжает на новый язык постранично.
 *
 * Знак внутри кружка выбран так, чтобы статус читался и без цвета: на
 * чёрно-белой печати и при дальтонизме подпись остаётся единственной
 * подсказкой, а знак возвращает вторую.
 */

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

export default function OrderStatusPill({ status }: { status: string }) {
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
