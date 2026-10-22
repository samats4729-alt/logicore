import { XMLParser } from 'fast-xml-parser';
import { OpSpec, ServiceSpec } from './services';
import { NS_V8, NS_XS, NS_XSI, V8Uuid, V8Value, V8_NS_DECL, XmlNode, arrayContent, escapeXml, readValue, structureContent, toXmlNodes } from './xdto';

/**
 * SOAP для 1С: описание службы (WSDL), разбор вызова и ответ.
 *
 * Описание собрано по образцу того, что отдаёт опубликованная база 1С:
 * document/literal, элемент на каждую операцию, ответ — «Операция»Response
 * с return и выходными параметрами, точка подключения «Служба»Soap. 1С
 * строит прокси по имени точки подключения, поэтому оно обязано быть таким.
 */

const NS_WSDL = 'http://schemas.xmlsoap.org/wsdl/';
const NS_SOAPBIND = 'http://schemas.xmlsoap.org/wsdl/soap/';
const NS_SOAP_ENV = 'http://schemas.xmlsoap.org/soap/envelope/';

/**
 * Схема типов ядра 1С, которые встречаются в службах обмена.
 *
 * 1С пишет их в описание сама; без них её разборщик описания не знает,
 * что такое v8:Structure, и прокси не строится.
 */
const CORE_SCHEMA = `<xs:schema xmlns:xs="${NS_XS}" xmlns:tns="${NS_V8}" targetNamespace="${NS_V8}" attributeFormDefault="unqualified" elementFormDefault="qualified">`
    + '<xs:complexType name="Array"><xs:sequence><xs:element name="Value" nillable="true" minOccurs="0" maxOccurs="unbounded"/></xs:sequence></xs:complexType>'
    + '<xs:complexType name="Structure"><xs:sequence><xs:element name="Property" minOccurs="0" maxOccurs="unbounded"><xs:complexType><xs:sequence>'
    + '<xs:element name="Value" nillable="true"/></xs:sequence><xs:attribute name="name" type="xs:NMTOKEN" use="required"/></xs:complexType></xs:element>'
    + '</xs:sequence></xs:complexType>'
    + '<xs:simpleType name="UUID"><xs:restriction base="xs:string"><xs:pattern value="[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"/></xs:restriction></xs:simpleType>'
    + '<xs:simpleType name="ValueStorage"><xs:restriction base="xs:base64Binary"/></xs:simpleType>'
    + '</xs:schema>';

export interface WsdlOptions {
    /** Класть ли в описание схему типов ядра 1С. */
    includeCoreSchema?: boolean;
}

