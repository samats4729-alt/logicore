/**
 * Память по запросам: что мы уже предлагали этому клиенту на этом маршруте.
 *
 * Зачем это существует. Клиент спрашивает цену, менеджер ищет машину,
 * называет сумму — клиент отказывается. Через два дня тот же клиент
 * спрашивает тот же маршрут. Менеджер уже не помнит ни что предлагал, ни
 * почём нашёл машину, и называет ту же сумму, на которую только что
 * отказали. Второй отказ гарантирован.
 *
 * Здесь считается всё, что нужно сказать менеджеру в этот момент: чем
 * закончился прошлый раз, изменились ли условия, и какую цену имеет смысл
 * называть теперь.
 *
 * Правила намеренно арифметические, без «умных» моделей: менеджер должен
 * понимать, откуда взялась цифра, и иметь возможность с ней поспорить.
 */

/** Один прошлый запрос — ровно те поля, от которых зависит вывод. */
export interface PastQuote {
    id: string;
    requestNumber: string;
    createdAt: Date;
    /** Что предложили клиенту. Без цены случай в расчёт не идёт. */
    customerPrice: number | null;
    /** Почём нашли машину. То, что забывают первым. */
    carrierCost: number | null;
    cargoWeight: number | null;
    cargoVolume: number | null;
    cargoType: string | null;
    status: 'NEW' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';
    rejectionReason: string | null;
}

/** Условия нового запроса — с чем сравниваем. */
export interface CurrentQuote {
    cargoWeight?: number | null;
    cargoVolume?: number | null;
    cargoType?: string | null;
}

export interface QuoteMemory {
    /** Последний завершённый случай по этому клиенту и маршруту. */
    last: PastQuote | null;
    /** Совпадают ли условия с прошлым разом (вес, объём, кузов). */
    sameConditions: boolean;
    /** Чем именно разошлись — человеческими словами. */
    differences: string[];
    /** Рекомендуемая цена клиенту, ₸. Пусто — если рекомендовать нечего. */
    recommendedPrice: number | null;
    /** Почему именно столько. Показывается менеджеру дословно. */
    advice: string | null;
    /** Вилка по маршруту у этого клиента: от и до. */
    range: {
        customerFrom: number;
        customerTo: number;
        carrierFrom: number | null;
        carrierTo: number | null;
        count: number;
    } | null;
}

/** Насколько опускаем цену после отказа. */
const DISCOUNT_AFTER_REJECT = 0.95;
/** До какой круглой суммы округляем рекомендацию вниз. */
const ROUND_TO = 1000;

/**
 * Считается ли условие тем же. Пять процентов — это про то, что «20 тонн»
 * и «20,5 тонн» для цены одно и то же, а «20» и «5» — разное.
 */
const TOLERANCE = 0.05;

function sameNumber(a: number | null | undefined, b: number | null | undefined): boolean {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    if (a === 0 && b === 0) return true;
    const base = Math.max(Math.abs(a), Math.abs(b));
    return Math.abs(a - b) / base <= TOLERANCE;
}

function roundDown(value: number): number {
    return Math.max(0, Math.floor(value / ROUND_TO) * ROUND_TO);
}

