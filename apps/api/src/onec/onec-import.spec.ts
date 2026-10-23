import { readMessage } from './message';
import {
    BANK, CP, OneCImportService, accountOf, binOf, describeImport, readBankAccount, readCounterparty, rolesFromContracts,
} from './onec-import.service';

/**
 * Разнесение сообщения 1С (этап 3). Сообщение — сокращённая копия того, что
 * 23.10 прислала «Бухгалтерия для Казахстана» из 1cFresh (формат 1.6).
 */
const KZ_MESSAGE = `<?xml version="1.0" encoding="UTF-8"?>
<Message xmlns:msg="http://www.1c.ru/SSL/Exchange/Message">
  <msg:Header>
    <msg:Format>http://v8.1c.ru/edi/edi_stnd/EnterpriseData/1.6</msg:Format>
    <msg:Confirmation><msg:ExchangePlan>СинхронизацияДанныхЧерезУниверсальныйФормат</msg:ExchangePlan>
      <msg:To>our</msg:To><msg:From>peer</msg:From><msg:MessageNo>1</msg:MessageNo><msg:ReceivedNo>0</msg:ReceivedNo></msg:Confirmation>
    <msg:AvailableVersion>1.6</msg:AvailableVersion>
  </msg:Header>
  <Body xmlns="http://v8.1c.ru/edi/edi_stnd/EnterpriseData/1.6">
    <Справочник.БанковскиеСчета>
      <КлючевыеСвойства>
        <Ссылка>acc-1</Ссылка>
        <НомерСчета>КZ12009NPS0413609816</НомерСчета>
        <Банк><Ссылка>bank-1</Ссылка><БИК>GCVPKZ2A</БИК><Наименование>НАО ГК «Правительство для граждан»</Наименование></Банк>
        <Владелец><КонтрагентыСсылка>
          <Ссылка>cp-gk</Ссылка><Наименование>ГК ПДГ</Наименование>
          <НаименованиеПолное>НАО Государственная корпорация "Правительство для граждан"</НаименованиеПолное>
          <ИНН>160440007161</ИНН><ЮридическоеФизическоеЛицо>ЮридическоеЛицо</ЮридическоеФизическоеЛицо>
        </КонтрагентыСсылка></Владелец>
      </КлючевыеСвойства>
      <Наименование>Для ОПВ</Наименование>
    </Справочник.БанковскиеСчета>
    <Справочник.Контрагенты><КлючевыеСвойства>
      <Ссылка>cp-retail</Ссылка><Наименование>Розничная выручка</Наименование><ИНН>000000000000</ИНН>
      <ЮридическоеФизическоеЛицо>ФизическоеЛицо</ЮридическоеФизическоеЛицо>
    </КлючевыеСвойства></Справочник.Контрагенты>
    <Справочник.Контрагенты><КлючевыеСвойства>
      <Ссылка>cp-gk</Ссылка><Наименование>ГК ПДГ</Наименование>
      <НаименованиеПолное>НАО Государственная корпорация "Правительство для граждан"</НаименованиеПолное>
      <ИНН>160440007161</ИНН><ЮридическоеФизическоеЛицо>ЮридическоеЛицо</ЮридическоеФизическоеЛицо>
    </КлючевыеСвойства></Справочник.Контрагенты>
    <Справочник.Контрагенты><КлючевыеСвойства>
      <Ссылка>cp-test</Ссылка><Наименование>TOO Test Kontragent</Наименование><НаименованиеПолное>TOO Test Kontragent</НаименованиеПолное>
      <ИНН>150840001234</ИНН><ЮридическоеФизическоеЛицо>ЮридическоеЛицо</ЮридическоеФизическоеЛицо>
    </КлючевыеСвойства></Справочник.Контрагенты>
    <Справочник.Организации><КлючевыеСвойства>
      <Ссылка>org-1</Ссылка><Наименование>Наша организация</Наименование><КПП>123456789</КПП>
    </КлючевыеСвойства></Справочник.Организации>
    <Справочник.Договоры><КлючевыеСвойства>
      <Ссылка>dog-1</Ссылка><ВидДоговора>СПоставщиком</ВидДоговора>
      <Контрагент><Ссылка>cp-test</Ссылка><Наименование>TOO Test Kontragent</Наименование><ИНН>150840001234</ИНН></Контрагент>
      <Наименование>Без договора</Наименование>
    </КлючевыеСвойства></Справочник.Договоры>
  </Body>
</Message>`;

describe('Разнесение из 1С: чтение объектов', () => {
    const { objects } = readMessage(KZ_MESSAGE);

    it('БИН — из поля ИНН, нули и мусор — не БИН', () => {
        expect(binOf('160440007161')).toBe('160440007161');
        expect(binOf(' 1604 4000 7161 ')).toBe('160440007161');
        expect(binOf('000000000000')).toBeNull();
        expect(binOf('12345')).toBeNull();
        expect(binOf(null)).toBeNull();
    });

    it('номер счёта: русская «К» в начале становится латинской', () => {
        expect(accountOf('КZ12 009N PS04 1360 9816')).toBe('KZ12009NPS0413609816');
    });

    it('контрагент: полное название в приоритете, БИН из ИНН', () => {
        const gk = objects.filter((o) => o.name === CP).map(readCounterparty)[1];
        expect(gk).toEqual({ ref: 'cp-gk', name: 'НАО Государственная корпорация "Правительство для граждан"', bin: '160440007161' });
    });

    it('банковский счёт: номер, БИК, банк и владелец', () => {
        const acc = readBankAccount(objects.find((o) => o.name === BANK)!);
        expect(acc).toMatchObject({ account: 'KZ12009NPS0413609816', bic: 'GCVPKZ2A', owner: { ref: 'cp-gk', bin: '160440007161' } });
    });

    it('роль — по виду договора', () => {
        expect(rolesFromContracts(objects).get('cp-test')).toEqual({ customer: false, carrier: true });
    });
});

