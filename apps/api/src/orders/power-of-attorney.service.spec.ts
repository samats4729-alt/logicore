import * as PDFDocument from 'pdfkit';
import { OrderContractService } from './order-contract.service';
import { OrderDocumentsService } from './order-documents.service';
import { PowerOfAttorneyService } from './power-of-attorney.service';

const COMPANY = 'company-1';

const order = () => ({
    id: 'order-1',
    orderNumber: 'AB00003824',
    createdAt: new Date('2026-07-23'),
    cargoDescription: 'напитки',
    cargoWeight: 20000,
    customerCompanyId: 'company-9',
    forwarderId: COMPANY,
    subForwarderId: null,
    assignedDriverName: 'Дусанов Абдисаттар Ургенишбаевич',
    assignedDriverPlate: '289 ADZ 10',
    assignedDriverTrailer: '89 AAZ 10',
    driver: null,
    customer: null,
    customerCompany: { id: 'company-9', name: 'ТОО «ЛОГИСТИК ТРАНС АВТО»' },
    partner: null,
    subForwarder: null,
    forwarder: {
        id: COMPANY,
        name: 'ТОО «Alfa Business Solutions»',
        bin: '100340009596',
        address: 'Республика Казахстан, город Астана',
        phone: '+7 (727) 321-81-69',
        directorName: 'Нысанов А.Е.',
        bankAccount: 'KZ28296502100011879416',
        bankName: 'Филиал АО «Forte Bank»',
        bankBic: 'IRTYKZKA',
        stampImage: 'uploads/stamp.png',
        signatureImage: 'uploads/sign.png',
    },
    routePoints: [
        {
            pointType: 'PICKUP',
            sequence: 1,
            expectedDate: new Date('2026-07-23'),
            location: { name: 'Склад', city: 'г Астана, Казахстан', address: 'ул. Сырымбет, д.35' },
        },
        {
            pointType: 'DELIVERY',
            sequence: 2,
            expectedDate: new Date('2026-07-24'),
            location: { name: null, city: 'г Алматы, Казахстан', address: 'ТОО «ЛОГИСТИК ТРАНС АВТО»' },
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

function makeService() {
    const saved: any[] = [];
    const prisma: any = {
        order: { findUnique: jest.fn().mockResolvedValue(order()) },
        company: { findUnique: jest.fn().mockResolvedValue(null) },
        orderDocument: {
            findFirst: jest.fn(async ({ where, orderBy }: any) => {
                if (orderBy?.version) {
                    const versions = saved.filter((d) => d.orderId === where.orderId && d.kind === where.kind);
                    return versions.length ? versions[versions.length - 1] : null;
                }
                return saved.find((d) => d.id === where.id) ?? null;
            }),
            findMany: jest.fn(async ({ where }: any) => saved
                .filter((d) => !where?.kind || d.kind === where.kind)
                .slice()
                .reverse()
                .map((d) => ({ ...d, createdBy: null, order: { orderNumber: 'AB00003824', status: 'IN_TRANSIT' } }))),
            create: jest.fn(async ({ data }: any) => {
                const row = { id: `doc-${saved.length + 1}`, ...data, createdAt: new Date() };
                saved.push(row);
                return row;
            }),
        },
        $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    const stamps: any = { loadFor: jest.fn(async () => ({ stamp: null, signature: null })) };
    const poa = new PowerOfAttorneyService(prisma, stamps);
    const contracts = new OrderContractService(prisma, stamps);
    const documents = new OrderDocumentsService(prisma, contracts, poa);
    return { poa, documents, prisma, stamps, saved };
}

describe('Доверенность — печать и версии', () => {
    it('печатает бланк М-2 с номером заявки, водителем и эмитентом', async () => {
        const { poa } = makeService();

        const all = (await printedText(() => poa.generatePdf('order-1', COMPANY))).join('\n');

        expect(all).toContain('ДОВЕРЕННОСТЬ № AB00003824');
        expect(all).toContain('Дусанов Абдисаттар Ургенишбаевич');
        expect(all).toContain('Типовая межотраслевая форма № М-2');
        expect(all).toContain('Товарищество с ограниченной ответственностью "Alfa Business Solutions"');
    });

    it('снимок не меняется, когда в заявке поменяли водителя', async () => {
        const { documents, prisma, saved } = makeService();

        await documents.form('POWER_OF_ATTORNEY', 'order-1', COMPANY, 'user-1');

        const changed = order();
        changed.assignedDriverName = 'Другой Водитель Иванович';
        changed.assignedDriverPlate = '999 XXX 01';
        prisma.order.findUnique.mockResolvedValue(changed);

        const all = (await printedText(() => documents.printSaved('doc-1', COMPANY))).join('\n');

        expect(all).toContain('Дусанов Абдисаттар Ургенишбаевич');
        expect(all).not.toContain('Другой Водитель Иванович');
        expect(saved[0].snapshot.driverName).toBe('Дусанов Абдисаттар Ургенишбаевич');
    });

    it('исправленная доверенность добавляется рядом, прежняя остаётся', async () => {
        const { documents, prisma, saved } = makeService();

        await documents.form('POWER_OF_ATTORNEY', 'order-1', COMPANY, 'user-1');
        const changed = order();
        changed.assignedDriverName = 'Другой Водитель Иванович';
        prisma.order.findUnique.mockResolvedValue(changed);
        const second = await documents.form('POWER_OF_ATTORNEY', 'order-1', COMPANY, 'user-1');

        expect(second.version).toBe(2);
        expect(saved).toHaveLength(2);
        expect(saved[0].snapshot.driverName).toBe('Дусанов Абдисаттар Ургенишбаевич');
        expect(saved[1].snapshot.driverName).toBe('Другой Водитель Иванович');
    });

    it('в самом бланке пометки о версии нет', async () => {
        const { documents } = makeService();
        await documents.form('POWER_OF_ATTORNEY', 'order-1', COMPANY, 'user-1');
        await documents.form('POWER_OF_ATTORNEY', 'order-1', COMPANY, 'user-1');

        const all = (await printedText(() => documents.printSaved('doc-2', COMPANY))).join('\n');

        // Официальная бумага одинакова у любой версии: «версия 2» — пометка
        // платформы, а не реквизит бланка М-2.
        expect(all).toContain('ДОВЕРЕННОСТЬ № AB00003824');
        expect(all).not.toMatch(/верси[яию]\s*№?\s*\d/i);
        expect(all).not.toMatch(/исправлени[ея]\s*№\s*\d/i);
    });

    it('договор и доверенность нумеруются независимо', async () => {
        const { documents } = makeService();

        await documents.form('CONTRACT', 'order-1', COMPANY, 'user-1');
        const poaFirst = await documents.form('POWER_OF_ATTORNEY', 'order-1', COMPANY, 'user-1');

        // Иначе первая доверенность по рейсу с договором стала бы «версией 2».
        expect(poaFirst.version).toBe(1);
    });

    it('журнал показывает выданные доверенности и отмечает действующую', async () => {
        const { documents, prisma } = makeService();

        await documents.form('POWER_OF_ATTORNEY', 'order-1', COMPANY, 'user-1');
        const changed = order();
        changed.assignedDriverName = 'Другой Водитель Иванович';
        prisma.order.findUnique.mockResolvedValue(changed);
        await documents.form('POWER_OF_ATTORNEY', 'order-1', COMPANY, 'user-1');

        const rows = await documents.listJournal(COMPANY, { kind: 'POWER_OF_ATTORNEY' as any });

        expect(rows).toHaveLength(2);
        expect(rows[0].version).toBe(2);
        expect(rows[0].isCurrent).toBe(true);
        expect(rows[0].driverName).toBe('Другой Водитель Иванович');
        expect(rows[1].isCurrent).toBe(false);
        expect(rows[1].driverName).toBe('Дусанов Абдисаттар Ургенишбаевич');
    });

    it('без флажка печать и подпись не загружаются вовсе', async () => {
        const { poa, stamps } = makeService();

        await poa.generatePdf('order-1', COMPANY);

        expect(stamps.loadFor).toHaveBeenCalledWith(expect.anything(), false);
    });

    it('чужую печать не ставит даже с флажком', async () => {
        const { poa, stamps } = makeService();

        // Печатает партнёр по рейсу: эмитент доверенности — не он, значит
        // и печать в бланке не его, а ставить чужую система права не имеет.
        await poa.generatePdf('order-1', 'company-partner', { withStamp: true });

        expect(stamps.loadFor).toHaveBeenCalledWith(expect.anything(), false);
    });
});
