import * as XLSX from 'xlsx';

/**
 * Оборотно-сальдовая ведомость по счёту из 1С (файл Excel) → долги
 * контрагентов на конец периода. Для «ввода начальных остатков»: компания
 * переносит в LogiCore, кто сколько должен на день начала работы.
 *
 * Прямой обмен этого не даёт: 1С считает остатки расчётов только при
 * полной выгрузке базы в файл, при синхронизации — нет (разобрано по
 * правилам обмена БП 24.10.2026). Поэтому — отчёт, который бухгалтер и так
 * умеет сформировать: «Отчёты» → «Оборотно-сальдовая ведомость по счёту».
 *
 * Раскладка у 1С в русской и казахской БП одна: слева счёт и контрагенты,
 * справа три пары «Дебет | Кредит» — сальдо на начало, обороты, сальдо на
 * конец. Столбцы ищем по словам «Дебет» и «Кредит» (они одинаковы и в
 * казахской 1С), а не по номерам: 1С кладёт текст в объединённые ячейки, и
 * номер столбца зависит от ширины колонок. Последняя пара — сальдо на конец.
 *
 * Счёт не важен: на счетах расчётов дебетовое сальдо — нам должны, кредитовое
 * — должны мы (аванс клиента на 1210/62, долг перевозчику на 3310/60).
 */

export interface TurnoverRow {
    /** Контрагент как он назван в 1С. */
    name: string;
    /** Сальдо на конец по дебету — контрагент должен нам. */
    debit: number;
    /** Сальдо на конец по кредиту — мы должны контрагенту. */
    credit: number;
}

export interface TurnoverSheet {
    /** Счёт из заголовка: «62», «1210». */
    account: string | null;
    /** Дата, на которую остатки, ГГГГ-ММ-ДД: конец периода отчёта. */
    periodEnd: string | null;
    rows: TurnoverRow[];
}

export class TurnoverSheetError extends Error {}

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Конец периода из заголовка 1С: «за 01.01.2026 - 30.09.2026», «за Октябрь 2026 г.», «за 3 квартал 2026 г.», «за 2026 г.». */
export function periodEndOf(title: string): string | null {
    const t = title.toLowerCase().replace(/\s+/g, ' ');
    const range = t.match(/(\d{2})\.(\d{2})\.(\d{4})\s*[-–—]\s*(\d{2})\.(\d{2})\.(\d{4})/);
    if (range) return iso(Number(range[6]), Number(range[5]), Number(range[4]));
    const month = t.match(/за ([а-яё]+) (\d{4})/);
    if (month) {
        // «март» проверяется раньше «ма» (май, мая): порядок в списке — по месяцам.
        const i = MONTHS.findIndex((m) => month[1].startsWith(m));
        if (i >= 0) {
            const y = Number(month[2]);
            return iso(y, i + 1, lastDay(y, i + 1));
        }
    }
    const quarter = t.match(/за (\d) квартал (\d{4})/);
    if (quarter) {
        const y = Number(quarter[2]);
        const m = Number(quarter[1]) * 3;
        return iso(y, m, lastDay(y, m));
    }
    const half = t.match(/за (\d) полугодие (\d{4})/);
    if (half) return iso(Number(half[2]), Number(half[1]) * 6, Number(half[1]) === 1 ? 30 : 31);
    const nine = t.match(/за 9 месяцев (\d{4})/);
    if (nine) return iso(Number(nine[1]), 9, 30);
    const year = t.match(/за (\d{4}) г/);
    if (year) return iso(Number(year[1]), 12, 31);
    return null;
}

