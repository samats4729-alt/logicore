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
    type: AccountingDocumentType.PAYMENT_INVOICE,
    status: AccountingDocumentStatus.POSTED,
    number: '619',
    documentDate: new Date('2026-07-22'),
    paymentPurposeCode: '819',
    paymentTerms: null,
    note: 'Оплата по договору транспортной экспедиции.',
    currency: 'KZT',
    subtotal: new Prisma.Decimal('97241.38'),
    vatTotal: new Prisma.Decimal('2758.62'),
    total: new Prisma.Decimal('100000.00'),
    issuerSnapshot: {
        name: 'Товарищество с ограниченной ответственностью «Alfa Business Solutions»',
        bin: '100340000596',
        address: 'Республика Казахстан, город Астана, Алматинский район, ж.м Юго-Восток (Правая Сторона), ул. Сырымбет, д. 35',
        phone: '+7 (7273) 21-81-69',
        bankAccount: 'KZ13722S00013131565',
        bankName: 'АО «KASPI BANK»',
        bankBic: 'CASPKZKA',
        kbe: '17',
        directorName: 'Нысанов А.Е.',
    },
    recipientSnapshot: {
        name: 'Товарищество с ограниченной ответственностью «Компания Эврика»',
        bin: '120140015907',
        address: '050060, Республика Казахстан, г. Алматы, Бостандыкский район, ул. Едил Ергожин, здание 27, 6 этаж',
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
            description: 'Маршрут: г. Шымкент, Казахстан - г. Тараз, Казахстан; водитель: Амангельды Е.К.; дата: 21.07.2026; заявка: AB00003767.',
            quantity: new Prisma.Decimal('1.000'),
            unit: 'усл',
            unitPrice: new Prisma.Decimal('80000.00'),
            total: new Prisma.Decimal('80000.00'),
        },
        {
            serviceCode: '000000003',
            name: 'Экспедиторские услуги',
            description: null,
            quantity: new Prisma.Decimal('1.000'),
            unit: 'усл',
            unitPrice: new Prisma.Decimal('20000.00'),
            total: new Prisma.Decimal('20000.00'),
        },
    ],
};

async function main() {
    const outputDir = path.resolve(__dirname, '..', '..', '..', 'output', 'pdf');
    await mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'accounting-invoice-sample.pdf');
    const buffer = await new AccountingDocumentPdfService().generateInvoicePdf(document);
    await writeFile(outputPath, buffer);
    process.stdout.write(outputPath);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
