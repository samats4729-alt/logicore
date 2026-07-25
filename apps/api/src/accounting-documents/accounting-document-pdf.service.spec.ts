import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import {
    AccountingDocumentStatus,
    AccountingDocumentType,
    Prisma,
} from '@prisma/client';
import {
    AccountingDocumentPdfService,
    InvoicePdfDocument,
} from './accounting-document-pdf.service';

const sampleDocument = (): InvoicePdfDocument => ({
    type: AccountingDocumentType.PAYMENT_INVOICE,
    status: AccountingDocumentStatus.POSTED,
    number: 'СЧ-2026-000619',
    documentDate: new Date('2026-07-22'),
    paymentPurposeCode: '819',
    paymentTerms: null,
    note: null,
    currency: 'KZT',
    subtotal: new Prisma.Decimal('97241.38'),
    vatTotal: new Prisma.Decimal('2758.62'),
    total: new Prisma.Decimal('100000.00'),
    issuerSnapshot: {
        name: 'ТОО «Alfa Business Solutions»',
        bin: '100340000596',
        address: 'Республика Казахстан, г. Астана, ул. Сырымбет, д. 35',
        phone: '+7 (7273) 21-81-69',
        bankAccount: 'KZ13722S00013131565',
        bankName: 'АО «KASPI BANK»',
        bankBic: 'CASPKZKA',
        kbe: '17',
    },
    recipientSnapshot: {
        name: 'ТОО «Компания Эврика»',
        bin: '120140015907',
        address: 'Республика Казахстан, г. Алматы, ул. Едил Ергожин, здание 27',
    },
    basisSnapshot: {
        contractNumber: '17/01',
        startDate: '2020-01-17T00:00:00.000Z',
    },
    createdAt: new Date('2026-07-22T09:00:00.000Z'),
    postedAt: new Date('2026-07-22T10:00:00.000Z'),
    lines: [
        {
            serviceCode: '000000001',
            name: 'Транспортные услуги',
            description: 'Маршрут: г. Шымкент - г. Тараз, водитель Амангельды Е.К.',
            quantity: new Prisma.Decimal(1),
            unit: 'усл',
            unitPrice: new Prisma.Decimal('80000.00'),
            total: new Prisma.Decimal('80000.00'),
        },
        {
            serviceCode: '000000003',
            name: 'Экспедиторские услуги',
            description: null,
            quantity: new Prisma.Decimal(1),
            unit: 'усл',
            unitPrice: new Prisma.Decimal('20000.00'),
            total: new Prisma.Decimal('20000.00'),
        },
    ],
});

