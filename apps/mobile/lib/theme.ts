/**
 * Дизайн-токены LogiCore Driver — в языке платформы (кабинет logicore.kz):
 * Inter для текста и Unbounded для заголовков, графитовые кнопки, белые
 * карточки с тонкой рамкой, мягкая тень, светлый фон #f4f5f7. Тёмная тема —
 * тёплый графит, как тёмная тема кабинета (#20201f / #f1f0ec).
 * Статусные цвета повторяют STATUS_PILL веб-платформы.
 */

/** Шрифты. Имена — как их регистрирует `useFonts` в app/_layout.tsx. */
export const FONT = {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    display: 'Unbounded_600SemiBold',
    displayMedium: 'Unbounded_500Medium',
    displayBold: 'Unbounded_700Bold',
};

/**
 * Акцент и смысловые цвета без привязки к теме: значки на картах, точки
 * маршрута, ссылки. Кнопки и выделение берут цвет из темы (`colors.primary`).
 */
export const BRAND = {
    primary: '#1677ff',
    dark: '#0b0d12',
    success: '#12855b',
    warning: '#b25e09',
    danger: '#d92d20',
};

/**
 * Выбранный вариант (фишка, кузов, «моя машина»): в светлой теме — графит
 * с белым текстом, как пилюли платформы; в тёмной — светлый с графитовым,
 * иначе выбранное сливается с фоном и выглядит невыбранным.
 */
export function selectedColors(isDark: boolean) {
    return isDark ? { bg: '#f1f0ec', fg: '#20201f' } : { bg: BRAND.dark, fg: '#ffffff' };
}

export const lightColors = {
    background: '#f4f5f7',
    card: '#ffffff',
    surface2: '#f7f8fa',
    text: '#0b0d12',
    textSecondary: '#4c5460',
    textTertiary: '#868e9c',
    border: '#e6e8ec',
    border2: '#eff0f3',
    hover: '#f1f2f4',
    primary: '#0b0d12',
    primaryFg: '#ffffff',
    accent: '#1677ff',
    accentSoft: '#eef4ff',
    /** Тёмный акцент-блок (главная карточка рейса): глубокий графит платформы. */
    feature: '#0b0d12',
    featureFg: '#ffffff',
    tint: '#000000',
    icon: '#333333',
    danger: '#d92d20',
    dangerSoft: '#fef2f1',
    warn: '#b25e09',
    warnSoft: '#fff5e8',
    pos: '#12855b',
    posSoft: '#e9f8f1',
};

export const darkColors: typeof lightColors = {
    background: '#171716',
    card: '#20201f',
    surface2: '#1a1a19',
    text: '#f1f0ec',
    textSecondary: '#b2b1aa',
    textTertiary: '#8b8a83',
    border: '#343430',
    border2: '#2c2c29',
    hover: '#292927',
    primary: '#f1f0ec',
    primaryFg: '#20201f',
    accent: '#5aa2ff',
    accentSoft: '#25313f',
    feature: '#2a2a28',
    featureFg: '#f1f0ec',
    tint: '#ffffff',
    icon: '#cccccc',
    danger: '#ff8478',
    dangerSoft: '#3a2723',
    warn: '#e8ac66',
    warnSoft: '#3a2e1e',
    pos: '#5bcf95',
    posSoft: '#22342b',
};

export type AppColors = typeof lightColors;

export const RADIUS = {
    card: 18,
    button: 16,
    input: 14,
    pill: 999,
};

/** Мягкая тень карточки, как у плиток кабинета. На Android — едва заметная. */
export const SHADOW = {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 1,
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

/** Смешать два цвета #rrggbb: доля `t` второго. */
function mix(a: string, b: string, t: number): string {
    const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    const c = [0, 1, 2].map((i) => Math.round(p(a, i) * (1 - t) + p(b, i) * t));
    return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Цвета пилюли статуса под тему. В светлой — ровно как на платформе; в
 * тёмной светлая подложка слепит, поэтому подложка — приглушённый тон
 * статуса, надпись — его осветлённый вариант.
 */
export function statusColors(status: string, isDark: boolean): { fg: string; bg: string } {
    const m = statusMeta(status);
    if (!isDark) return { fg: m.fg, bg: m.bg };
    return { fg: mix(m.fg, '#ffffff', 0.45), bg: mix(m.fg, darkColors.card, 0.78) };
}