/** Память вместо базы: ровно те вызовы, что делает разнесение. */
function fakeDb(companyId: string) {
    let seq = 0;
    const companies: any[] = [
        { id: companyId, bin: null, isExternal: false },
        // ГК ПДГ уже заведён руками, со своим счётом.
        { id: 'gk-local', bin: '160440007161', isExternal: true, createdByCompanyId: companyId, bankAccount: 'KZ00MANUAL', bankBic: null, bankName: null },
    ];
    const map: any[] = [];
    const blocked: string[] = [];
    const match = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v);
    const pick = (row: any) => (row ? { ...row } : null);
    const prisma: any = {
        company: {
            findFirst: async ({ where }: any) => pick(companies.find((c) => match(c, where))),
            findUnique: async ({ where }: any) => pick(companies.find((c) => c.id === where.id)),
            update: async ({ where, data }: any) => Object.assign(companies.find((c) => c.id === where.id), data),
        },
        oneCObjectMap: {
            findUnique: async ({ where }: any) => pick(map.find((m) => match(m, where.connectionId_objectType_ref))),
            upsert: async ({ where, create, update }: any) => {
                const row = map.find((m) => match(m, where.connectionId_objectType_ref));
                return row ? Object.assign(row, update) : (map.push({ ...create }), create);
            },
        },
        companyBlocklist: {
            findFirst: async ({ where }: any) => (where.OR.some((k: any) => blocked.includes(k.value)) ? { kind: 'BIN_IIN', value: 'x' } : null),
        },
    };
    const external = {
        createExternalCompany: jest.fn(async (owner: string, data: any) => {
            const row = { id: `new-${++seq}`, ...data, isExternal: true, createdByCompanyId: owner, bankAccount: null, bankBic: null, bankName: null };
            companies.push(row);
            return row;
        }),
    };
    return { prisma, external, companies, map, blocked };
}

describe('Разнесение из 1С: в справочник LogiCore', () => {
    const { objects } = readMessage(KZ_MESSAGE);

    it('новый — заводится, уже заведённый по БИН — связывается, без БИН — пропускается', async () => {
        const db = fakeDb('co-1');
        const s = await new OneCImportService(db.prisma, db.external as any).import('conn-1', 'co-1', objects);

        expect(s.counterparties).toEqual({ created: 1, linked: 1, noBin: 1, blocked: 0 });
        expect(db.external.createExternalCompany).toHaveBeenCalledTimes(1);
        expect(db.external.createExternalCompany).toHaveBeenCalledWith('co-1', expect.objectContaining({
            name: 'TOO Test Kontragent', bin: '150840001234', type: 'FORWARDER', isCarrier: true, isCustomer: false,
        }));
        // Счёт у ГК ПДГ уже был вписан руками — 1С его не перезаписывает.
        expect(db.companies.find((c) => c.id === 'gk-local').bankAccount).toBe('KZ00MANUAL');
        expect(s.bankFilled).toBe(0);
        expect(s.organizationLinked).toBe(true);
        expect(s.other).toEqual({ 'Справочник.Договоры': 1 });
        expect(s.errors).toEqual([]);
        expect(describeImport(s, { [CP]: 3, [BANK]: 1, 'Справочник.Организации': 1, 'Справочник.Договоры': 1 }))
            .toBe('Из 1С: контрагенты 3 (новых — 1, уже были в LogiCore — 1, без БИН, не заведены — 1); банковские счета 1; '
                + 'ваша организация сверена; пока только в журнал: договоры — 1');
    });

    it('повторная синхронизация: второго контрагента не заводит', async () => {
        const db = fakeDb('co-1');
        const importer = new OneCImportService(db.prisma, db.external as any);
        await importer.import('conn-1', 'co-1', objects);
        const again = await importer.import('conn-1', 'co-1', objects);
        expect(again.counterparties).toEqual({ created: 0, linked: 2, noBin: 1, blocked: 0 });
        expect(db.external.createExternalCompany).toHaveBeenCalledTimes(1);
    });

    it('пустой счёт в карточке — дописывается из 1С', async () => {
        const db = fakeDb('co-1');
        db.companies.find((c) => c.id === 'gk-local').bankAccount = null;
        const s = await new OneCImportService(db.prisma, db.external as any).import('conn-1', 'co-1', objects);
        expect(s.bankFilled).toBe(1);
        expect(db.companies.find((c) => c.id === 'gk-local')).toMatchObject({ bankAccount: 'KZ12009NPS0413609816', bankBic: 'GCVPKZ2A' });
    });

    it('БИН из чёрного списка — не заводится и не считается ошибкой', async () => {
        const db = fakeDb('co-1');
        db.blocked.push('150840001234');
        const s = await new OneCImportService(db.prisma, db.external as any).import('conn-1', 'co-1', objects);
        expect(s.counterparties.blocked).toBe(1);
        expect(db.external.createExternalCompany).not.toHaveBeenCalled();
        expect(s.errors).toEqual([]);
    });
});