describe('AccountingDocumentPdfService', () => {
    const service = new AccountingDocumentPdfService();

    it('создаёт настоящий PDF счёта с кириллицей', async () => {
        const buffer = await service.generateInvoicePdf(sampleDocument());

        expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
        expect(buffer.length).toBeGreaterThan(20_000);
    });

    // T-19: у компании может быть два банка, и в счёт должны попасть
    // реквизиты выбранного счёта — иначе контрагент платит не туда.
    // Снимок документа — единственный источник этих полей, поэтому здесь
    // проверяется, что напечатано именно то, что в снимке.
    it('печатает банковские реквизиты из снимка документа', async () => {
        const printed: string[] = [];
        const proto = (PDFDocument as any).prototype;
        const originalText = proto.text;
        // Пишем в тот же PDF, только попутно запоминая строки: так проверяется
        // настоящий проход печати, а не отдельно вызванный кусок вёрстки.
        proto.text = function (this: any, value: unknown, ...rest: unknown[]) {
            printed.push(String(value));
            return originalText.call(this, value, ...rest);
        };

        try {
            await service.generateInvoicePdf(sampleDocument());
        } finally {
            proto.text = originalText;
        }

        expect(printed).toContain('KZ13722S00013131565');
        expect(printed).toContain('АО «KASPI BANK»');
        expect(printed).toContain('CASPKZKA');
        expect(printed).toContain('17');
    });

    it('не печатает акт через форму счёта', async () => {
        await expect(service.generateInvoicePdf({
            ...sampleDocument(),
            type: AccountingDocumentType.SERVICE_ACT,
        })).rejects.toThrow('только для счёта на оплату');
    });

    it('создаёт PDF акта выполненных работ по форме Р-1', async () => {
        const buffer = await service.generateServiceActPdf({
            ...sampleDocument(),
            type: AccountingDocumentType.SERVICE_ACT,
            number: '608',
            reportPeriodFrom: new Date('2026-07-01'),
            reportPeriodTo: new Date('2026-07-31'),
            customerMaterialsInfo: 'не использовались',
            appendixInfo: 'Товарно-транспортная накладная на 1 странице',
            lines: sampleDocument().lines.map((line, index) => ({
                ...line,
                serviceDate: new Date('2026-07-22'),
                reportDetails: null,
                vatAmount: new Prisma.Decimal(index === 1 ? '2758.62' : '0'),
            })),
        });

        expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
        expect(buffer.length).toBeGreaterThan(20_000);
    });


    // Регрессия: высота строки таблицы считалась по одной ширине и межстрочному
    // интервалу, а текст рисовался по другим (w-6/0.5 против w-8/1). Текст не
    // помещался и молча обрезался по высоте — из официального акта пропадала
    // часть описания услуги: маршрут, автомобиль, номер заявки.
    //
    // Проверяем сам инвариант: высота строки обязана вмещать текст, измеренный
    // ровно теми параметрами, которыми он будет нарисован.
    it('высота строки таблицы вмещает текст, отрисованный теми же параметрами', () => {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape' });
        const fontsDir = path.join(__dirname, '..', 'contracts', 'fonts');
        doc.registerFont('Roboto', path.join(fontsDir, 'Roboto-Regular.ttf'));
        doc.font('Roboto').fontSize(6.2);

        const padX = (AccountingDocumentPdfService as any).CELL_PAD_X as number;
        const padY = (AccountingDocumentPdfService as any).CELL_PAD_Y as number;
        const lineGap = (AccountingDocumentPdfService as any).CELL_LINE_GAP as number;

        const width = 230;
        const text = 'Транспортные услуги\nМаршрут: г. Шымкент - г. Тараз; водитель: Амангельды Е.К.; '
            + 'автомобиль: ГАЗ, г/н 203AEL13; заявка AB00003767; дата разгрузки 22.07.2026.';

        const rowHeight = (service as any).tableRowHeight(doc, [text], [width]) as number;
        const rendered = doc.heightOfString(text, { width: width - padX * 2, lineGap });

        // tableCell рисует текст в области height - padY * 2, начиная с y + padY
        expect(rowHeight - padY * 2).toBeGreaterThanOrEqual(rendered);
    });

    it('создаёт PDF акта сверки с оборотами и конечным сальдо', async () => {
        const buffer = await service.generateReconciliationActPdf({
            ...sampleDocument(),
            type: AccountingDocumentType.RECONCILIATION_ACT,
            number: 'СВ-2026-000031',
            reportPeriodFrom: new Date('2026-01-01'),
            reportPeriodTo: new Date('2026-07-31'),
            openingBalance: new Prisma.Decimal('0'),
            debitTurnover: new Prisma.Decimal('1420000.00'),
            creditTurnover: new Prisma.Decimal('900000.00'),
            closingBalance: new Prisma.Decimal('520000.00'),
            lines: [],
            reconciliationLines: [
                {
                    lineNumber: 1,
                    transactionDate: new Date('2026-05-26'),
                    sourceDocumentType: 'Акт выполненных работ',
                    sourceDocumentNumber: 'AB00000394',
                    description: 'Транспортные услуги по заявке AB00002614',
                    debit: new Prisma.Decimal('900000.00'),
                    credit: new Prisma.Decimal('0'),
                    runningBalance: new Prisma.Decimal('900000.00'),
                },
                {
                    lineNumber: 2,
                    transactionDate: new Date('2026-07-10'),
                    sourceDocumentType: 'Платёж',
                    sourceDocumentNumber: 'ПП-819',
                    description: 'Оплата транспортных услуг',
                    debit: new Prisma.Decimal('0'),
                    credit: new Prisma.Decimal('900000.00'),
                    runningBalance: new Prisma.Decimal('0'),
                },
                {
                    lineNumber: 3,
                    transactionDate: new Date('2026-07-14'),
                    sourceDocumentType: 'Акт выполненных работ',
                    sourceDocumentNumber: 'AB00000552',
                    description: 'Транспортные услуги по заявке AB00003597',
                    debit: new Prisma.Decimal('520000.00'),
                    credit: new Prisma.Decimal('0'),
                    runningBalance: new Prisma.Decimal('520000.00'),
                },
            ],
        });

        expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
        expect(buffer.length).toBeGreaterThan(20_000);
    });
});
