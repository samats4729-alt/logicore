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
    RegistryPdfInput,
    RegistryPdfRow,
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

    // T-04: печать ставится только по флажку и только своей стороны.
    // Раньше договор и доверенность вставляли печати обеих сторон
    // автоматически — это изображает, что документ подписал контрагент.
    describe('печать и подпись', () => {
        // Достаточно, чтобы PDFKit принял картинку как PNG.
        const stampImage = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
        );

        const drawnImages = async (run: () => Promise<Buffer>) => {
            const proto = (PDFDocument as any).prototype;
            const originalImage = proto.image;
            const drawn: unknown[] = [];
            proto.image = function (this: any, src: unknown, ...rest: unknown[]) {
                drawn.push(src);
                return originalImage.call(this, src, ...rest);
            };
            try {
                await run();
            } finally {
                proto.image = originalImage;
            }
            return drawn;
        };

        it('без флажка счёт печатается чистым', async () => {
            const drawn = await drawnImages(() => service.generateInvoicePdf(sampleDocument()));
            expect(drawn).not.toContain(stampImage);
        });

        it('с флажком ставит переданную печать на счёт', async () => {
            const drawn = await drawnImages(
                () => service.generateInvoicePdf(sampleDocument(), stampImage),
            );
            expect(drawn).toContain(stampImage);
        });

        it('с флажком ставит печать на акт ровно один раз — только исполнителю', async () => {
            const act = { ...sampleDocument(), type: AccountingDocumentType.SERVICE_ACT };
            const drawn = await drawnImages(() => service.generateServiceActPdf(act, stampImage));

            // Два блока «М.П.» — свой и контрагента. Печать должна лечь
            // только в один: вторая печать означала бы, что документ
            // подписан обеими сторонами.
            expect(drawn.filter((image) => image === stampImage)).toHaveLength(1);
        });
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

    // T-15: «Печать → Реестр документов» — журнал за период на бумаге.
    // Итог на листе обязан совпадать с итогом на экране, а отменённые
    // документы в него не входят: иначе бухгалтер сверяет разные суммы.
    describe('реестр документов', () => {
        const registryRow = (
            number: string,
            status: AccountingDocumentStatus,
            total: string,
            paid: string,
        ): RegistryPdfRow => ({
            number,
            documentDate: new Date('2026-06-15'),
            status,
            counterpartyName: 'ТОО «Компания Эврика»',
            counterpartyBin: '120140015907',
            orderNumbers: ['AB00003597'],
            total: new Prisma.Decimal(total),
            amountPaid: new Prisma.Decimal(paid),
            balanceDue: new Prisma.Decimal(total).minus(new Prisma.Decimal(paid)),
        });

        const sampleRegistry = (): RegistryPdfInput => ({
            kind: 'OUTGOING_INVOICES',
            companyName: 'ТОО «Alfa Business Solutions»',
            companyBin: '100340000596',
            counterpartyName: null,
            status: null,
            from: new Date('2026-06-01'),
            to: new Date('2026-06-30'),
            selectionOnly: false,
            truncated: false,
            printedAt: new Date('2026-07-26'),
            rows: [
                registryRow('СЧ-2026-000619', AccountingDocumentStatus.POSTED, '100000.00', '40000.00'),
                registryRow('СЧ-2026-000620', AccountingDocumentStatus.DRAFT, '50000.00', '0.00'),
            ],
            totals: {
                amount: new Prisma.Decimal('150000.00'),
                paid: new Prisma.Decimal('40000.00'),
                due: new Prisma.Decimal('110000.00'),
            },
        });

        const printedStrings = async (input: RegistryPdfInput) => {
            const printed: string[] = [];
            const proto = (PDFDocument as any).prototype;
            const originalText = proto.text;
            proto.text = function (this: any, value: unknown, ...rest: unknown[]) {
                printed.push(String(value));
                return originalText.call(this, value, ...rest);
            };
            try {
                await service.generateRegistryPdf(input);
            } finally {
                proto.text = originalText;
            }
            return printed;
        };

        it('создаёт настоящий PDF реестра', async () => {
            const buffer = await service.generateRegistryPdf(sampleRegistry());

            expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
            expect(buffer.length).toBeGreaterThan(5_000);
        });

        it('печатает строки журнала и итог по выборке', async () => {
            const printed = await printedStrings(sampleRegistry());

            expect(printed).toContain('Реестр документов');
            expect(printed).toContain('Счета на оплату, исходящие');
            expect(printed).toContain('СЧ-2026-000619');
            expect(printed).toContain('СЧ-2026-000620');
            expect(printed).toContain('AB00003597');
            expect(printed).toContain('Черновик');
            expect(printed).toContain('Проведён');
            expect(printed.some((line) => line.includes('Всего: 150 000,00'))).toBe(true);
            expect(printed.some((line) => line.includes('Долг: 110 000,00'))).toBe(true);
        });

        it('называет отбор, по которому собран лист', async () => {
            const printed = await printedStrings({
                ...sampleRegistry(),
                counterpartyName: 'ТОО «Компания Эврика»',
                status: AccountingDocumentStatus.POSTED,
                selectionOnly: true,
            });

            const filters = printed.find((line) => line.startsWith('Период:')) || '';
            expect(filters).toContain('01.06.2026');
            expect(filters).toContain('30.06.2026');
            expect(filters).toContain('Контрагент: ТОО «Компания Эврика»');
            expect(filters).toContain('Статус: Проведён');
            expect(filters).toContain('Отобранные строки журнала');
        });

        it('пустой период печатается листом без строк, а не ошибкой', async () => {
            const printed = await printedStrings({ ...sampleRegistry(), rows: [], totals: {
                amount: new Prisma.Decimal(0),
                paid: new Prisma.Decimal(0),
                due: new Prisma.Decimal(0),
            } });

            expect(printed).toContain('За выбранный период документов нет');
        });

        it('предупреждает, когда выборка упёрлась в потолок строк', async () => {
            const printed = await printedStrings({ ...sampleRegistry(), truncated: true });

            expect(printed.some((line) => line.includes('Сузьте период'))).toBe(true);
        });
    });
});
