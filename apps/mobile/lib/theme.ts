/**
 * Дизайн-токены LogiCore Driver — в языке платформы:
 * светлый «Apple-стиль» (#f4f5f7 фон, белые карточки, радиус 20,
 * акцентный синий #1677ff) + тёмная тема.
 * Статусные цвета повторяют STATUS_PILL веб-платформы.
 */

export const BRAND = {
    primary: '#1677ff',
    dark: '#0b0d12',
    success: '#16a34a',
    warning: '#b45309',
    danger: '#dc2626',
};

export const lightColors = {
    background: '#f4f5f7',
    card: '#ffffff',
    text: '#0b0d12',
    textSecondary: '#5f6672',
    textTertiary: '#8a91a0',
    border: '#e5e7eb',
    hover: '#f1f2f4',
    primary: BRAND.primary,
    tint: '#000000',
    icon: '#333333',
    danger: BRAND.danger,
};

export const darkColors: typeof lightColors = {
    background: '#0b0d12',
    card: '#151922',
    text: '#f3f4f6',
    textSecondary: '#a7adba',
    textTertiary: '#6b7280',
    border: '#262b36',
    hover: '#1c212c',
    primary: BRAND.primary,
    tint: '#ffffff',
    icon: '#cccccc',
    danger: '#f87171',
};

export const RADIUS = {
    card: 20,
    button: 14,
    pill: 999,
};

/** Статусы рейса: подпись, цвета пилюли (как на веб-платформе), следующий шаг и прогресс */
export const STATUS_META: Record<string, {
    label: string;
    fg: string;
    bg: string;
    next?: string;
    nextLabel?: string;
    progress: number;
}> = {
    ASSIGNED: {
        label: 'Назначен', fg: '#1d4ed8', bg: '#e8f0fe',
        next: 'EN_ROUTE_PICKUP', nextLabel: 'Выехал на погрузку', progress: 18,
    },
    EN_ROUTE_PICKUP: {
        label: 'Еду на погрузку', fg: '#0e7490', bg: '#e6f6fb',
        next: 'AT_PICKUP', nextLabel: 'Прибыл на погрузку', progress: 30,
    },
    AT_PICKUP: {
        label: 'На погрузке', fg: '#4d7c0f', bg: '#eefbe7',
        next: 'LOADING', nextLabel: 'Начать погрузку', progress: 42,
    },
    LOADING: {
        label: 'Загрузка', fg: '#7e22ce', bg: '#f3e8ff',
        next: 'IN_TRANSIT', nextLabel: 'Выехал в рейс', progress: 52,
    },
    IN_TRANSIT: {
        label: 'В пути', fg: '#0369a1', bg: '#e0f2fe',
        next: 'AT_DELIVERY', nextLabel: 'Прибыл на выгрузку', progress: 68,
    },
    AT_DELIVERY: {
        label: 'На выгрузке', fg: '#3f6212', bg: '#ecfccb',
        next: 'UNLOADING', nextLabel: 'Начать выгрузку', progress: 82,
    },
    UNLOADING: {
        label: 'Разгрузка', fg: '#a21caf', bg: '#fae8ff',
        next: 'COMPLETED', nextLabel: 'Завершить рейс', progress: 92,
    },
    COMPLETED: { label: 'Завершён', fg: '#15803d', bg: '#e7f8ef', progress: 100 },
    CANCELLED: { label: 'Отменён', fg: '#b91c1c', bg: '#fdeaea', progress: 100 },
    PROBLEM: { label: 'Проблема', fg: '#dc2626', bg: '#fee2e2', progress: 50 },
};

export function statusMeta(status: string) {
    return STATUS_META[status] || { label: status, fg: '#5f6672', bg: '#f1f2f4', progress: 0 };
}