export function buildWsdl(service: ServiceSpec, location: string, options: WsdlOptions = {}): string {
    const tns = service.namespace;
    const usesV8 = service.operations.some((op) => op.returns.startsWith('v8:') || op.params.some((pr) => pr.type.startsWith('v8:')));
    const elements = service.operations.map((op) => {
        const inputs = op.params.filter((pr) => pr.dir !== 'Out')
            .map((pr) => `<xs:element name="${pr.name}" type="${pr.type}"${pr.nillable ? ' nillable="true"' : ''}/>`)
            .join('');
        const outputs = [`<xs:element name="return" type="${op.returns}"${op.returnNillable ? ' nillable="true"' : ''}/>`]
            .concat(op.params.filter((pr) => pr.dir !== 'In')
                .map((pr) => `<xs:element name="${pr.name}" type="${pr.type}"${pr.nillable ? ' nillable="true"' : ''}/>`))
            .join('');
        return `<xs:element name="${op.name}"><xs:complexType><xs:sequence>${inputs}</xs:sequence></xs:complexType></xs:element>`
            + `<xs:element name="${op.name}Response"><xs:complexType><xs:sequence>${outputs}</xs:sequence></xs:complexType></xs:element>`;
    }).join('');

    const schemas = (usesV8 && options.includeCoreSchema !== false ? CORE_SCHEMA : '')
        + `<xs:schema xmlns:xs="${NS_XS}" xmlns:v8="${NS_V8}" xmlns:tns="${tns}" targetNamespace="${tns}" attributeFormDefault="unqualified" elementFormDefault="qualified">`
        + (usesV8 ? `<xs:import namespace="${NS_V8}"/>` : '')
        + elements
        + '</xs:schema>';

    const messages = service.operations.map((op) =>
        `<message name="${op.name}RequestMessage"><part name="parameters" element="tns:${op.name}"/></message>`
        + `<message name="${op.name}ResponseMessage"><part name="parameters" element="tns:${op.name}Response"/></message>`).join('');
    const portOps = service.operations.map((op) =>
        `<operation name="${op.name}"><input message="tns:${op.name}RequestMessage"/><output message="tns:${op.name}ResponseMessage"/></operation>`).join('');
    const bindingOps = service.operations.map((op) =>
        `<operation name="${op.name}"><soapbind:operation style="document" soapAction="${tns}#${service.name}:${op.name}"/>`
        + '<input><soapbind:body use="literal"/></input><output><soapbind:body use="literal"/></output></operation>').join('');

    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<definitions xmlns="${NS_WSDL}" xmlns:soapbind="${NS_SOAPBIND}" xmlns:tns="${tns}" xmlns:xs="${NS_XS}" xmlns:v8="${NS_V8}" name="${service.name}" targetNamespace="${tns}">`
        + `<types>${schemas}</types>`
        + messages
        + `<portType name="${service.name}PortType">${portOps}</portType>`
        + `<binding name="${service.name}SoapBinding" type="tns:${service.name}PortType"><soapbind:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>${bindingOps}</binding>`
        + `<service name="${service.name}"><port name="${service.name}Soap" binding="tns:${service.name}SoapBinding"><soapbind:address location="${escapeXml(location)}"/></port></service>`
        + '</definitions>';
}

// ==================== вызов ====================

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    preserveOrder: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: true,
});

export interface SoapCall {
    operation: OpSpec;
    /** Входные параметры по имени — уже значения 1С. */
    args: Record<string, V8Value>;
}

/** Разобрать вызов: какая операция и что в параметрах. */
export function parseCall(service: ServiceSpec, xml: string): SoapCall {
    const doc = toXmlNodes(parser.parse(xml));
    const envelope = doc.find((n) => n.name === 'Envelope');
    const body = envelope?.children.find((n) => n.name === 'Body');
    const call = body?.children[0];
    if (!call) throw new SoapError('Пустой запрос: нет вызова операции');
    const operation = service.operations.find((op) => op.name === call.name);
    if (!operation) throw new SoapError(`Операции ${call.name} в службе ${service.name} нет`);
    const args: Record<string, V8Value> = {};
    for (const pr of operation.params.filter((x) => x.dir !== 'Out')) {
        const node = call.children.find((c) => c.name === pr.name);
        args[pr.name] = node ? readParam(node, pr.type) : null;
    }
    return { operation, args };
}

function readParam(node: XmlNode, type: string): V8Value {
    if (type === 'v8:Structure') return node.attrs.nil === 'true' ? null : readValue(node, 'Structure');
    if (type === 'v8:Array') return node.attrs.nil === 'true' ? null : readValue(node, 'Array');
    return readValue(node, type.replace(/^v8:/, ''));
}

/** Ошибка, которую 1С покажет человеку текстом. */
export class SoapError extends Error {}

/** Значение ответа в элементе — по объявленному типу. */
function outElement(name: string, type: string, value: V8Value | undefined): string {
    if (value === null || value === undefined) return `<m:${name} xsi:nil="true"/>`;
    if (type === 'v8:Structure') return `<m:${name}>${structureContent(value as Record<string, V8Value>)}</m:${name}>`;
    if (type === 'v8:Array') return `<m:${name}>${arrayContent(value as V8Value[])}</m:${name}>`;
    if (typeof value === 'boolean') return `<m:${name}>${value ? 'true' : 'false'}</m:${name}>`;
    if (value instanceof V8Uuid) return `<m:${name}>${escapeXml(value.value)}</m:${name}>`;
    return `<m:${name}>${escapeXml(String(value))}</m:${name}>`;
}

/** Ответ операции: return и выходные параметры. */
export function buildResponse(service: ServiceSpec, operation: OpSpec, result: V8Value, outs: Record<string, V8Value> = {}): string {
    const parts = [outElement('return', operation.returns, result)]
        .concat(operation.params.filter((pr) => pr.dir !== 'In').map((pr) => outElement(pr.name, pr.type, outs[pr.name])));
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<soap:Envelope xmlns:soap="${NS_SOAP_ENV}"><soap:Header/><soap:Body>`
        + `<m:${operation.name}Response xmlns:m="${service.namespace}" ${V8_NS_DECL}>${parts.join('')}</m:${operation.name}Response>`
        + '</soap:Body></soap:Envelope>';
}

/** Ошибка SOAP: 1С покажет faultstring в окне настройки. */
export function buildFault(message: string): string {
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<soap:Envelope xmlns:soap="${NS_SOAP_ENV}"><soap:Body><soap:Fault>`
        + `<faultcode>soap:Server</faultcode><faultstring>${escapeXml(message)}</faultstring>`
        + '</soap:Fault></soap:Body></soap:Envelope>';
}

export { NS_XSI };
