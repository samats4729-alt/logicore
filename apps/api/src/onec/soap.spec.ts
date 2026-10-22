import { EXCHANGE_3_0_1_1, INTERFACE_VERSION } from './services';
import { buildFault, buildResponse, buildWsdl, parseCall } from './soap';
import { V8Raw } from './xdto';

/** SOAP для 1С: описание службы, разбор вызова, ответ (обмен с 1С, этап 1). */
describe('SOAP для 1С', () => {
    it('описание службы: точка подключения «Служба»Soap, операции и адрес — как у базы 1С', () => {
        const wsdl = buildWsdl(EXCHANGE_3_0_1_1, 'https://api.example.kz/1c/k1/ws/Exchange_3_0_1_1');
        expect(wsdl).toContain('<port name="Exchange_3_0_1_1Soap" binding="tns:Exchange_3_0_1_1SoapBinding">');
        expect(wsdl).toContain('<soapbind:address location="https://api.example.kz/1c/k1/ws/Exchange_3_0_1_1"/>');
        expect(wsdl).toContain('<xs:element name="GetIBParametersResponse"><xs:complexType><xs:sequence><xs:element name="return" type="v8:Structure" nillable="true"/><xs:element name="ResultMessage" type="xs:string" nillable="true"/>');
        expect(wsdl).toContain('targetNamespace="http://www.1c.ru/SSL/Exchange_3_0_1_1"');
        expect(wsdl).toContain('<xs:complexType name="Structure">');
    });

    it('разбирает вызов 1С с префиксами и типами', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header/><soap:Body>
<m:GetVersions xmlns:m="http://www.1c.ru/SaaS/1.0/WS"><m:InterfaceName xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">ОбменДанными</m:InterfaceName></m:GetVersions>
</soap:Body></soap:Envelope>`;
        const call = parseCall(INTERFACE_VERSION, xml);
        expect(call.operation.name).toBe('GetVersions');
        expect(call.args).toEqual({ InterfaceName: 'ОбменДанными' });
    });

    it('структура с вложенной структурой, перечислением 1С и пустым значением', () => {
        const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
<m:CreateExchangeNode xmlns:m="http://www.1c.ru/SSL/Exchange_3_0_1_1">
<m:Parameters xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<Property xmlns="http://v8.1c.ru/8.1/data/core" name="НастройкиПодключения"><Value xsi:type="Structure">
  <Property name="ИмяПланаОбмена"><Value xsi:type="xs:string">СинхронизацияДанныхЧерезУниверсальныйФормат</Value></Property>
  <Property name="ВидТранспорта"><Value xmlns:d5p1="http://v8.1c.ru/8.1/data/enterprise/current-config" xsi:type="d5p1:EnumRef.ВидыТранспортаСообщенийОбмена">WS</Value></Property>
  <Property name="Пусто"><Value xsi:nil="true"/></Property>
  <Property name="Флаг"><Value xsi:type="xs:boolean">true</Value></Property>
</Value></Property>
<Property xmlns="http://v8.1c.ru/8.1/data/core" name="СтрокаПараметровXML"><Value xsi:type="xs:string">&lt;x/&gt;</Value></Property>
</m:Parameters></m:CreateExchangeNode></soap:Body></soap:Envelope>`;
        const { args } = parseCall(EXCHANGE_3_0_1_1, xml);
        expect(args.Parameters).toEqual({
            НастройкиПодключения: {
                ИмяПланаОбмена: 'СинхронизацияДанныхЧерезУниверсальныйФормат',
                ВидТранспорта: new V8Raw('d5p1:EnumRef.ВидыТранспортаСообщенийОбмена', 'WS'),
                Пусто: null,
                Флаг: true,
            },
            СтрокаПараметровXML: '<x/>',
        });
    });

    it('ответ: массив, структура и выходные параметры — в пространстве ядра 1С', () => {
        const op = INTERFACE_VERSION.operations[0];
        const versions = buildResponse(INTERFACE_VERSION, op, ['3.0.1.1']);
        expect(versions).toContain('<m:GetVersionsResponse xmlns:m="http://www.1c.ru/SaaS/1.0/WS"');
        expect(versions).toContain('<m:return><v8:Value xsi:type="xs:string">3.0.1.1</v8:Value></m:return>');

        const getIb = EXCHANGE_3_0_1_1.operations.find((o) => o.name === 'GetIBParameters')!;
        const params = buildResponse(EXCHANGE_3_0_1_1, getIb, { ПланОбменаСуществует: true, Версии: ['1.8'] }, { ResultMessage: '' });
        expect(params).toContain('<m:return><v8:Property name="ПланОбменаСуществует"><v8:Value xsi:type="xs:boolean">true</v8:Value></v8:Property>'
            + '<v8:Property name="Версии"><v8:Value xsi:type="v8:Array"><v8:Value xsi:type="xs:string">1.8</v8:Value></v8:Value></v8:Property></m:return>');
        expect(params).toContain('<m:ResultMessage></m:ResultMessage>');
    });

    it('ошибка — текстом, который 1С покажет человеку', () => {
        expect(buildFault('Неверный <пароль>')).toContain('<faultstring>Неверный &lt;пароль&gt;</faultstring>');
    });
});
