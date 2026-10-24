import { currencyLetter, currencyOf, salesDeletion, salesObject, serviceObject, shortNumber, vatRateOf } from './enterprise-data';
import { OneCExportService, SALES, SERVICE } from './onec-export.service';
import { ORG } from './onec-import.service';
import { notLoadedNotice, objectTypesFor } from './onec-exchange.service';

/** Что LogiCore отправляет в 1С (этап 4): акты как «Реализация (акт, накладная)». */
describe('Объекты для 1С', () => {
    it('номер для 1С — не длиннее 11 знаков, длиннее 1С документ не примет', () => {
        expect(shortNumber('АКТ-2026-000123')).toBe('LC26-000123');
        expect(shortNumber('АКТ-2026-1234567')).toBe('LC26-234567');
        expect(shortNumber('АКТ-45')).toBe('LC-00000045');
        for (const n of ['АКТ-2026-000123', 'АКТ-45', 'Акт без номера', 'X']) expect(shortNumber(n).length).toBeLessThanOrEqual(11);
    });

    it('ставка НДС и валюта — значениями формата', () => {
        expect(vatRateOf('STANDARD', 12)).toBe('НДС12');
        expect(vatRateOf('STANDARD', 16)).toBe('НДС16');
        expect(vatRateOf('ZERO', 0)).toBe('НДС0');
        expect(vatRateOf('WITHOUT_VAT', 0)).toBe('БезНДС');
        expect(vatRateOf('EXEMPT', 0)).toBe('БезНДС');
        expect(currencyOf('kzt')).toEqual({ code: '398', name: 'KZT' });
        expect(currencyOf('XXX')).toBeNull();
        expect(currencyLetter('643')).toBe('RUB');
        expect(currencyLetter('398')).toBe('KZT');
    });

    it('реализация: элементы в порядке схемы, сумма с НДС, услуги строками', () => {
        const xml = salesObject({
            ref: 'doc-1', date: '2026-10-23', number: 'LC26-000001',
            organization: { ref: 'org-1', name: 'ТОО «ЛогиКор»', bin: '123456789012' },
            counterparty: { ref: 'cp-1', name: 'ТОО «Ромашка» & Ко', bin: '150840001234', legal: true },
            currency: { code: '398', name: 'KZT' },
            amount: '112000.00', comment: 'LogiCore: АКТ-2026-000001',
            lines: [{ service: { ref: 'svc-1', name: 'Перевозка груза' }, quantity: '1', price: '112000.00', amount: '112000.00', vatRate: 'НДС12', vatAmount: '12000.00', content: 'Алматы — Астана' }],
        });
        const order = [...xml.matchAll(/<(КлючевыеСвойства|ВидОперации|Валюта|Сумма|СуммаВключаетНДС|Контрагент|ДанныеВзаиморасчетов|Комментарий|Услуги)>/g)]
            .map((m) => m[1]);
        expect(order.slice(0, 9)).toEqual(['КлючевыеСвойства', 'ВидОперации', 'Валюта', 'Сумма', 'СуммаВключаетНДС', 'Контрагент', 'ДанныеВзаиморасчетов', 'Комментарий', 'Услуги']);
        expect(xml).toContain('<КлючевыеСвойства><Ссылка>doc-1</Ссылка><Дата>2026-10-23T12:00:00</Дата><Номер>LC26-000001</Номер>'
            + '<Организация><Ссылка>org-1</Ссылка><Наименование>ТОО «ЛогиКор»</Наименование><ИНН>123456789012</ИНН>');
        expect(xml).toContain('<Наименование>ТОО «Ромашка» &amp; Ко</Наименование>');
        expect(xml).toContain('<Строка><НомерСтрокиДокумента>1</НомерСтрокиДокумента><Номенклатура><Ссылка>svc-1</Ссылка>');
        expect(xml).toContain('<Количество>1</Количество><Сумма>112000.00</Сумма><Цена>112000.00</Цена><СтавкаНДС>НДС12</СтавкаНДС><СуммаНДС>12000.00</СуммаНДС>');
    });

    it('валюта и единица — по версии формата: до 1.7 прямо в элементе, с 1.7 в «ДанныеКлассификатора»', () => {
        const doc = (version: string) => salesObject({
            ref: 'doc-1', date: '2026-10-23', number: 'LC26-000001',
            organization: { ref: 'org-1', name: 'ТОО «ЛогиКор»' },
            counterparty: { ref: 'cp-1', name: 'ТОО «Ромашка»', legal: true },
            currency: { code: '398', name: 'KZT' }, amount: '1.00',
            lines: [{ service: { ref: 'svc-1', name: 'Перевозка' }, quantity: '1', price: '1.00', amount: '1.00', vatRate: 'БезНДС', vatAmount: '0' }],
        }, version);
        // Казахстанская облачная БП — 1.6, учебная российская — 1.10 (она и отказала в загрузке 24.10).
        expect(doc('1.6')).toContain('<Валюта><Код>398</Код><Наименование>KZT</Наименование></Валюта>');
        expect(doc('1.6')).toContain('<ВалютаВзаиморасчетов><Код>398</Код>');
        expect(doc('1.10')).toContain('<Валюта><ДанныеКлассификатора><Код>398</Код><Наименование>KZT</Наименование></ДанныеКлассификатора></Валюта>');
        expect(doc('1.10')).toContain('<ВалютаВзаиморасчетов><ДанныеКлассификатора><Код>398</Код>');
        expect(doc('1.7')).toContain('<Валюта><ДанныеКлассификатора>');
        const svc = { ref: 'svc-1', name: 'Перевозка груза' };
        expect(serviceObject(svc, '1.6')).toContain('<ЕдиницаИзмерения><Код>876</Код><Наименование>усл. ед</Наименование></ЕдиницаИзмерения>');
        expect(serviceObject(svc, '1.10')).toContain('<ЕдиницаИзмерения><ДанныеКлассификатора><Код>876</Код>');
    });

    it('услуга — с типом «Услуга» и единицей «усл. ед»; удаление — ссылкой на реализацию', () => {
        expect(serviceObject({ ref: 'svc-1', name: 'Перевозка груза' })).toContain('<ТипНоменклатуры>Услуга</ТипНоменклатуры><ЕдиницаИзмерения><ДанныеКлассификатора><Код>876</Код>');
        expect(salesDeletion('doc-1')).toBe('<УдалениеОбъекта><СсылкаНаОбъект><СсылкаНаОбъект><РеализацияТоваровУслугСсылка>doc-1</РеализацияТоваровУслугСсылка></СсылкаНаОбъект></СсылкаНаОбъект></УдалениеОбъекта>');
    });
});

