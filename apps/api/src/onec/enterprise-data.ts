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

/** Договор LogiCore в 1С: с заказчиком — «с покупателем», с перевозчиком — «с поставщиком». */
export interface ContractKey {
    ref: string;
    kind: 'СПокупателем' | 'СПоставщиком';
    organization: OrganizationKey;
    counterparty: CounterpartyKey;
    currency: CurrencyKey;
    number: string;
    /** Дата договора, ГГГГ-ММ-ДД. */
    date?: string | null;
    /** До какого числа действует, ГГГГ-ММ-ДД. */
    validTo?: string | null;
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
    /** Договор — если компания отправляет договоры; нет — 1С возьмёт «Основной договор». */
    contract?: ContractKey | null;
    lines: SalesLine[];
}

/** Акт перевозчика (входящий) → «Поступление (акт, накладная)» с услугами. */
export interface PurchaseDocument extends SalesDocument {
    /** Номер и дата на бумаге перевозчика — 1С показывает их как «входящий документ». */
    incomingNumber?: string | null;
    incomingDate?: string | null;
}

export const organizationKey = (o: OrganizationKey) => n('Организация',
    t('Ссылка', o.ref), t('Наименование', o.name), t('ИНН', o.bin), t('ЮридическоеФизическоеЛицо', 'ЮридическоеЛицо'));

const counterpartyFields = (c: CounterpartyKey) =>
    t('Ссылка', c.ref) + t('Наименование', c.name) + t('НаименованиеПолное', c.name) + t('ИНН', c.bin)
    + t('ЮридическоеФизическоеЛицо', c.legal ? 'ЮридическоеЛицо' : 'ФизическоеЛицо');

/**
 * С версии формата 1.7 код и название валюты и единицы измерения лежат во
 * вложенном «ДанныеКлассификатора», до неё — прямо в элементе. Перепутать
 * нельзя: 1С проверяет объект по схеме и не принимает всё сообщение
 * (учебная БП на 1.10 отказала 24.10.2026). Казахстанская облачная — 1.6.
 */
export function usesClassifierData(version: string | null | undefined): boolean {
    const [major, minor] = (version ?? '').split('.').map(Number);
    if (!major) return true;
    return major > 1 || minor >= 7;
}

const classifier = (name: string, version: string | null | undefined, code: string, title: string) =>
    usesClassifierData(version)
        ? n(name, n('ДанныеКлассификатора', t('Код', code), t('Наименование', title)))
        : n(name, t('Код', code), t('Наименование', title));

/**
 * Услуга целиком — с типом «Услуга»: по одной ссылке в документе 1С завела
 * бы её товаром. Единица — «усл. ед» (ОКЕИ 876).
 */
export function serviceObject(s: ServiceKey, version?: string | null): string {
    return n('Справочник.Номенклатура',
        n('КлючевыеСвойства', t('Ссылка', s.ref), t('НаименованиеПолное', s.name), t('Наименование', s.name)),
        t('ТипНоменклатуры', 'Услуга'),
        classifier('ЕдиницаИзмерения', version, '876', 'усл. ед'));
}

const currencyOfVersion = (name: string, version: string | null | undefined, c: CurrencyKey) => classifier(name, version, c.code, c.name);

/** Ключевые свойства договора — и в самом договоре, и в ссылке на него из документа. */
const contractFields = (c: ContractKey, version: string | null | undefined) =>
    t('Ссылка', c.ref) + t('ВидДоговора', c.kind) + organizationKey(c.organization)
    + n('Контрагент', counterpartyFields(c.counterparty))
    + currencyOfVersion('ВалютаВзаиморасчетов', version, c.currency)
    + t('Наименование', `Договор № ${c.number}${c.date ? ` от ${c.date.split('-').reverse().join('.')}` : ''}`)
    + t('Дата', c.date) + t('Номер', c.number);

/** Договор целиком: 1С заведёт его у контрагента или узнает свой по ссылке. */
export function contractObject(c: ContractKey, version?: string | null): string {
    return n('Справочник.Договоры',
        n('КлючевыеСвойства', contractFields(c, version)),
        t('СрокДействия', c.validTo),
        t('Комментарий', 'Из LogiCore'));
}

