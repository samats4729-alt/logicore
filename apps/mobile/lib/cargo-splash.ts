/**
 * Заставка «Погрузка» (выбор владельца, 14.10.2026): знак LogiCore рисуется
 * контуром, как кузов, заливается, внутрь заезжает груз — и кузов закрыт.
 *
 * Здесь — общее для телефона (Skia) и браузера-предпросмотра (SVG): контур
 * знака и расписание анимации. Обе версии рисуют одно и то же по одним и тем
 * же числам, поэтому снимки из браузера совпадают с телефоном.
 */

/** Знак LogiCore — те же контуры, что в assets/logo.svg. */
export const LOGO_OUTER = 'M368 347H862L928 413V530L840 446H426V807H829V637H928V864A42 42 0 0 1 886 906H368A42 42 0 0 1 326 864V389A42 42 0 0 1 368 347Z';
export const LOGO_INNER = 'M508 532H772V631H605V722H508Z';
/** Рамка знака в его собственных единицах. */
export const LOGO_BOX = { x: 326, y: 347, w: 602, h: 559 };

export const INK = '#0b0d12';
export const ACCENT = '#1677ff';
export const SPEED_LINE = '#c9ced6';
/** Фон заставки — белый, как новый вид приложения; им же залита системная заставка (app.json). */
export const SPLASH_BG = '#ffffff';

/** Расписание, мс от начала. */
export const CARGO = {
    drawFrom: 100, drawTo: 1000,   // контур кузова рисуется
    fillFrom: 850, fillTo: 1250,   // и заливается
    slideFrom: 900, slideTo: 1600, // груз заезжает справа
    dotFrom: 1550, dotTo: 1900,    // синяя точка — «закрыто»
    total: 1900,
};

/** Насколько далеко справа стоит груз в начале — в единицах знака. */
const SLIDE_FROM = 1500;

const clamp = (v: number) => {
    'worklet';
    return Math.max(0, Math.min(1, v));
};
const seg = (t: number, a: number, b: number) => {
    'worklet';
    return clamp((t - a) / (b - a));
};
export const easeOut = (x: number) => {
    'worklet';
    return 1 - Math.pow(1 - x, 3);
};
const easeInOut = (x: number) => {
    'worklet';
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** Чуть перелетает и возвращается — груз «встаёт» на место с отдачей. */
const backOut = (x: number) => {
    'worklet';
    const c = 1.4;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

/** Состояние знака в момент t (мс). */
export function cargoFrame(t: number) {
    'worklet';
    const k = seg(t, CARGO.slideFrom, CARGO.slideTo);
    const lock = seg(t, CARGO.dotFrom, CARGO.dotTo);
    const fill = easeOut(seg(t, CARGO.fillFrom, CARGO.fillTo));
    return {
        /** Доля нарисованного контура, 0..1. */
        draw: easeInOut(seg(t, CARGO.drawFrom, CARGO.drawTo)),
        /** Прозрачность заливки кузова. */
        fill,
        /** Контур уходит, когда кузов залит: дальше знак — ровно как на картинке, без обводки. */
        stroke: 1 - fill,
        /** Сдвиг груза вправо, в единицах знака. */
        slide: (1 - backOut(k)) * SLIDE_FROM,
        /** Груз уже в кадре. */
        blockOn: k > 0 ? 1 : 0,
        /** Полосы скорости за грузом. */
        // гаснут, пока груз ещё снаружи: у кузова они легли бы поверх знака
        speed: k > 0 && k < 0.5 ? 1 - k / 0.5 : 0,
        /** Синяя точка: 0..1. */
        dot: easeOut(lock),
    };
}

/** Где знак на экране: центр и ширина → масштаб и сдвиг для его контуров. */
export function logoPlacement(cx: number, cy: number, width: number) {
    'worklet';
    const s = width / LOGO_BOX.w;
    return {
        s,
        height: LOGO_BOX.h * s,
        /** Левый верхний угол знака на экране. */
        x: cx - width / 2,
        y: cy - (LOGO_BOX.h * s) / 2,
    };
}