/** Память вместо базы — ровно то, что читает и пишет отправка. */
function fakeDb(opts: { orgMapped: boolean }) {
    const conn = { companyId: 'co-1', setupAt: new Date('2026-10-01'), peerReceivedNo: 0, company: { name: 'ТОО «ЛогиКор»', bin: '123456789012' } };
    const map: any[] = opts.orgMapped ? [{ connectionId: 'conn-1', objectType: ORG, ref: 'org-1c', localId: 'co-1', createdAt: new Date(0), sentNo: null, hash: null }] : [];
    const acts: any[] = [{
        id: 'act-1', number: 'АКТ-2026-000001', documentDate: new Date('2026-10-20'), currency: 'KZT', total: 112000, status: 'POSTED',
        counterparty: { id: 'cp-local', name: 'ТОО «Ромашка»', bin: '150840001234' },
        lines: [{ name: 'Перевозка груза', description: null, quantity: 1, total: 112000, vatTreatment: 'STANDARD', vatRate: 12, vatAmount: 12000 }],
    }];
    const match = (row: any, where: any) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'in' in (v as any) ? (v as any).in.includes(row[k]) : row[k] === v));
    let created = 0;
    const prisma: any = {
        oneCConnection: { findUniqueOrThrow: async () => ({ ...conn }) },
        oneCObjectMap: {
            findFirst: async ({ where }: any) => map.find((m) => match(m, where)) ?? null,
            findMany: async ({ where }: any) => map.filter((m) => match(m, where)),
            findUnique: async ({ where }: any) => map.find((m) => match(m, where.connectionId_objectType_ref)) ?? null,
            create: async ({ data }: any) => { created++; map.push({ ...data, createdAt: new Date(), sentNo: null, hash: null }); },
            upsert: async ({ where, create, update }: any) => {
                const row = map.find((m) => match(m, where.connectionId_objectType_ref));
                if (row) Object.assign(row, update); else map.push({ ...create, createdAt: new Date() });
            },
        },
        accountingDocument: {
            findMany: async ({ where }: any) => (where.id ? acts.filter((a) => where.id.in.includes(a.id) && a.status === where.status) : acts.filter((a) => a.status === 'POSTED')),
            count: async () => acts.filter((a) => a.status === 'POSTED').length,
        },
    };
    return { prisma, conn, map, acts, created: () => created };
}

