/**
 * Виды паллет и их размеры.
 *
 * Тот же список, что в интерфейсе (`apps/web/src/lib/cargo.ts`). Здесь он
 * нужен, чтобы при согласовании запроса собрать состав груза для заявки:
 * менеджер выбрал «европаллет», а в заявку должны уехать и размеры —
 * иначе печатные формы и кабинет водителя покажут вид без габаритов.
 *
 * Размеры в сантиметрах.
 */
export const PALLET_SIZES: Record<string, { length: number; width: number }> = {
    EUR: { length: 120, width: 80 },
    FIN: { length: 120, width: 100 },
    AMERICAN: { length: 120, width: 120 },
    HALF: { length: 80, width: 60 },
};

/**
 * Одна строка состава груза из запроса на расчёт.
 *
 * Пусто, если не названо ни вида, ни количества: пустая строка в составе
 * выглядит как забытый ввод и мешает больше, чем отсутствие состава.
 */
export function palletLinesFromQuote(
    kind: string | null | undefined,
    count: number | null | undefined,
): { kind: string; count: number; length?: number; width?: number }[] | undefined {
    if (!kind || !count || count <= 0) return undefined;
    const size = PALLET_SIZES[kind];
    return [{ kind, count, ...(size || {}) }];
}
