import { XMLParser } from 'fast-xml-parser';
import { SoapError } from './soap';
import { XmlNode, escapeXml, toXmlNodes } from './xdto';

/**
 * Сообщение обмена 1С — файл, который базы передают друг другу.
 *
 *   <Message xmlns:msg="http://www.1c.ru/SSL/Exchange/Message" …>
 *     <msg:Header>
 *       <msg:Format>http://v8.1c.ru/edi/edi_stnd/EnterpriseData/1.10</msg:Format>
 *       <msg:CreationDate>…</msg:CreationDate>
 *       <msg:Confirmation>план, кому, от кого, номер, номер принятого</msg:Confirmation>
 *       <msg:AvailableVersion>1.10</msg:AvailableVersion> …
 *       <msg:AvailableObjectTypes>какие объекты отправляем и принимаем</msg:AvailableObjectTypes>
 *       <msg:Prefix>LC</msg:Prefix>
 *     </msg:Header>
 *     <Body xmlns="…/EnterpriseData/1.10"> объекты </Body>
 *   </Message>
 *
 * Схема заголовка — пакет XDTO ExchangeMessage из БСП; порядок элементов в
 * нём важен, 1С читает заголовок по схеме. Номера — квитирование: в каждом
 * сообщении база пишет свой номер и номер последнего принятого от другой
 * стороны. По номеру принятого 1С понимает, что до нас дошло, и перестаёт
 * пересылать эти изменения.
 */

export const NS_MESSAGE = 'http://www.1c.ru/SSL/Exchange/Message';

export interface ObjectType {
    /** «Справочник.Контрагенты», «Документ.РеализацияТоваровУслуг»… */
    name: string;
    sending?: boolean;
    receiving?: boolean;
}

export interface OutgoingHeader {
    /** Полный адрес формата с версией: …/EnterpriseData/1.10. */
    format: string;
    exchangePlan: string;
    to: string;
    from: string;
    messageNo: number;
    receivedNo: number;
    versions: string[];
    objectTypes: ObjectType[];
    prefix: string;
}

/** Дата для 1С — всемирное время без пояса, как пишет сама 1С. */
const v8Date = (d: Date) => d.toISOString().slice(0, 19);

/** Собрать сообщение для 1С; body — готовые объекты формата. */
export function buildMessage(h: OutgoingHeader, body = '', now = new Date()): string {
    const el = (name: string, value: string | number) => `<msg:${name}>${escapeXml(String(value))}</msg:${name}>`;
    // «*» — во всех версиях из AvailableVersion.
    const types = h.objectTypes.map((t) => '<msg:ObjectType>' + el('Name', t.name)
        + (t.sending ? el('Sending', '*') : '') + (t.receiving ? el('Receiving', '*') : '') + '</msg:ObjectType>').join('');
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + `<Message xmlns:msg="${NS_MESSAGE}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
        + '<msg:Header>'
        + el('Format', h.format)
        + el('CreationDate', v8Date(now))
        + '<msg:Confirmation>'
        + el('ExchangePlan', h.exchangePlan) + el('To', h.to) + el('From', h.from)
        + el('MessageNo', h.messageNo) + el('ReceivedNo', h.receivedNo)
        + '</msg:Confirmation>'
        + h.versions.map((v) => el('AvailableVersion', v)).join('')
        + (types ? `<msg:AvailableObjectTypes>${types}</msg:AvailableObjectTypes>` : '')
        + el('Prefix', h.prefix)
        + '</msg:Header>'
        + `<Body xmlns="${escapeXml(h.format)}">${body}</Body>`
        + '</Message>';
}

export interface IncomingMessage {
    /** Адрес формата без версии и расширений. */
    format: string;
    /** Версия формата из адреса; нет — сообщение только с настройками. */
    version: string | null;
    exchangePlan: string | null;
    from: string | null;
    to: string | null;
    messageNo: number | null;
    receivedNo: number | null;
    versions: string[];
    /** Есть ли тело: без него 1С присылает только свои настройки обмена. */
    hasBody: boolean;
    /** Объекты тела по порядку. */
    objects: XmlNode[];
}

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    preserveOrder: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
});

const child = (node: XmlNode | undefined, name: string) => node?.children.find((c) => c.name === name);
const text = (node: XmlNode | undefined) => (node ? node.text.trim() : null);
const num = (node: XmlNode | undefined) => {
    const t = text(node);
    return t ? Number(t) : null;
};

/** Разобрать сообщение от 1С. */
export function readMessage(xml: string): IncomingMessage {
    let doc: XmlNode[];
    try {
        doc = toXmlNodes(parser.parse(xml));
    } catch {
        throw new SoapError('Файл от 1С — не XML: сообщение обмена повреждено');
    }
    const root = doc.find((n) => n.name === 'Message');
    const header = child(root, 'Header');
    if (!root || !header) throw new SoapError('Файл от 1С — не сообщение обмена: нет заголовка');

    // «адрес-формата [адрес-расширения]»: расширения пока не разбираем.
    const fullFormat = (text(child(header, 'Format')) ?? '').split(/\s+/)[0];
    const m = /^(.*)\/(\d+(?:\.\d+)+)$/.exec(fullFormat);
    const confirmation = child(header, 'Confirmation');
    const body = child(root, 'Body');
    return {
        format: m ? m[1] : fullFormat,
        version: m ? m[2] : null,
        exchangePlan: text(child(confirmation, 'ExchangePlan')),
        from: text(child(confirmation, 'From')),
        to: text(child(confirmation, 'To')),
        messageNo: num(child(confirmation, 'MessageNo')),
        receivedNo: num(child(confirmation, 'ReceivedNo')),
        versions: header.children.filter((c) => c.name === 'AvailableVersion').map((c) => c.text.trim()),
        hasBody: !!body,
        objects: body?.children ?? [],
    };
}

/** Сколько пришло объектов каждого вида. */
export function countObjects(objects: XmlNode[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const o of objects) counts[o.name] = (counts[o.name] ?? 0) + 1;
    return counts;
}