/** Расчёты по документу: договор (если отправляем договоры) и валюта. */
const settlement = (d: SalesDocument, version: string | null | undefined) => n('ДанныеВзаиморасчетов',
    d.contract ? n('Договор', contractFields(d.contract, version)) : '',
    currencyOfVersion('ВалютаВзаиморасчетов', version, d.currency));

const serviceRows = (lines: SalesLine[], own: boolean) => lines.map((l, i) => n('Строка',
    t('НомерСтрокиДокумента', i + 1),
    n('Номенклатура', t('Ссылка', l.service.ref), t('НаименованиеПолное', l.service.name), t('Наименование', l.service.name)),
    t('Количество', l.quantity),
    t('Сумма', l.amount),
    t('Цена', l.price),
    t('СтавкаНДС', l.vatRate),
    t('СуммаНДС', l.vatAmount),
    t('Содержание', l.content),
    // «Собственные» — свои услуги в реализации; в поступлении такого поля нет.
    own ? t('ТипУслуги', 'Собственные') : '')).join('');

/** Акт выполненных работ LogiCore → «Реализация (акт, накладная)» с услугами. */
export function salesObject(d: SalesDocument, version?: string | null): string {
    return n('Документ.РеализацияТоваровУслуг',
        n('КлючевыеСвойства', t('Ссылка', d.ref), t('Дата', `${d.date}T12:00:00`), t('Номер', d.number), organizationKey(d.organization)),
        t('ВидОперации', 'РеализацияКлиенту'),
        currencyOfVersion('Валюта', version, d.currency),
        t('Сумма', d.amount),
        t('СуммаВключаетНДС', true),
        n('Контрагент', counterpartyFields(d.counterparty)),
        settlement(d, version),
        t('Комментарий', d.comment),
        n('Услуги', serviceRows(d.lines, true)));
}

/**
 * Акт перевозчика LogiCore → «Поступление (акт, накладная)» с услугами:
 * расход на перевозку. Порядок элементов другой, чем у реализации (услуги —
 * сразу за ключевыми свойствами, контрагент — внутри них): так в схеме
 * всех версий формата 1.6–1.10.
 */
export function purchaseObject(d: PurchaseDocument, version?: string | null): string {
    return n('Документ.ПоступлениеТоваровУслуг',
        n('КлючевыеСвойства',
            t('Ссылка', d.ref), t('Дата', `${d.date}T12:00:00`), t('Номер', d.number), organizationKey(d.organization),
            n('ДанныеВходящегоДокумента', t('НомерВходящегоДокумента', d.incomingNumber), t('ДатаВходящегоДокумента', d.incomingDate)),
            n('Контрагент', counterpartyFields(d.counterparty))),
        n('Услуги', serviceRows(d.lines, false)),
        currencyOfVersion('Валюта', version, d.currency),
        t('ВидОперации', 'ПокупкаУПоставщика'),
        t('Сумма', d.amount),
        t('СуммаВключаетНДС', true),
        settlement(d, version),
        t('Комментарий', d.comment));
}

/** Документ отменили в LogiCore после отправки — 1С его удаляет (помечает на удаление). */
export function salesDeletion(ref: string): string {
    return deletion('РеализацияТоваровУслугСсылка', ref);
}

export function purchaseDeletion(ref: string): string {
    return deletion('ПоступлениеТоваровУслугСсылка', ref);
}

const deletion = (refType: string, ref: string) =>
    n('УдалениеОбъекта', n('СсылкаНаОбъект', n('СсылкаНаОбъект', t(refType, ref))));

// ==================== перевод значений ====================

/**
 * Юрлицо или физлицо (ИП) — для 1С это разные виды контрагента. В LogiCore
 * отдельного признака нет, но он есть в самом номере: у казахстанского БИН
 * пятая цифра — вид юрлица (4, 5, 6), у ИИН на этом месте день рождения
 * (0–3). Российский ИНН из 12 цифр — тоже у физлица. И «ИП …» в названии.
 * 24.10.2026 перевозчик-ИП ушёл в учебную 1С юрлицом — отсюда правило.
 */
export function isLegalEntity(bin: string | null | undefined, name: string): boolean {
    if (/^(ИП|Индивидуальный предприниматель)(\s|$)/i.test(name.trim())) return false;
    const digits = (bin ?? '').replace(/\D/g, '');
    if (digits.length === 12 && '0123'.includes(digits[4])) return false;
    return true;
}

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
