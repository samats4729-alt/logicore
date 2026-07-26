import * as PDFDocument from 'pdfkit';
import { OrderContractService } from './order-contract.service';

const COMPANY = 'company-1';
const CARRIER = 'company-2';

const order = () => ({
    id: 'order-1',
    orderNumber: 'AB00003824',
    createdAt: new Date('2026-07-23'),
    cargoDescription: 'напитки',
    cargoWeight: 20000,
    cargoVolume: 86,
    cargoType: 'Рефрижератор',
    driverCost: 300000,
    subForwarderPrice: null,
    executorHasVat: true,
    driverPaymentCondition: '15 Календарных дней',
    assignedDriverName: 'Дусанов Абдисаттар Ургенишбаевич',
    assignedDriverPhone: '+7 (771) 418-66-63',
    assignedDriverPlate: '289 ADZ 10',
    assignedDriverTrailer: '89 AAZ 10',
    vehicleModel: 'Volvo',
    driver: null,
    customerCompany: null,
    forwarder: {
        id: COMPANY,
        name: 'ТОО «Alfa Business Solutions»',
        bin: '100340009596',
        address: 'Республика Казахстан, город Астана',
        actualAddress: null,
        phone: '+7 (727) 321-81-69',
        email: 'nursultan@abs.org.kz',
        directorName: 'Нысанов А.Е.',
        bankAccount: 'KZ28296502100011879416',
        bankName: 'Филиал АО «Forte Bank»',
        bankBic: 'IRTYKZKA',
        stampImage: 'uploads/stamp.png',
        signatureImage: 'uploads/sign.png',
    },
    partner: {
        id: CARRIER,
        name: 'ИП Дусанов А У',
        bin: '790201302765',
        address: 'Костанайская область, г. Рудный',
        actualAddress: null,
        phone: '+77006728439',
        email: null,
        directorName: null,
        bankAccount: 'KZ19601A221001617841',
        bankName: 'АО «Народный Банк Казахстана»',
        bankBic: 'HSBKKZKX',
        stampImage: 'uploads/carrier-stamp.png',
        signatureImage: 'uploads/carrier-sign.png',
    },
    subForwarder: null,
    routePoints: [
        {
            pointType: 'PICKUP',
            sequence: 1,
            expectedDate: new Date('2026-07-23'),
            notes: null,
            location: { city: 'г Астана, Казахстан', address: 'ул. Сырымбет, д.35', contactName: null },
        },
        {
            pointType: 'DELIVERY',
            sequence: 2,
            expectedDate: new Date('2026-07-24'),
            notes: null,
            location: { city: 'г Алматы, Казахстан', address: 'ТОО «ЛОГИСТИК ТРАНС АВТО»', contactName: null },
        },
    ],
});

/** Собирает всё, что реально попало в документ через doc.text. */
async function printedText(run: () => Promise<Buffer>) {
    const proto = (PDFDocument as any).prototype;
    const originalText = proto.text;
    const printed: string[] = [];
    proto.text = function (this: any, value: unknown, ...rest: unknown[]) {
        printed.push(String(value));
        return originalText.call(this, value, ...rest);
    };
    try {
        await run();
    } finally {
        proto.text = originalText;
    }
    return printed;
}

function makeService(stampAllowed = false) {
    const prisma: any = { order: { findUnique: jest.fn().mockResolvedValue(order()) } };
    const stampBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
    );
    const stamps: any = {
        loadFor: jest.fn(async (_company: any, allowed: boolean) => (
            allowed && stampAllowed
                ? { stamp: stampBuffer, signature: stampBuffer }
                : { stamp: null, signature: null }
        )),
    };
    return { service: new OrderContractService(prisma, stamps), prisma, stamps, stampBuffer };
}

describe('OrderContractService — договор-заявка', () => {
    it('печатает шапку, номер и дату документа', async () => {
        const { service } = makeService();

        const printed = await printedText(() => service.generatePdf('order-1', COMPANY));

        expect(printed).toContain('ТОО «Alfa Business Solutions»');
        expect(printed).toContain('ДОГОВОР-ЗАЯВКА № AB00003824 от 23 июля 2026 г.');
        expect(printed).toContain('на перевозку груза автотранспортом');
    });

    it('печатает маршрут, места погрузки и разгрузки', async () => {
        const { service } = makeService();

        const printed = await printedText(() => service.generatePdf('order-1', COMPANY));
        const all = printed.join('\n');

        expect(all).toContain('г Астана, Казахстан — г Алматы, Казахстан');
        expect(printed).toContain('1 место: (ПОГРУЗКА)');
        expect(printed).toContain('2 место: (РАЗГРУЗКА)');
        expect(all).toContain('ул. Сырымбет, д.35');
    });

    it('печатает ставку прописью и условия оплаты', async () => {
        const { service } = makeService();

        const all = (await printedText(() => service.generatePdf('order-1', COMPANY))).join('\n');

        // Эталон заказчика: «300 000,00 (Триста тысяч Тенге). Безналичный
        // расчет в т.ч. НДС. По копиям накладных (ТН, ТТН, CMR).»
        expect(all.replace(/ /g, ' ')).toContain('300 000,00 (Триста тысяч тенге)');
        expect(all).toContain('Безналичный расчет в т.ч. НДС.');
        expect(all).toContain('По копиям накладных (ТН, ТТН, CMR).');
        expect(all).toContain('15 Календарных дней');
    });

    it('печатает водителя, тягач и прицеп', async () => {
        const { service } = makeService();

        const all = (await printedText(() => service.generatePdf('order-1', COMPANY))).join('\n');

        expect(all).toContain('Дусанов Абдисаттар Ургенишбаевич');
        expect(all).toContain('289 ADZ 10');
        expect(all).toContain('89 AAZ 10');
        expect(all).toContain('Рефрижератор');
    });

    it('печатает реквизиты обеих сторон', async () => {
        const { service } = makeService();

        const all = (await printedText(() => service.generatePdf('order-1', COMPANY))).join('\n');

        expect(all).toContain('ИП Дусанов А У');
        expect(all).toContain('100340009596');
        expect(all).toContain('790201302765');
        expect(all).toContain('KZ19601A221001617841');
    });

    it('содержит все 15 пунктов прав и обязанностей', async () => {
        const { service } = makeService();

        const all = (await printedText(() => service.generatePdf('order-1', COMPANY))).join('\n');

        expect(all).toContain('4.1.');
        expect(all).toContain('4.15.');
        expect(all).toContain('Арбитражном суде по месту нахождения Истца');
    });

    // Правило T-04: чужую печать система не ставит никогда.
    describe('печать и подпись', () => {
        it('без флажка документ печатается чистым', async () => {
            const { service, stamps } = makeService(true);

            await service.generatePdf('order-1', COMPANY);

            expect(stamps.loadFor).toHaveBeenCalledWith(expect.anything(), false);
        });

        it('с флажком берёт печать только своей стороны — заказчика', async () => {
            const { service, stamps } = makeService(true);

            await service.generatePdf('order-1', COMPANY, { withStamp: true });

            const [company, allowed] = stamps.loadFor.mock.calls[0];
            expect(allowed).toBe(true);
            // Именно наша компания, а не перевозчик: его печать поставить
            // без его участия нельзя.
            expect(company.id).toBe(COMPANY);
            expect(company.stampImage).toBe('uploads/stamp.png');
        });

        it('не печатает договор по чужой заявке', async () => {
            const { service } = makeService();

            await expect(service.generatePdf('order-1', 'company-outsider'))
                .rejects.toThrow('не участвует');
        });
    });
});