/** Число из ячейки: 1С кладёт числом, но бывает и строкой «80 000,00». */
const amount = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return 0;
    const n = Number(v.replace(/[\s ]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Строки, которые не контрагенты: счета и субсчета («62», «62.01», «1210»),
 * итоги, договоры и документы расчётов, если отчёт развёрнут глубже.
 */
// В JS «\b» не видит границу слова у кириллицы — конец слова задаём сами.
const END = '(?![а-яёa-z0-9])';
const NOT_COUNTERPARTY = [
    /^\d{2,4}(\.\d{1,3})*$/,
    new RegExp(`^(итого|всего)${END}`, 'i'),
    new RegExp(`^(основной договор|договор${END}|без договора|№)`, 'i'),
    /^<.*>$/,
    new RegExp(`^(реализация|поступление|сч[её]т на оплату|сч[её]т-фактура|акт|списание|выдача|корректировка|возврат|приходный|расходный|платежное|ввод остатков|операция)${END}`, 'i'),
];

export function parseTurnoverSheet(file: Buffer): TurnoverSheet {
    let book: XLSX.WorkBook;
    try {
        book = XLSX.read(file, { type: 'buffer' });
    } catch {
        throw new TurnoverSheetError('Это не файл Excel. Сохраните ведомость в 1С кнопкой с дискетой → «Лист Microsoft Excel».');
    }
    const sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet) throw new TurnoverSheetError('В файле нет листа с таблицей.');
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });

    // Шапка: строка, где «Дебет» встречается чаще всего (три пары у ведомости).
    let headerRow = -1;
    let debitCols: number[] = [];
    let creditCols: number[] = [];
    grid.slice(0, 40).forEach((row, r) => {
        const debits: number[] = [];
        const credits: number[] = [];
        row.forEach((v, c) => {
            const s = cellText(v).toLowerCase();
            if (s === 'дебет' || s === 'дт') debits.push(c);
            if (s === 'кредит' || s === 'кт') credits.push(c);
        });
        if (debits.length && credits.length && debits.length > debitCols.length) {
            headerRow = r;
            debitCols = debits;
            creditCols = credits;
        }
    });
    if (headerRow < 0) {
        throw new TurnoverSheetError('Не узнали оборотно-сальдовую ведомость: в шапке нет столбцов «Дебет» и «Кредит».');
    }
    const debitCol = debitCols[debitCols.length - 1];
    const creditCol = creditCols[creditCols.length - 1];
    const firstAmountCol = Math.min(...debitCols, ...creditCols);

    const head = grid.slice(0, headerRow).map((row) => row.map(cellText).filter(Boolean).join(' ')).join(' ');
    const accountMatch = head.match(/по сч[её]ту (\d[\d.]*)/i);

    const totals = new Map<string, TurnoverRow>();
    for (const row of grid.slice(headerRow + 1)) {
        const name = row.slice(0, firstAmountCol).map(cellText).find(Boolean);
        if (!name || NOT_COUNTERPARTY.some((re) => re.test(name))) continue;
        const debit = amount(row[debitCol]);
        const credit = amount(row[creditCol]);
        if (!debit && !credit) continue;
        // Один контрагент бывает дважды — на субсчетах долгов и авансов (62.01 и 62.02).
        const prev = totals.get(name) ?? { name, debit: 0, credit: 0 };
        prev.debit = Math.round((prev.debit + debit) * 100) / 100;
        prev.credit = Math.round((prev.credit + credit) * 100) / 100;
        totals.set(name, prev);
    }
    return { account: accountMatch?.[1] ?? null, periodEnd: periodEndOf(head), rows: [...totals.values()] };
}

const LEGAL_FORMS = new Set(['тоо', 'ооо', 'ао', 'пао', 'зао', 'оао', 'ип', 'чп', 'кх', 'тов', 'llp', 'llc', 'ltd', 'too']);

/** Название без кавычек, формы собственности и регистра — чтобы сопоставить «ТОО "Ромашка"» и «ТОО «Ромашка»». */
export function normalizeCompanyName(name: string): string {
    return name
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/индивидуальный предприниматель/g, ' ')
        .replace(/[^a-zа-я0-9]+/g, ' ')
        .split(' ')
        .filter((w) => w && !LEGAL_FORMS.has(w))
        .join(' ');
}
