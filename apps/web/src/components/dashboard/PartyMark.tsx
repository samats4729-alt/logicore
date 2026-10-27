'use client';

/**
 * Значок контрагента в платёжном календаре: первая буква на цвете, который
 * закреплён за компанией (задачи шефа, I3: «20–30 компаний должны
 * различаться»). Цвет считается из названия, поэтому у «Магнума» он один и
 * тот же — на дашборде, на странице календаря и через месяц.
 *
 * Приход и расход по-прежнему говорят знак и цвет суммы (зелёный «+»,
 * красный «−»): цвет компании их не заменяет, а добавляется к ним.
 */
const LEGAL_FORMS = /^(тоо|ип|ао|оао|зао|ооо|чп|тд)\s+/i;

/** Название без формы собственности и кавычек: «ТОО «Магнум»» → «Магнум». */
function core(name: string): string {
    return name.replace(/[«»"'„“]/g, ' ').trim().replace(LEGAL_FORMS, '').trim() || name.trim();
}

/** Число из названия: одинаковое название — одинаковое число. */
function hashOf(name: string): number {
    let h = 2166136261;
    for (const ch of core(name).toLowerCase()) {
        h ^= ch.codePointAt(0) ?? 0;
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Цвет из названия: оттенок по кругу (золотой угол разводит соседние названия
 * далеко) и одна из трёх яркостей — чтобы при 20–30 компаниях два близких
 * оттенка всё же отличались светлотой.
 */
export function partyColor(name: string): string {
    const h = hashOf(name);
    const hue = Math.round((h * 137.508) % 360);
    const light = [36, 45, 54][(h >>> 9) % 3];
    const sat = [62, 52][(h >>> 13) % 2];
    return `hsl(${hue} ${sat}% ${light}%)`;
}

export default function PartyMark({ name, size = 18 }: { name?: string | null; size?: number }) {
    const label = name?.trim() || '';
    const letter = (core(label)[0] ?? '?').toUpperCase();
    return (
        <span
            aria-hidden
            title={label || undefined}
            className="inline-flex shrink-0 items-center justify-center rounded-[5px] font-semibold leading-none text-white"
            style={{
                width: size,
                height: size,
                fontSize: Math.round(size * 0.55),
                background: label ? partyColor(label) : 'var(--muted-foreground, #8c8c8c)',
            }}
        >
            {letter}
        </span>
    );
}
