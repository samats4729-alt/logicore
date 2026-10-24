import { escapeXml } from './xdto';

/**
 * Объекты формата EnterpriseData, которые LogiCore отправляет в 1С.
 *
 * Порядок элементов — строго как в схеме формата (пакеты XDTO
 * EnterpriseData 1.6 и 1.10 из БП 3.0): типы там «sequenced», и 1С
 * сверяет объект со схемой перед загрузкой. Необязательное, чего у нас нет,
 * не пишем вовсе — пустой элемент для 1С не то же самое, что отсутствующий.
 */

/** Элемент с текстом; пустое значение — элемента нет. */
const t = (name: string, value: string | number | boolean | null | undefined) =>
    value === null || value === undefined || value === '' ? '' : `<${name}>${escapeXml(String(value))}</${name}>`;
/** Элемент с вложенными элементами; пустой — элемента нет. */
const n = (name: string, ...inner: string[]) => {
    const body = inner.join('');
    return body ? `<${name}>${body}</${name}>` : '';
};

export interface OrganizationKey {
    ref: string;
    name: string;
    bin?: string | null;
}

export interface CounterpartyKey {
    ref: string;
    name: string;
    bin?: string | null;
    /** Юрлицо или физлицо (ИП в 1С — физлицо). */
    legal: boolean;
}

export interface CurrencyKey {
    /** Цифровой код ОКВ: 398 — тенге, 643 — рубль. */
    code: string;
    name: string;
}

export interface ServiceKey {
    ref: string;
    name: string;
}

export interface SalesLine {
    service: ServiceKey;
    quantity: string;
    /** Цена и сумма — с НДС: документ уходит с «Сумма включает НДС». */
    price: string;
    amount: string;
    /** «НДС12», «НДС16», «НДС0», «БезНДС» — значение перечисления СтавкиНДС. */
    vatRate: string;
    vatAmount: string;
    content?: string | null;
}

export interface SalesDocument {
    ref: string;
    /** Дата документа 1С; время ставим полдень — граница суток в другом поясе не сдвинет день. */
    date: string;
    /** Номер для 1С — не длиннее 11 знаков, иначе 1С документ не примет. */
    number: string;
    organization: OrganizationKey;
    counterparty: CounterpartyKey;
    currency: CurrencyKey;
    amount: string;
    comment?: string | null;
    lines: SalesLine[];
}

export const organizationKey = (o: OrganizationKey) => n('Организация',
    t('Ссылка', o.ref), t('Наименование', o.name), t('ИНН', o.bin), t('ЮридическоеФизическоеЛицо', 'ЮридическоеЛицо'));

const counterpartyFields = (c: CounterpartyKey) =>
    t('Ссылка', c.ref) + t('Наименование', c.name) + t('НаименованиеПолное', c.name) + t('ИНН', c.bin)
    + t('ЮридическоеФизическоеЛицо', c.legal ? 'ЮридическоеЛицо' : 'ФизическоеЛицо');

const currencyKey = (name: string, c: CurrencyKey) => n(name, t('Код', c.code), t('Наименование', c.name));

/**
 * Услуга целиком — с типом «Услуга»: по одной ссылке в документе 1С завела
 * бы её товаром. Единица — «усл. ед» (ОКЕИ 876).
 */
export function serviceObject(s: ServiceKey): string {
    return n('Справочник.Номенклатура',
        n('КлючевыеСвойства', t('Ссылка', s.ref), t('НаименованиеПолное', s.name), t('Наименование', s.name)),
        t('ТипНоменклатуры', 'Услуга'),
        n('ЕдиницаИзмерения', n('ДанныеКлассификатора', t('Код', '876'), t('Наименование', 'усл. ед'))));
}

/** Акт выполненных работ LogiCore → «Реализация (акт, накладная)» с услугами. */
export function salesObject(d: SalesDocument): string {
    const lines = d.lines.map((l, i) => n('Строка',
        t('НомерСтрокиДокумента', i + 1),
        n('Номенклатура', t('Ссылка', l.service.ref), t('НаименованиеПолное', l.service.name), t('Наименование', l.service.name)),
        t('Количество', l.quantity),
        t('Сумма', l.amount),
        t('Цена', l.price),
        t('СтавкаНДС', l.vatRate),
        t('СуммаНДС', l.vatAmount),
        t('Содержание', l.content),
        t('ТипУслуги', 'Собственные'))).join('');
    return n('Документ.РеализацияТоваровУслуг',
        n('КлючевыеСвойства', t('Ссылка', d.ref), t('Дата', `${d.date}T12:00:00`), t('Номер', d.number), organizationKey(d.organization)),
        t('ВидОперации', 'РеализацияКлиенту'),
        currencyKey('Валюта', d.currency),
        t('Сумма', d.amount),
        t('СуммаВключаетНДС', true),
        n('Контрагент', counterpartyFields(d.counterparty)),
        n('ДанныеВзаиморасчетов', currencyKey('ВалютаВзаиморасчетов', d.currency)),
        t('Комментарий', d.comment),
        n('Услуги', lines));
}

/** Документ отменили в LogiCore после отправки — 1С его удаляет (помечает на удаление). */
export function salesDeletion(ref: string): string {
    return n('УдалениеОбъекта', n('СсылкаНаОбъект', n('СсылкаНаОбъект', t('РеализацияТоваровУслугСсылка', ref))));
}

// ==================== перевод значений ====================

/** Цифровой код валюты по буквенному. Нет в списке — документ в 1С не уйдёт, скажем об этом в журнале. */
const CURRENCY_CODES: Record<string, string> = {
    KZT: '398', RUB: '643', USD: '840', EUR: '978', CNY: '156', KGS: '417', UZS: '860', BYN: '933', TRY: '949', GBP: '826',
};

/** Буквенный код валюты по цифровому — для того, что пришло из 1С. */
export function currencyLetter(code: string | null): string | null {
    if (!code) return null;
    const digits = code.trim().padStart(3, '0');
    return Object.entries(CURRENCY_CODES).find(([, c]) => c === digits)?.[0] ?? null;
}

export function currencyOf(letter: string): CurrencyKey | null {
    const code = CURRENCY_CODES[letter.toUpperCase()];
    return code ? { code, name: letter.toUpperCase() } : null;
}

/**
 * Ставка НДС строки LogiCore → значение перечисления СтавкиНДС формата.
 * Обычная ставка — «НДС» и число: «НДС12», «НДС16», «НДС20».
 */
export function vatRateOf(treatment: string, rate: number): string {
    if (treatment === 'ZERO') return 'НДС0';
    if (treatment !== 'STANDARD' || !rate) return 'БезНДС';
    return `НДС${Number.isInteger(rate) ? rate : String(rate).replace('.', '_')}`;
}

/**
 * Номер для 1С. В «Бухгалтерии» номер реализации — 11 знаков, длиннее 1С
 * не примет весь документ. Из «АКТ-2026-000123» получается «LC26-000123»:
 * префикс LogiCore, год, порядковый номер. Полный номер LogiCore идёт в
 * комментарий документа.
 */
export function shortNumber(number: string): string {
    const groups = number.match(/\d+/g) ?? [];
    const year = groups.find((g) => g.length === 4 && /^(19|20)\d\d$/.test(g));
    const seq = groups.length ? groups[groups.length - 1] : '';
    if (seq && seq !== year) {
        const tail = seq.slice(-6).padStart(6, '0');
        return year ? `LC${year.slice(2)}-${tail}` : `LC-${tail.padStart(8, '0')}`;
    }
    return `LC${number.replace(/[^0-9A-Za-z]/g, '').slice(-9)}`;
}
