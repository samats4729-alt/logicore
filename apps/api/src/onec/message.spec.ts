import { deflateRawSync } from 'zlib';
import { buildMessage, countObjects, readMessage } from './message';
import { crc32, unzipFirst, zipOne } from './zip';

/** Сообщение обмена и архив, в котором оно ходит (обмен с 1С, этап 2). */
describe('Сообщение обмена 1С', () => {
    const header = {
        format: 'http://v8.1c.ru/edi/edi_stnd/EnterpriseData/1.10',
        exchangePlan: 'СинхронизацияДанныхЧерезУниверсальныйФормат',
        to: 'peer-node',
        from: 'our-node',
        messageNo: 3,
        receivedNo: 7,
        versions: ['1.8', '1.10'],
        objectTypes: [{ name: 'Справочник.Контрагенты', receiving: true }],
        prefix: 'LC',
    };

    it('заголовок — в порядке схемы БСП, тело — в пространстве формата', () => {
        const xml = buildMessage(header, '', new Date('2026-10-23T08:00:00Z'));
        expect(xml).toContain('<Message xmlns:msg="http://www.1c.ru/SSL/Exchange/Message"');
        expect(xml).toContain('<msg:Header><msg:Format>http://v8.1c.ru/edi/edi_stnd/EnterpriseData/1.10</msg:Format>'
            + '<msg:CreationDate>2026-10-23T08:00:00</msg:CreationDate>'
            + '<msg:Confirmation><msg:ExchangePlan>СинхронизацияДанныхЧерезУниверсальныйФормат</msg:ExchangePlan>'
            + '<msg:To>peer-node</msg:To><msg:From>our-node</msg:From><msg:MessageNo>3</msg:MessageNo><msg:ReceivedNo>7</msg:ReceivedNo></msg:Confirmation>'
            + '<msg:AvailableVersion>1.8</msg:AvailableVersion><msg:AvailableVersion>1.10</msg:AvailableVersion>'
            + '<msg:AvailableObjectTypes><msg:ObjectType><msg:Name>Справочник.Контрагенты</msg:Name><msg:Receiving>*</msg:Receiving></msg:ObjectType></msg:AvailableObjectTypes>'
            + '<msg:Prefix>LC</msg:Prefix></msg:Header>');
        expect(xml).toContain('<Body xmlns="http://v8.1c.ru/edi/edi_stnd/EnterpriseData/1.10"></Body></Message>');
    });

    it('читает сообщение 1С: номера, версия и объекты тела', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Message xmlns:msg="http://www.1c.ru/SSL/Exchange/Message" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <msg:Header>
    <msg:Format>http://v8.1c.ru/edi/edi_stnd/EnterpriseData/1.10 http://v8.1c.ru/edi/edi_stnd/EnterpriseData/ext</msg:Format>
    <msg:CreationDate>2026-10-23T08:00:00</msg:CreationDate>
    <msg:Confirmation>
      <msg:ExchangePlan>СинхронизацияДанныхЧерезУниверсальныйФормат</msg:ExchangePlan>
      <msg:To>our-node</msg:To><msg:From>peer-node</msg:From>
      <msg:MessageNo>5</msg:MessageNo><msg:ReceivedNo>2</msg:ReceivedNo>
    </msg:Confirmation>
    <msg:AvailableVersion>1.10</msg:AvailableVersion>
  </msg:Header>
  <Body xmlns="http://v8.1c.ru/edi/edi_stnd/EnterpriseData/1.10">
    <Справочник.Контрагенты><КлючевыеСвойства><Наименование>ТОО «Ромашка»</Наименование></КлючевыеСвойства></Справочник.Контрагенты>
    <Справочник.Контрагенты><КлючевыеСвойства><Наименование>ИП Иванов</Наименование></КлючевыеСвойства></Справочник.Контрагенты>
    <Справочник.Договоры/>
  </Body>
</Message>`;
        const msg = readMessage(xml);
        expect(msg).toMatchObject({
            format: 'http://v8.1c.ru/edi/edi_stnd/EnterpriseData',
            version: '1.10',
            exchangePlan: 'СинхронизацияДанныхЧерезУниверсальныйФормат',
            from: 'peer-node',
            to: 'our-node',
            messageNo: 5,
            receivedNo: 2,
            versions: ['1.10'],
            hasBody: true,
        });
        expect(countObjects(msg.objects)).toEqual({ 'Справочник.Контрагенты': 2, 'Справочник.Договоры': 1 });
    });

    it('сообщение только с настройками: адрес формата без версии и без тела', () => {
        const msg = readMessage('<Message xmlns:msg="http://www.1c.ru/SSL/Exchange/Message"><msg:Header>'
            + '<msg:Format>http://v8.1c.ru/edi/edi_stnd/EnterpriseData</msg:Format><msg:AvailableVersion>1.8</msg:AvailableVersion>'
            + '</msg:Header></Message>');
        expect(msg).toMatchObject({ version: null, hasBody: false, messageNo: null, versions: ['1.8'] });
    });

    it('не сообщение — понятная ошибка', () => {
        expect(() => readMessage('<html/>')).toThrow('нет заголовка');
    });
});

describe('Архив zip с одним файлом', () => {
    it('что упаковали, то и распаковали — и имя по-русски', () => {
        const data = Buffer.from('<Message>Привет, 1С</Message>'.repeat(1000), 'utf8');
        const { name, data: back } = unzipFirst(zipOne('Сообщение.xml', data));
        expect(name).toBe('Сообщение.xml');
        expect(back.equals(data)).toBe(true);
    });

    it('читает архив, где размеры стоят только в оглавлении (как пишут архиваторы с потоком)', () => {
        const data = Buffer.from('<Message/>', 'utf8');
        const packed = deflateRawSync(data);
        const name = Buffer.from('Message.xml');
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0008, 6); // размеры — после данных
        local.writeUInt16LE(8, 8);
        local.writeUInt16LE(name.length, 26);
        const descriptor = Buffer.alloc(16);
        descriptor.writeUInt32LE(0x08074b50, 0);
        descriptor.writeUInt32LE(crc32(data), 4);
        descriptor.writeUInt32LE(packed.length, 8);
        descriptor.writeUInt32LE(data.length, 12);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(0x0008, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt32LE(crc32(data), 16);
        central.writeUInt32LE(packed.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        const centralOffset = local.length + name.length + packed.length + descriptor.length;
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(1, 8);
        end.writeUInt16LE(1, 10);
        end.writeUInt32LE(central.length + name.length, 12);
        end.writeUInt32LE(centralOffset, 16);
        const zip = Buffer.concat([local, name, packed, descriptor, central, name, end]);
        expect(unzipFirst(zip).data.toString()).toBe('<Message/>');
    });

    it('битый архив — ошибка, а не мусор', () => {
        const zip = zipOne('a.xml', Buffer.from('данные'));
        zip[40] ^= 0xff;
        expect(() => unzipFirst(zip)).toThrow();
        expect(() => unzipFirst(Buffer.from('not a zip at all, definitely not'))).toThrow('не архив');
    });
});
