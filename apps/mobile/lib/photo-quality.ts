/**
 * Годится ли снимок документа — проверка на телефоне, без сервера.
 *
 * Решение владельца (09.10.2026): накладную НЕ распознаём и с заявкой НЕ
 * сверяем — номер, вес, госномер никто не читает. Проверяется только
 * качество снимка: темно, блики, размыто, лист не целиком, буквы сливаются.
 * Цель одна — чтобы диспетчер не звонил водителю «переснимите, ничего не
 * видно», когда тот уже уехал от склада.
 *
 * На вход — уменьшенный снимок точками (RGBA). Модуль не знает ни про
 * камеру, ни про React Native: так его можно проверить на подготовленных
 * картинках прямо на компьютере.
 *
 * Оценка грубая и иногда ошибается — например, лист на белом столе
 * покажется обрезанным. Поэтому окончательное слово за водителем: он может
 * отправить снимок и после предупреждения (см. `DocumentCamera`).
 */

/** Что не так со снимком. Порядок — по важности: первое и называем. */
export type PhotoProblem = 'DARK' | 'GLARE' | 'BLUR' | 'CUT' | 'FADED';

/** Слова для водителя: что случилось и что сделать — без «ошибка качества». */
export const PROBLEM_TEXT: Record<PhotoProblem, { title: string; hint: string }> = {
    DARK: { title: 'Слишком темно', hint: 'Подойдите к свету или включите фонарик — буквы в тени не прочитать.' },
    GLARE: { title: 'На фото блики', hint: 'Наклоните телефон, чтобы свет лампы или солнца не отражался от документа.' },
    BLUR: { title: 'Фото размыто', hint: 'Держите телефон неподвижно и подождите секунду, пока камера наведёт резкость.' },
    CUT: { title: 'Документ обрезан', hint: 'Отойдите чуть дальше, чтобы в рамку попали все четыре края листа.' },
    FADED: { title: 'Текст плохо читается', hint: 'Снимите ближе и при ровном свете — сейчас буквы сливаются с бумагой.' },
};

/** Сторона кадра, к которой лист прижат вплотную. */
export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface PhotoMetrics {
    /** Средняя яркость, 0–255. */
    brightness: number;
    /** Самое светлое место листа (95-я сотая яркости), 0–255. */
    paper: number;
    /** Разброс яркости: чем меньше, тем сильнее буквы сливаются с фоном. */
    contrast: number;
    /**
     * Резкость: насколько круто перепад «бумага → буква» по сравнению с самим
     * перепадом. 1 — край в одну точку, к нулю — край размазан.
     */
    sharpness: number;
    /** Доля засвеченных точек, 0–1. */
    glare: number;
    /** Стороны, где лист уходит за край кадра. */
    cutSides: Side[];
}

export interface PhotoVerdict {
    ok: boolean;
    problems: PhotoProblem[];
    metrics: PhotoMetrics;
}

/**
 * Пороги. Подобраны на снимках шириной 900–1000 точек (так их уменьшает
 * `photo-check.ts`); на другом размере резкость считается иначе.
 */
export const LIMITS = {
    /** Средняя яркость ниже — темно. */
    darkMean: 60,
    /** Даже самое светлое место листа темнее — темно. */
    darkPaper: 115,
    /** Засвеченных точек больше этой доли — блики. */
    glareShare: 0.025,
    /** Яркость, с которой точка считается засвеченной. */
    glareLevel: 250,
    /** Резкость ниже — размыто (доля от полного перепада, см. `edgeSharpness`). */
    blurSharpness: 0.3,
    /** Разброс яркости ниже — буквы сливаются. */
    fadedContrast: 22,
    /** Доля светлой бумаги в крайней полосе, с которой лист «упирается» в край. */
    cutShare: 0.6,
} as const;

