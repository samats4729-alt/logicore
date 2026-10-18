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

/** Оттенок из названия: одинаковое название — одинаковый цвет, соседние названия — далёкие оттенки. */
export function partyHue(name: string): number {
    let h = 2166136261;
    for (const ch of core(name).toLowerCase()) {
        h ^= ch.codePointAt(0) ?? 0;
        h = Math.imul(h, 16777619);
    }
    // Золотой угол разводит оттенки по кругу ровнее, чем остаток от деления.
    return Math.round(((h >>> 0) * 137.508) % 360);
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
                background: label ? `hsl(${partyHue(label)} 58% 44%)` : 'var(--muted-foreground, #8c8c8c)',
            }}
        >
            {letter}
        </span>
    );
}
