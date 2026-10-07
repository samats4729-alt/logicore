'use client';

import { CircleDashed, Clock, Loader } from 'lucide-react';
import { STATUS_LABELS } from '@/lib/vocabulary';
import styles from './StatusPill.module.css';

/**
 * Плашка статуса — одна на весь кабинет.
 *
 * Вид — как в таблице блока dashboard-01 из shadcn (владелец, 08.10.2026,
 * сменил прежнюю пилюлю с выпуклым цветным кружком): тонкая рамка,
 * приглушённая подпись и маленький знак слева. Цветом говорит только
 * то, что требует взгляда: зелёная галочка — готово, красный — проблема,
 * янтарные часы — ждёт исполнителя. Всё, что в работе, — серый «в
 * процессе»: какой именно этап, говорит подпись.
 *
 * Знак выбран так, чтобы статус читался и без цвета: на чёрно-белой печати
 * и при дальтонизме галочка, крестик, часы и «в процессе» различимы формой.
 */

/**
 * Цвета статусов. В самой плашке больше не используются, но их берут
 * полоски хода рейса и отметки на других экранах (`statusTone`).
 */
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
    // Биржа: груз ищет машину, водитель найден, доставлен.
    OPEN: { bg: '#fff4e5', fg: '#b45309' },
    TAKEN: { bg: '#e8f0fe', fg: '#1d4ed8' },
    DELIVERED: { bg: '#e7f8ef', fg: '#15803d' },
    // Водитель биржи: допущен, отказ, заблокирован.
    APPROVED: { bg: '#e7f8ef', fg: '#15803d' },
    REJECTED: { bg: '#f1f2f4', fg: '#5f6672' },
    BLOCKED: { bg: '#fee2e2', fg: '#dc2626' },
};

// Подписи статусов живут в общем словаре; реэкспорт оставлен, потому что
// STATUS_LABELS импортируют из этого файла больше десятка экранов.
export { STATUS_LABELS };

function hexToRgb(hex: string) {
    const v = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

/**
 * Тот же цвет, осветлённый до светлоты 0,68 при насыщенности ×0,9.
 * На тёмном полотне исходные цвета статусов становятся почти чёрными
 * пятнами: #15803d на #20201f не читается.
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

/**
 * Цвет статуса для обеих тем, готовый к подстановке в стили.
 *
 * Возвращает пару переменных: `--sp` для светлой темы и `--sp-dark` для
 * тёмной. Нужен всем, кто красит статус не плашкой, — например полоске
 * готовности в карточке заявки на телефоне.
 */
export function statusTone(status: string): React.CSSProperties {
    const meta = STATUS_PILL[status] || STATUS_PILL.DRAFT;
    return { ['--sp' as string]: meta.fg, ['--sp-dark' as string]: lighten(meta.fg) };
}

/** Что за статус по смыслу — от этого знак и его цвет. */
type Kind = 'done' | 'problem' | 'stopped' | 'blocked' | 'waiting' | 'draft' | 'progress';

const KIND: Record<string, Kind> = {
    COMPLETED: 'done',
    POSTED: 'done',
    DELIVERED: 'done',
    APPROVED: 'done',
    PROBLEM: 'problem',
    BLOCKED: 'blocked',
    CANCELLED: 'stopped',
    REJECTED: 'stopped',
    PENDING: 'waiting',
    OPEN: 'waiting',
    DRAFT: 'draft',
    ASSIGNED: 'progress',
    EN_ROUTE_PICKUP: 'progress',
    AT_PICKUP: 'progress',
    LOADING: 'progress',
    IN_TRANSIT: 'progress',
    AT_DELIVERY: 'progress',
    UNLOADING: 'progress',
    TAKEN: 'progress',
};

/** Залитый кружок со знаком — как «готово» в образце shadcn. */
function Filled({ tone, children }: { tone: 'ok' | 'bad' | 'off'; children: React.ReactNode }) {
    return (
        <svg viewBox="0 0 16 16" className={styles.icon} aria-hidden>
            <circle cx="8" cy="8" r="7" className={styles[tone]} />
            <g fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</g>
        </svg>
    );
}

function Glyph({ kind }: { kind: Kind }) {
    switch (kind) {
        case 'done':
            return <Filled tone="ok"><path d="M5 8.3l2.1 2.1L11 6.3" /></Filled>;
        case 'problem':
            return <Filled tone="bad"><path d="M8 4.6v4" /><path d="M8 11.4v.01" strokeWidth="2.2" /></Filled>;
        case 'blocked':
            return <Filled tone="bad"><path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2" /></Filled>;
        case 'stopped':
            return <Filled tone="off"><path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2" /></Filled>;
        case 'waiting':
            return <Clock className={`${styles.icon} ${styles.wait}`} aria-hidden />;
        case 'draft':
            return <CircleDashed className={styles.icon} aria-hidden />;
        default:
            return <Loader className={styles.icon} aria-hidden />;
    }
}

/**
 * `label` — для сущностей со своими словами при тех же знаках: груз на
 * бирже «Ищем машину», а не «Ожидает». Плашка одна на всё приложение.
 */
export default function StatusPill({ status, label }: { status: string; label?: string }) {
    return (
        <span className={styles.pill} data-status={status}>
            <Glyph kind={KIND[status] ?? 'draft'} />
            {label || STATUS_LABELS[status] || status}
        </span>
    );
}