/** Яркость точки по-человечески: зелёный глаз видит лучше синего. */
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export function assessPhoto(rgba: ArrayLike<number>, width: number, height: number): PhotoVerdict {
    const n = width * height;
    const gray = new Float32Array(n);
    const histogram = new Uint32Array(256);
    let sum = 0;
    let sumSq = 0;
    let clipped = 0;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];
        const y = luma(r, g, b);
        gray[i] = y;
        histogram[Math.min(255, Math.round(y))]++;
        sum += y;
        sumSq += y * y;
        // Засветка — когда выбиты все три цвета: белая бумага на хорошем свету
        // до 255 не доходит, а отражение лампы — доходит.
        if (r >= LIMITS.glareLevel && g >= LIMITS.glareLevel && b >= LIMITS.glareLevel) clipped++;
    }
    const brightness = sum / n;
    const contrast = Math.sqrt(Math.max(0, sumSq / n - brightness * brightness));
    const paper = percentile(histogram, n, 0.95);
    const glare = clipped / n;

    // Полный перепад «буква — бумага»: от самых тёмных точек до самых светлых.
    // Резкость меряем в долях от него, иначе снимок в сумраке (перепады
    // меньше сами по себе) сошёл бы за размытый.
    const range = Math.max(30, percentile(histogram, n, 0.99) - percentile(histogram, n, 0.01));
    const sharpness = edgeSharpness(gray, width, height) / range;
    const cutSides = paper >= LIMITS.darkPaper ? sidesTouched(gray, width, height, paper) : [];

    const problems: PhotoProblem[] = [];
    const dark = brightness < LIMITS.darkMean || paper < LIMITS.darkPaper;
    if (dark) {
        // В темноте остальное не измерить честно: шум камеры похож и на
        // резкость, и на буквы. Говорим одно — про свет.
        problems.push('DARK');
    } else {
        if (glare > LIMITS.glareShare) problems.push('GLARE');
        if (sharpness < LIMITS.blurSharpness) problems.push('BLUR');
        if (cutSides.length) problems.push('CUT');
        if (contrast < LIMITS.fadedContrast && !problems.includes('GLARE')) problems.push('FADED');
    }

    return {
        ok: problems.length === 0,
        problems,
        metrics: { brightness, paper, contrast, sharpness, glare, cutSides },
    };
}

/** Яркость, темнее которой доля `share` всех точек. */
function percentile(histogram: Uint32Array, total: number, share: number): number {
    const target = total * share;
    let seen = 0;
    for (let v = 0; v < 256; v++) {
        seen += histogram[v];
        if (seen >= target) return v;
    }
    return 255;
}

/**
 * Резкость по краям букв.
 *
 * Считаем перепад яркости между соседними точками и берём средний из самых
 * сильных — верхнюю сотую часть. У чёткого снимка край буквы — скачок в
 * одну-две точки, у размытого тот же перепад растянут, и скачки мельчают.
 * Среднее по всему кадру не годится: пустая бумага тянет его к нулю у
 * любого снимка, и чёткая накладная с широкими полями сошла бы за размытую.
 */
function edgeSharpness(gray: Float32Array, width: number, height: number): number {
    const steps = new Uint32Array(256);
    let total = 0;
    for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
            const i = row + x;
            const gx = Math.abs(gray[i + 1] - gray[i - 1]);
            const gy = Math.abs(gray[i + width] - gray[i - width]);
            steps[Math.min(255, Math.round((gx + gy) / 2))]++;
            total++;
        }
    }
    if (!total) return 0;
    // Средний из верхней сотой части перепадов.
    const top = Math.max(1, Math.round(total * 0.01));
    let left = top;
    let acc = 0;
    for (let v = 255; v >= 0 && left > 0; v--) {
        const take = Math.min(left, steps[v]);
        acc += take * v;
        left -= take;
    }
    return acc / top;
}

/**
 * Стороны, где лист уходит за край кадра.
 *
 * Бумага — самое светлое в кадре. Если светлая бумага сплошь тянется по
 * крайней полосе кадра, значит лист продолжается дальше и его край не
 * снят. Фон вокруг листа (кабина, капот, руки) почти всегда темнее.
 */
function sidesTouched(gray: Float32Array, width: number, height: number, paper: number): Side[] {
    const level = paper * 0.82;
    const band = Math.max(2, Math.round(Math.min(width, height) * 0.02));
    const share = (x0: number, y0: number, x1: number, y1: number) => {
        let bright = 0;
        let all = 0;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                if (gray[y * width + x] >= level) bright++;
                all++;
            }
        }
        return all ? bright / all : 0;
    };
    const sides: Side[] = [];
    if (share(0, 0, width, band) > LIMITS.cutShare) sides.push('top');
    if (share(0, height - band, width, height) > LIMITS.cutShare) sides.push('bottom');
    if (share(0, 0, band, height) > LIMITS.cutShare) sides.push('left');
    if (share(width - band, 0, width, height) > LIMITS.cutShare) sides.push('right');
    return sides;
}
