/**
 * Справочник состава груза: паллеты, способы погрузки, виды упаковки.
 *
 * Один список на всё приложение — иначе в форме заявки, в карточке рейса и
 * в печатных формах со временем окажутся разные наборы.
 */

export interface PalletLine {
    /** Ключ из PALLET_KINDS либо CUSTOM для своего размера. */
    kind: string;
    count: number;
    /** Размеры в сантиметрах. Для стандартных подставляются сами. */
    length?: number;
    width?: number;
}

export const PALLET_KINDS: { key: string; label: string; length?: number; width?: number }[] = [
    { key: 'EUR', label: 'Европаллет (120 × 80)', length: 120, width: 80 },
    { key: 'FIN', label: 'Финский (120 × 100)', length: 120, width: 100 },
    { key: 'AMERICAN', label: 'Американский (120 × 120)', length: 120, width: 120 },
    { key: 'HALF', label: 'Полупаллет (80 × 60)', length: 80, width: 60 },
    { key: 'CUSTOM', label: 'Нестандартный' },
];

export const LOADING_TYPES: { key: string; label: string }[] = [
    { key: 'REAR', label: 'Задняя' },
    { key: 'SIDE', label: 'Боковая' },
    { key: 'TOP', label: 'Верхняя' },
    { key: 'FULL', label: 'Полная растентовка' },
    { key: 'RAMP', label: 'С аппарелями' },
    { key: 'TAIL_LIFT', label: 'Гидроборт' },
];

export const PACKAGING_TYPES: { key: string; label: string }[] = [
    { key: 'PALLETS', label: 'Паллеты' },
    { key: 'BOXES', label: 'Коробки' },
    { key: 'BAGS', label: 'Мешки' },
    { key: 'BIG_BAGS', label: 'Биг-бэги' },
    { key: 'ROLLS', label: 'Рулоны' },
    { key: 'BARRELS', label: 'Бочки' },
    { key: 'BULK', label: 'Россыпью' },
    { key: 'OVERSIZED', label: 'Негабарит' },
];

export const palletLabel = (kind: string) =>
    PALLET_KINDS.find((k) => k.key === kind)?.label ?? kind;

export const loadingLabel = (key: string) =>
    LOADING_TYPES.find((t) => t.key === key)?.label ?? key;

export const packagingLabel = (key: string) =>
    PACKAGING_TYPES.find((t) => t.key === key)?.label ?? key;

/** Сумма мест — её ждут карточка рейса, кабинет водителя и печатные формы. */
export const totalPallets = (lines: PalletLine[]) =>
    lines.reduce((sum, line) => sum + (Number(line.count) || 0), 0);

/** Короткая расшифровка состава: «5 × Европаллет, 10 × Финский». */
export function palletsSummary(lines: PalletLine[]): string {
    return lines
        .filter((l) => l.count > 0)
        .map((l) => {
            const size = l.kind === 'CUSTOM' && l.length && l.width ? ` ${l.length}×${l.width}` : '';
            return `${l.count} × ${palletLabel(l.kind).replace(/\s*\(.*\)$/, '')}${size}`;
        })
        .join(', ');
}
