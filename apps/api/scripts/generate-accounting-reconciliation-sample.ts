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

const openingBalance = new Prisma.Decimal('0');
const operations = [
    ['2026-05-26', 'Акт', 'AB00000394', 'Заявка AB00002614; Караганда - Алматы; водитель Салимгереев Ж.А.', '900000', '0'],
    ['2026-06-09', 'Акт', 'AB00000428', 'Заявка AB00002895; Караганда - Щучинск - Караганда; водитель Резников А.С.', '520000', '0'],
    ['2026-06-10', 'Акт', 'AB00000431', 'Заявка AB00002912; Караганда - Астана - Караганда; водитель Исаев С.О.', '310000', '0'],
    ['2026-06-23', 'Акт', 'AB00000488', 'Заявка AB00003225; Караганда - Астана; водитель Лысенко А.К.', '210000', '0'],
    ['2026-06-24', 'Акт', 'AB00000489', 'Заявка AB00003247; Караганда - Астана; водитель Абдирашитов Ж.А.', '220000', '0'],
    ['2026-06-30', 'Акт', 'AB00000506', 'Заявка AB00003372; Караганда - Астана; водитель Резников А.С.', '440000', '0'],
    ['2026-07-10', 'Платёжное поручение', 'ПП-819', 'Оплата транспортных услуг', '0', '900000'],
    ['2026-07-14', 'Акт', 'AB00000552', 'Заявка AB00003597; Караганда - Астана; водитель Сафонов А.В.', '220000', '0'],
] as const;

let runningBalance = openingBalance;
const reconciliationLines = operations.map((operation, index) => {
    const debit = new Prisma.Decimal(operation[4]);
    const credit = new Prisma.Decimal(operation[5]);
    runningBalance = runningBalance.plus(debit).minus(credit);
    return {
        lineNumber: index + 1,
        transactionDate: new Date(operation[0]),
        sourceDocumentType: operation[1],
        sourceDocumentNumber: operation[2],
        description: operation[3],
        debit,
        credit,
        runningBalance,
    };
});

const debitTurnover = reconciliationLines.reduce(
    (sum, line) => sum.plus(line.debit),
    new Prisma.Decimal(0),
);
const creditTurnover = reconciliationLines.reduce(
    (sum, line) => sum.plus(line.credit),
    new Prisma.Decimal(0),
);

const document: InvoicePdfDocument = {
    type: AccountingDocumentType.RECONCILIATION_ACT,
    status: AccountingDocumentStatus.POSTED,
    number: 'СВ-2026-000031',
    documentDate: new Date('2026-07-31'),
    reportPeriodFrom: new Date('2026-01-01'),
    reportPeriodTo: new Date('2026-07-31'),
    paymentPurposeCode: null,
    paymentTerms: null,
    note: 'Настоящий акт составлен в двух экземплярах, по одному для каждой стороны.',
    currency: 'KZT',
    subtotal: new Prisma.Decimal(0),
    vatTotal: new Prisma.Decimal(0),
    total: new Prisma.Decimal(0),
    openingBalance,
    debitTurnover,
    creditTurnover,
    closingBalance: runningBalance,
    issuerSnapshot: {
        name: 'Товарищество с ограниченной ответственностью «Alfa Business Solutions»',
        bin: '100340000596',
        address: 'Республика Казахстан, город Астана, ул. Сырымбет, д. 35',
        directorName: 'Нысанов А.Е.',
    },
    recipientSnapshot: {
        name: 'АО «ИП ЭФЕС КАЗАХСТАН (Караганда)»',
        bin: '980540001261',
        address: 'Республика Казахстан, город Караганда',
    },
    issuerSignatorySnapshot: {
        position: 'директор',
        name: 'Нысанов А.Е.',
    },
    recipientSignatorySnapshot: null,
    basisSnapshot: null,
    createdAt: new Date('2026-07-31T09:00:00.000Z'),
    postedAt: new Date('2026-07-31T10:00:00.000Z'),
    lines: [],
    reconciliationLines,
};

async function main() {
    const outputDir = path.resolve(__dirname, '..', '..', '..', 'output', 'pdf');
    await mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'accounting-reconciliation-act-sample.pdf');
    const buffer = await new AccountingDocumentPdfService().generateReconciliationActPdf(document);
    await writeFile(outputPath, buffer);
    process.stdout.write(outputPath);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
