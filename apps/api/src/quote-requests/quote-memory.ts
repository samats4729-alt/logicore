/**
 * Память по запросам: что мы уже предлагали этому клиенту на этом маршруте.
 *
 * Зачем это существует. Клиент спрашивает цену, менеджер ищет машину,
 * называет сумму — клиент отказывается. Через два дня тот же клиент
 * спрашивает тот же маршрут. Менеджер уже не помнит ни что предлагал, ни
 * почём нашёл машину, и называет ту же сумму, на которую только что
 * отказали.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И НЕ ДОЛЖНО БЫТЬ: расчёта новой цены.
 *
 * Сначала здесь было правило «после отказа предлагай на пять процентов
 * ниже». Владелец его отменил, и по делу. Во-первых, отказ бывает не из-за
 * цены: клиент мог найти машину раньше, отменить отгрузку, передумать
 * везти. Во-вторых, скидка от прошлой цены ничего не знает о том, почём
 * машина найдена сегодня, — а значит может увести сделку в убыток.
 *
 * Поэтому здесь только факты: что предлагали, почём нашли машину, чем
 * кончилось, по какой причине, и что изменилось в новых условиях. Цену
 * называет менеджер — он один видит и рынок, и сегодняшнюю закупку.
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
    /** Сколько паллет: половина запросов приходит именно в них. */
    palletCount?: number | null;
    cargoType: string | null;
    status: 'NEW' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';
    rejectionReason: string | null;
    /** Чей это был запрос. Нужно в списке по направлению: там клиенты разные. */
    customerName?: string | null;
}

/** Условия нового запроса — с чем сравниваем. */
export interface CurrentQuote {
    cargoWeight?: number | null;
    cargoVolume?: number | null;
    cargoType?: string | null;
}

/** Вилка цен: от и до, и по скольким случаям она собрана. */
export interface PriceRange {
    customerFrom: number;
    customerTo: number;
    carrierFrom: number | null;
    carrierTo: number | null;
    count: number;
}

export interface QuoteMemory {
    /** Последний завершённый случай по этому клиенту и маршруту. */
    last: PastQuote | null;
    /** Совпадают ли условия с прошлым разом (вес, объём, кузов). */
    sameConditions: boolean;
    /** Чем именно разошлись — человеческими словами. */
    differences: string[];
    /**
     * Одна строка о прошлом исходе. Сообщает факт и, если условия
     * разошлись, предупреждает об этом. Суммы не назначает.
     */
    note: string | null;
}

/**
 * Что уже возили по этому направлению — по всем клиентам одним списком.
 *
 * Раньше история отбиралась по паре «карточка клиента + маршрут», и это
 * было главной жалобой: у «Шымкент пиво» по маршруту запрос был, менеджер
 * выбрал «Шымкентский пивзавод» — и увидел пусто, хотя направление то же.
 * Теперь список один на направление, а чей был запрос, написано в строке.
 *
 * И не один случай, а несколько: у соседних запросов другой тоннаж и
 * другая цена, по одному выбирать не из чего.
 */
export interface DirectionMemory {
    count: number;
    range: PriceRange | null;
    items: PastQuote[];
}

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

/** Сколько прошлых случаев показываем. Больше — уже не подсказка, а отчёт. */
const ITEMS_LIMIT = 5;

/** Названная цена — уже факт, даже если клиент ещё не ответил. */
function priced(past: PastQuote[]): PastQuote[] {
    return past
        .filter((p) => p.customerPrice != null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function priceRange(list: PastQuote[]): PriceRange | null {
    if (list.length === 0) return null;
    const customerPrices = list.map((p) => p.customerPrice as number);
    const carrierCosts = list.map((p) => p.carrierCost).filter((c): c is number => c != null);
    return {
        customerFrom: Math.min(...customerPrices),
        customerTo: Math.max(...customerPrices),
        carrierFrom: carrierCosts.length ? Math.min(...carrierCosts) : null,
        carrierTo: carrierCosts.length ? Math.max(...carrierCosts) : null,
        count: list.length,
    };
}

/** Список случаев по направлению и вилка цен по ним. */
export function buildDirectionMemory(past: PastQuote[], limit = ITEMS_LIMIT): DirectionMemory {
    const list = priced(past);
    return { count: list.length, range: priceRange(list), items: list.slice(0, limit) };
}

export function buildQuoteMemory(
    past: PastQuote[],
    current: CurrentQuote,
    now: Date = new Date(),
): QuoteMemory {
    // Вывод об исходе делаем только по завершённым: пока клиент не ответил,
    // «прошло» или «не прошло» сказать не о чем.
    const decided = priced(past).filter((p) => p.status === 'APPROVED' || p.status === 'REJECTED');

    if (decided.length === 0) {
        return { last: null, sameConditions: false, differences: [], note: null };
    }

    const last = decided[0];

    // Незаполненное поле — это «ещё не ввели», а не «изменилось».
    //
    // Менеджер открывает форму и первым делом выбирает клиента и маршрут:
    // вес и кузов он допечатывает после. Если считать пустоту отличием,
    // панель в этот момент кричит «условия изменились: вес был 20 т, стал
    // не указан» — и приучает себя не читать, ровно когда она нужнее всего.
    // Про то, чего мы не знаем, честно молчать.
    const differences: string[] = [];
    if (current.cargoWeight != null && !sameNumber(last.cargoWeight, current.cargoWeight)) {
        differences.push(formatDiff('вес', last.cargoWeight, current.cargoWeight, (v) => `${v / 1000} т`));
    }
    if (current.cargoVolume != null && !sameNumber(last.cargoVolume, current.cargoVolume)) {
        differences.push(formatDiff('объём', last.cargoVolume, current.cargoVolume, (v) => `${v} м³`));
    }
    if (current.cargoType && (last.cargoType || null) !== current.cargoType) {
        differences.push(`кузов: было ${last.cargoType || 'не указан'}, стало ${current.cargoType}`);
    }
    const sameConditions = differences.length === 0;

    return { last, sameConditions, differences, note: buildNote(last, sameConditions, differences) };
}

/**
 * Строка о прошлом исходе.
 *
 * Утверждает только то, что произошло. «Не была принята» — факт. Вывод из
 * него («значит, надо дешевле») человек делает сам: он знает и причину
 * отказа, и сегодняшнюю закупку, а мы — нет.
 */
function buildNote(last: PastQuote, sameConditions: boolean, differences: string[]): string {
    const price = fmt(last.customerPrice as number);
    const tail = sameConditions
        ? ' Условия те же.'
        : ` Условия изменились: ${differences.join('; ')}.`;

    if (last.status === 'APPROVED') {
        return sameConditions
            ? `Цена ${price} ₸ уже проходила при тех же условиях.`
            : `Цена ${price} ₸ проходила, но условия изменились: ${differences.join('; ')}.`;
    }

    const reason = last.rejectionReason?.trim()
        ? ` Причина: ${last.rejectionReason.trim()}.`
        : ' Причина не указана.';
    return `Цена ${price} ₸ не была принята.${reason}${tail}`;
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
