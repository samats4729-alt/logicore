/**
 * Значения 1С в XML — так, как их пишет и читает СериализаторXDTO.
 *
 * 1С передаёт в веб-сервисах обмена не плоские поля, а свои значения:
 * Структуру, Массив, УникальныйИдентификатор. В XML это элементы
 * пространства имён http://v8.1c.ru/8.1/data/core:
 *
 *   <Property name="Ключ"><Value xsi:type="xs:string">Значение</Value></Property>
 *
 * Здесь — перевод между ними и обычными значениями TypeScript:
 *   Структура → объект, Массив → массив, Неопределено → null,
 *   УникальныйИдентификатор → V8Uuid, ДвоичныеДанные → Buffer, прочее (перечисления 1С,
 *   хранилища значений) — V8Raw: текст и тип, как пришли.
 */

export const NS_V8 = 'http://v8.1c.ru/8.1/data/core';
export const NS_XS = 'http://www.w3.org/2001/XMLSchema';
export const NS_XSI = 'http://www.w3.org/2001/XMLSchema-instance';

/** УникальныйИдентификатор 1С. */
export class V8Uuid {
    constructor(readonly value: string) {}
}

/** Значение незнакомого типа (перечисление 1С, ХранилищеЗначения): тип и текст как есть. */
export class V8Raw {
    constructor(readonly type: string, readonly text: string) {}
}

export type V8Value =
    | null
    | string
    | number
    | boolean
    | Date
    | V8Uuid
    | V8Raw
    | Buffer
    | V8Value[]
    | { [key: string]: V8Value };

export const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Дата 1С: без часового пояса, как «2026-10-23T10:00:00». */
const v8Date = (d: Date) => d.toISOString().slice(0, 19);

/**
 * Содержимое элемента со значением: атрибуты (тип) и внутренность.
 * Префиксы: v8 — ядро 1С, xs — схема, xsi — экземпляр схемы. Объявлять их
 * должен внешний элемент (см. V8_NS_DECL).
 */
function valueParts(value: V8Value): { attrs: string; inner: string } {
    if (value === null || value === undefined) return { attrs: ' xsi:nil="true"', inner: '' };
    if (typeof value === 'string') return { attrs: ' xsi:type="xs:string"', inner: escapeXml(value) };
    if (typeof value === 'boolean') return { attrs: ' xsi:type="xs:boolean"', inner: value ? 'true' : 'false' };
    if (typeof value === 'number') return { attrs: ' xsi:type="xs:decimal"', inner: String(value) };
    if (value instanceof Date) return { attrs: ' xsi:type="xs:dateTime"', inner: v8Date(value) };
    if (value instanceof V8Uuid) return { attrs: ' xsi:type="v8:UUID"', inner: escapeXml(value.value) };
    if (value instanceof V8Raw) return { attrs: ` xsi:type="${escapeXml(value.type)}"`, inner: escapeXml(value.text) };
    if (Buffer.isBuffer(value)) return { attrs: ' xsi:type="xs:base64Binary"', inner: value.toString('base64') };
    if (Array.isArray(value)) return { attrs: ' xsi:type="v8:Array"', inner: arrayContent(value) };
    return { attrs: ' xsi:type="v8:Structure"', inner: structureContent(value) };
}

/** Внутренность Структуры: Property на каждый ключ. */
export function structureContent(obj: { [key: string]: V8Value }): string {
    return Object.entries(obj)
        .map(([key, val]) => {
            const { attrs, inner } = valueParts(val);
            return `<v8:Property name="${escapeXml(key)}"><v8:Value${attrs}>${inner}</v8:Value></v8:Property>`;
        })
        .join('');
}

/** Внутренность Массива: Value на каждый элемент. */
export function arrayContent(items: V8Value[]): string {
    return items
        .map((item) => {
            const { attrs, inner } = valueParts(item);
            return `<v8:Value${attrs}>${inner}</v8:Value>`;
        })
        .join('');
}

/** Объявления префиксов для элемента, внутри которого лежат значения 1С. */
export const V8_NS_DECL = `xmlns:v8="${NS_V8}" xmlns:xs="${NS_XS}" xmlns:xsi="${NS_XSI}"`;

// ==================== чтение ====================

/**
 * Узел разобранного XML в форме fast-xml-parser с preserveOrder: массив
 * элементов, у каждого — имя без префикса, атрибуты без префиксов и дети.
 */
export interface XmlNode {
    name: string;
    attrs: Record<string, string>;
    children: XmlNode[];
    text: string;
}

const localName = (qname: string) => (qname.includes(':') ? qname.slice(qname.indexOf(':') + 1) : qname);

/** Прочитать значение 1С из элемента Value (или return/параметра) по его xsi:type. */
export function readValue(node: XmlNode, declaredType?: string): V8Value {
    if (node.attrs.nil === 'true') return null;
    const type = localName(node.attrs.type ?? declaredType ?? '');
    switch (type) {
        case 'string':
            return node.text;
        case 'boolean':
            return node.text.trim() === 'true';
        case 'decimal':
        case 'int':
        case 'long':
        case 'double':
        case 'float':
            return Number(node.text.trim());
        case 'dateTime':
            return new Date(`${node.text.trim()}Z`);
        case 'UUID':
            return new V8Uuid(node.text.trim());
        case 'base64Binary':
            return Buffer.from(node.text.replace(/\s+/g, ''), 'base64');
        case 'Structure':
            return readStructure(node);
        case 'Array':
            return node.children.filter((c) => c.name === 'Value').map((c) => readValue(c));
        case '':
            // Тип не указан: дети — значит структура или массив, иначе строка.
            if (node.children.some((c) => c.name === 'Property')) return readStructure(node);
            return node.text;
        default:
            return new V8Raw(node.attrs.type ?? type, node.text);
    }
}

/** Структура: Property name="…" → значение его Value. */
export function readStructure(node: XmlNode): { [key: string]: V8Value } {
    const result: { [key: string]: V8Value } = {};
    for (const prop of node.children.filter((c) => c.name === 'Property')) {
        const value = prop.children.find((c) => c.name === 'Value');
        result[prop.attrs.name] = value ? readValue(value) : null;
    }
    return result;
}

/**
 * Перевод из формы fast-xml-parser (preserveOrder: true, removeNSPrefix:
 * true, атрибуты в ':@') в XmlNode.
 */
export function toXmlNodes(ordered: any[]): XmlNode[] {
    const nodes: XmlNode[] = [];
    for (const item of ordered ?? []) {
        const name = Object.keys(item).find((k) => k !== ':@');
        if (!name || name === '#text' || name === '?xml') continue;
        const rawAttrs = (item[':@'] ?? {}) as Record<string, unknown>;
        const attrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawAttrs)) attrs[localName(k.replace(/^@_/, ''))] = String(v);
        const kids = item[name] as any[];
        const text = (kids ?? []).filter((k) => '#text' in k).map((k) => String(k['#text'])).join('');
        nodes.push({ name: localName(name), attrs, children: toXmlNodes(kids), text });
    }
    return nodes;
}