describe('Отправка актов в 1С', () => {
    it('пока 1С не прислала свою организацию — не отправляем и говорим почему', async () => {
        const db = fakeDb({ orgMapped: false });
        const r = await new OneCExportService(db.prisma).build('conn-1');
        expect(r.sales).toBe(0);
        expect(r.body).toBe('');
        expect(r.skipped[0]).toContain('организацию');
    });

    it('акт уходит с услугой; подтверждённый и неизменённый второй раз не уходит; неподтверждённый — уходит', async () => {
        const db = fakeDb({ orgMapped: true });
        const exporter = new OneCExportService(db.prisma);

        const first = await exporter.build('conn-1');
        expect(first.sales).toBe(1);
        expect(first.body).toContain('<Справочник.Номенклатура>');
        expect(first.body).toContain('<Документ.РеализацияТоваровУслуг>');
        expect(first.body).toContain('<Ссылка>org-1c</Ссылка>');
        expect(first.body).toContain('<Номер>LC26-000001</Номер>');
        expect(first.body).toContain('<Комментарий>LogiCore: АКТ-2026-000001</Комментарий>');
        await first.commit(5);
        expect(db.map.find((m) => m.objectType === SALES)).toMatchObject({ localId: 'act-1', sentNo: 5 });
        expect(db.map.find((m) => m.objectType === SERVICE)).toMatchObject({ localId: 'service:перевозка груза', sentNo: 5 });

        // 1С ещё не подтвердила сообщение 5 — уходит снова, с той же ссылкой.
        const again = await exporter.build('conn-1');
        expect(again.sales).toBe(1);
        expect(again.body).toContain(`<Ссылка>${db.map.find((m) => m.objectType === SALES).ref}</Ссылка>`);

        // Подтвердила — больше не уходит.
        db.conn.peerReceivedNo = 5;
        const quiet = await exporter.build('conn-1');
        expect(quiet.sales).toBe(0);
        expect(quiet.body).toBe('');

        // Изменили сумму — уходит.
        db.acts[0].total = 224000;
        db.acts[0].lines[0].total = 224000;
        const changed = await exporter.build('conn-1');
        expect(changed.sales).toBe(1);
        expect(changed.body).not.toContain('<Справочник.Номенклатура>'); // услугу 1С уже знает
    });

    it('отменили после отправки — уходит удаление, один раз', async () => {
        const db = fakeDb({ orgMapped: true });
        const exporter = new OneCExportService(db.prisma);
        await (await exporter.build('conn-1')).commit(3);
        db.conn.peerReceivedNo = 3;
        db.acts[0].status = 'CANCELLED';

        const r = await exporter.build('conn-1');
        expect(r.deletions).toBe(1);
        expect(r.body).toContain('<УдалениеОбъекта>');
        await r.commit(4);
        db.conn.peerReceivedNo = 4;
        expect((await exporter.build('conn-1')).deletions).toBe(0);
    });
});

describe('Что LogiCore просит у 1С', () => {
    it('только выбранное компанией; организацию — всегда, и список никогда не пуст', () => {
        const names = (c: any) => objectTypesFor(c).map((t) => `${t.name}:${t.sending ? 'отправка' : 'приём'}`);
        expect(names({ sendActs: false, receiveCounterparties: false, receivePayments: false })).toEqual(['Справочник.Организации:приём']);
        expect(names({ sendActs: true, receiveCounterparties: false, receivePayments: false })).toEqual([
            'Справочник.Организации:приём', 'Справочник.Номенклатура:отправка', 'Документ.РеализацияТоваровУслуг:отправка',
        ]);
        expect(names({ sendActs: true, receiveCounterparties: true, receivePayments: true })).toHaveLength(8);
    });
});

describe('Журнал: 1С скачала, но не загрузила', () => {
    it('подтверждено меньше отправленного — пишем об этом; всё дошло или 1С ещё ничего не брала — молчим', () => {
        expect(notLoadedNotice(6, 5)).toContain('не смогла их загрузить');
        expect(notLoadedNotice(6, 6)).toBeNull();
        expect(notLoadedNotice(0, 0)).toBeNull();
        expect(notLoadedNotice(6, null)).toBeNull();
    });
});