/** Сколько полных суток прошло. */
function daysAgo(from: Date, now: Date): number {
    return Math.max(0, Math.floor((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

/** «сегодня» / «вчера» / «5 дней назад» — как сказал бы человек. */
export function humanAgo(from: Date, now: Date = new Date()): string {
    const days = daysAgo(from, now);
    if (days === 0) return 'сегодня';
    if (days === 1) return 'вчера';
    const tail = days % 100 >= 11 && days % 100 <= 14
        ? 'дней'
        : days % 10 === 1
            ? 'день'
            : days % 10 >= 2 && days % 10 <= 4
                ? 'дня'
                : 'дней';
    return `${days} ${tail} назад`;
}

export function buildQuoteMemory(
    past: PastQuote[],
    current: CurrentQuote,
    now: Date = new Date(),
): QuoteMemory {
    // В расчёт идут только случаи с названной ценой и известным исходом.
    // Незакрытый запрос ничему не учит: клиент по нему ещё не ответил.
    const decided = past
        .filter((p) => p.customerPrice != null && (p.status === 'APPROVED' || p.status === 'REJECTED'))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (decided.length === 0) {
        return { last: null, sameConditions: false, differences: [], recommendedPrice: null, advice: null, range: null };
    }

    const last = decided[0];

    const differences: string[] = [];
    if (!sameNumber(last.cargoWeight, current.cargoWeight)) {
        differences.push(formatDiff('вес', last.cargoWeight, current.cargoWeight, (v) => `${v / 1000} т`));
    }
    if (!sameNumber(last.cargoVolume, current.cargoVolume)) {
        differences.push(formatDiff('объём', last.cargoVolume, current.cargoVolume, (v) => `${v} м³`));
    }
    if ((last.cargoType || null) !== (current.cargoType || null)) {
        differences.push(`кузов: было ${last.cargoType || 'не указан'}, стало ${current.cargoType || 'не указан'}`);
    }
    const sameConditions = differences.length === 0;

    const customerPrices = decided.map((p) => p.customerPrice as number);
    const carrierCosts = decided.map((p) => p.carrierCost).filter((c): c is number => c != null);
    const range = {
        customerFrom: Math.min(...customerPrices),
        customerTo: Math.max(...customerPrices),
        carrierFrom: carrierCosts.length ? Math.min(...carrierCosts) : null,
        carrierTo: carrierCosts.length ? Math.max(...carrierCosts) : null,
        count: decided.length,
    };

    const rejected = decided.filter((p) => p.status === 'REJECTED');
    const approved = decided.filter((p) => p.status === 'APPROVED');
    const minRejected = rejected.length ? Math.min(...rejected.map((p) => p.customerPrice as number)) : null;
    const maxApproved = approved.length ? Math.max(...approved.map((p) => p.customerPrice as number)) : null;

    let recommendedPrice: number | null = null;
    let advice: string | null = null;

    if (minRejected != null) {
        // Всё, что было не ниже отказной цены, клиент уже не принял.
        recommendedPrice = roundDown(minRejected * DISCOUNT_AFTER_REJECT);

        // Но опускаться ниже того, что клиент уже принимал, незачем:
        // ту цену он платил, значит она проходит.
        if (maxApproved != null && maxApproved < minRejected && maxApproved > recommendedPrice) {
            recommendedPrice = maxApproved;
            advice = `На эту цену уже отказывали (${fmt(minRejected)} ₸), а ${fmt(maxApproved)} ₸ клиент принимал. Предложите ${fmt(recommendedPrice)} ₸.`;
        } else {
            advice = `${fmt(minRejected)} ₸ клиент не принял. Предложите ниже — например, ${fmt(recommendedPrice)} ₸.`;
        }

        if (!sameConditions) {
            advice += ` Но условия изменились (${differences.join('; ')}) — цену пересчитайте, а не копируйте.`;
        }
    } else if (maxApproved != null) {
        recommendedPrice = maxApproved;
        advice = sameConditions
            ? `${fmt(maxApproved)} ₸ клиент принимал, и условия те же. Можно предлагать столько же.`
            : `${fmt(maxApproved)} ₸ клиент принимал, но условия изменились (${differences.join('; ')}) — пересчитайте.`;
    }

    return { last, sameConditions, differences, recommendedPrice, advice, range };
}

function formatDiff(
    name: string,
    was: number | null | undefined,
    now: number | null | undefined,
    format: (v: number) => string,
): string {
    const left = was == null ? 'не указан' : format(was);
    const right = now == null ? 'не указан' : format(now);
    return `${name}: было ${left}, стало ${right}`;
}

function fmt(value: number): string {
    return Math.round(value).toLocaleString('ru-RU');
}
