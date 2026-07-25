import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import {
    AccountingDocumentStatus,
    AccountingDocumentType,
    Prisma,
} from '@prisma/client';
import {
    AccountingDocumentPdfService,
    InvoicePdfDocument,
} from '../src/accounting-documents/accounting-document-pdf.service';

const document: InvoicePdfDocument = {
    type: AccountingDocumentType.SERVICE_ACT,
    status: AccountingDocumentStatus.POSTED,
    number: '608',
    documentDate: new Date('2026-07-22'),
    operationDate: new Date('2026-07-22'),
    reportPeriodFrom: new Date('2026-07-01'),
    reportPeriodTo: new Date('2026-07-31'),
    paymentPurposeCode: null,
    paymentTerms: null,
    note: null,
    customerMaterialsInfo: 'Запасы от заказчика не использовались',
    appendixInfo: 'Товарно-транспортная накладная на 1 странице',
    currency: 'KZT',
    subtotal: new Prisma.Decimal('97241.38'),
    vatTotal: new Prisma.Decimal('2758.62'),
    total: new Prisma.Decimal('100000.00'),
    issuerSnapshot: {
        name: 'Товарищество с ограниченной ответственностью «Alfa Business Solutions»',
        bin: '100340000596',
        address: 'Республика Казахстан, город Астана, Алматинский район, ж.м Юго-Восток (Правая Сторона), ул. Сырымбет, д. 35',
        phone: '+7 (7273) 21-81-69',
        directorName: 'Нысанов А.Е.',
    },
    recipientSnapshot: {
        name: 'Товарищество с ограниченной ответственностью «Компания Эврика»',
        bin: '120140015907',
        address: '050060, Республика Казахстан, г. Алматы, Бостандыкский район, ул. Едил Ергожин, здание 27, 6 этаж',
    },
    issuerSignatorySnapshot: {
        position: 'директор',
        name: 'Нысанов А.Е.',
    },
    recipientSignatorySnapshot: null,
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
            description: 'Маршрут: г. Шымкент - г. Тараз; водитель: Амангельды Е.К.; автомобиль: ГАЗ; заявка AB00003767.',
            serviceDate: new Date('2026-07-22'),
            reportDetails: null,
            quantity: new Prisma.Decimal('1.000'),
            unit: 'усл',
            unitPrice: new Prisma.Decimal('80000.00'),
            subtotal: new Prisma.Decimal('80000.00'),
            vatAmount: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('80000.00'),
        },
        {
            serviceCode: '000000003',
            name: 'Экспедиторские услуги',
            description: null,
            serviceDate: new Date('2026-07-22'),
            reportDetails: null,
            quantity: new Prisma.Decimal('1.000'),
            unit: 'усл',
            unitPrice: new Prisma.Decimal('20000.00'),
            subtotal: new Prisma.Decimal('17241.38'),
            vatAmount: new Prisma.Decimal('2758.62'),
            total: new Prisma.Decimal('20000.00'),
        },
    ],
};

async function main() {
    const outputDir = path.resolve(__dirname, '..', '..', '..', 'output', 'pdf');
    await mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'accounting-service-act-r1-sample.pdf');
    const buffer = await new AccountingDocumentPdfService().generateServiceActPdf(document);
    await writeFile(outputPath, buffer);
    process.stdout.write(outputPath);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
