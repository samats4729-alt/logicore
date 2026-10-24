import * as XLSX from 'xlsx';
import { TurnoverSheetError, normalizeCompanyName, parseTurnoverSheet, periodEndOf } from './turnover-sheet-1c';

/** Лист в раскладке 1С: шапка в объединённых ячейках, контрагенты со сдвигом вправо, договоры ниже. */
function book(rows: unknown[][]): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'TDSheet');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const HEADER = [
    ['Счет', null, null, 'Сальдо на начало периода', null, 'Обороты за период', null, 'Сальдо на конец периода', null],
    ['Контрагенты', null, null, 'Дебет', 'Кредит', 'Дебет', 'Кредит', 'Дебет', 'Кредит'],
];

describe('Оборотно-сальдовая ведомость из 1С → долги на конец периода', () => {
    it('покупатели (62): долг — дебет конца, аванс — кредит; субсчета складываются; счета, договоры и итоги — не контрагенты', () => {
        const r = parseTurnoverSheet(book([
            ['ТОО «ЛогиКор Экспедиция»'],
            ['Оборотно-сальдовая ведомость по счету 62 за Октябрь 2026 г.'],
            ['Выводимые данные: БУ (данные бухгалтерского учета)'],
            ...HEADER,
            ['62', null, null, null, null, 230000, 150000, 80000, null],
            ['62.01', null, null, null, null, 230000, 150000, 80000, null],
            [null, 'ООО "Ромашка Тест"', null, null, null, 230000, 150000, 80000, null],
            [null, null, 'Основной договор', null, null, 230000, 150000, 80000, null],
            ['62.02', null, null, null, null, null, 5000, null, 5000],
            [null, 'ООО "Ромашка Тест"', null, null, null, null, 5000, null, 5000],
            [null, 'ИП Ахметов Б.С.', null, null, null, '12 500,00', null, '12 500,00', null],
            [null, 'ТОО «Закрыто»', null, 1000, null, null, 1000, null, null],
            ['Итого', null, null, null, null, 242500, 155000, 92500, 5000],
        ]));
        expect(r.account).toBe('62');
        expect(r.periodEnd).toBe('2026-10-31');
        expect(r.rows).toEqual([
            { name: 'ООО "Ромашка Тест"', debit: 80000, credit: 5000 },
            { name: 'ИП Ахметов Б.С.', debit: 12500, credit: 0 },
        ]);
    });

    it('перевозчики (3310, казахстанская БП): долг перед ним — кредит конца; период датами', () => {
        const r = parseTurnoverSheet(book([
            ['ТОО «Тестовая логистическая компания»'],
            ['Оборотно-сальдовая ведомость по счету 3310 за 01.01.2026 - 30.09.2026'],
            ...HEADER,
            ['3310', null, null, null, 300000, 200000, 450000, null, 550000],
            [null, 'ИП Сериков', null, null, 300000, 200000, 450000, null, 550000],
        ]));
        expect(r).toEqual({ account: '3310', periodEnd: '2026-09-30', rows: [{ name: 'ИП Сериков', debit: 0, credit: 550000 }] });
    });

    it('не Excel или не ведомость — понятная ошибка, а не пустой список', () => {
        expect(() => parseTurnoverSheet(Buffer.from('просто текст'))).toThrow(TurnoverSheetError);
        expect(() => parseTurnoverSheet(book([['Список контрагентов'], ['Ромашка', '150840001234']])))
            .toThrow('в шапке нет столбцов «Дебет» и «Кредит»');
    });

    it('конец периода из заголовка 1С', () => {
        expect(periodEndOf('за Май 2026 г.')).toBe('2026-05-31');
        expect(periodEndOf('за Март 2026 г.')).toBe('2026-03-31');
        expect(periodEndOf('за Февраль 2028 г.')).toBe('2028-02-29');
        expect(periodEndOf('за 3 квартал 2026 г.')).toBe('2026-09-30');
        expect(periodEndOf('за 1 полугодие 2026 г.')).toBe('2026-06-30');
        expect(periodEndOf('за 9 месяцев 2026 г.')).toBe('2026-09-30');
        expect(periodEndOf('за 2026 г.')).toBe('2026-12-31');
        expect(periodEndOf('Оборотно-сальдовая ведомость по счету 62')).toBeNull();
    });

    it('название для сопоставления: без кавычек, формы собственности и регистра', () => {
        expect(normalizeCompanyName('ТОО «Ромашка»')).toBe('ромашка');
        expect(normalizeCompanyName('ТОО "Ромашка"')).toBe('ромашка');
        expect(normalizeCompanyName('Индивидуальный предприниматель Ахметов Б.С.')).toBe('ахметов б с');
        expect(normalizeCompanyName('ИП Ахметов Б.С.')).toBe('ахметов б с');
        expect(normalizeCompanyName('ТОО «Алёна-Транс»')).toBe('алена транс');
    });
});
