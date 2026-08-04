import { BadRequestException, Injectable } from '@nestjs/common';
import {
    AccountingDocumentStatus,
    AccountingDocumentType,
    Prisma,
} from '@prisma/client';
import { pluralForm, wordsFor } from './currency-words';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';

/**
 * Единственный цвет печатных форм.
 *
 * Акт Р-1 — бланк, утверждённый приказом Минфина РК от 20.12.2012 № 562.
 * В официальном бланке нет ни заливок, ни полутонов: только чёрные линии и
 * чёрный текст на белом. Раньше здесь использовались шесть оттенков серого
 * для текста и голубая заливка шапки таблицы — документ выглядел блёклым и
 * непохожим на утверждённую форму.
 */
const INK = '#000000';

interface InvoicePdfLine {
    serviceCode: string | null;
    name: string;
    description: string | null;
    quantity: Prisma.Decimal;
    unit: string;
    unitPrice: Prisma.Decimal;
    subtotal?: Prisma.Decimal;
    vatAmount?: Prisma.Decimal;
    total: Prisma.Decimal;
    serviceDate?: Date | null;
    reportDetails?: string | null;
}

interface ReconciliationPdfLine {
    lineNumber: number;
    transactionDate: Date;
    sourceDocumentType: string | null;
    sourceDocumentNumber: string | null;
    description: string | null;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    runningBalance: Prisma.Decimal;
}

export interface InvoicePdfDocument {
    type: AccountingDocumentType;
    status: AccountingDocumentStatus;
    number: string;
    documentDate: Date;
    operationDate?: Date | null;
    reportPeriodFrom?: Date | null;
    reportPeriodTo?: Date | null;
    paymentPurposeCode: string | null;
    paymentTerms: string | null;
    note: string | null;
    customerMaterialsInfo?: string | null;
    appendixInfo?: string | null;
    currency: string;
    /** Курс к учётной валюте, зафиксированный в документе. */
    exchangeRate?: Prisma.Decimal | null;
    exchangeRateDate?: Date | string | null;
    totalBase?: Prisma.Decimal | null;
    subtotal: Prisma.Decimal;
    vatTotal: Prisma.Decimal;
    total: Prisma.Decimal;
    openingBalance?: Prisma.Decimal | null;
    debitTurnover?: Prisma.Decimal | null;
    creditTurnover?: Prisma.Decimal | null;
    closingBalance?: Prisma.Decimal | null;
    issuerSnapshot: Prisma.JsonValue;
    recipientSnapshot: Prisma.JsonValue;
    issuerSignatorySnapshot?: Prisma.JsonValue | null;
    recipientSignatorySnapshot?: Prisma.JsonValue | null;
    basisSnapshot: Prisma.JsonValue | null;
    createdAt: Date;
    postedAt: Date | null;
    lines: InvoicePdfLine[];
    reconciliationLines?: ReconciliationPdfLine[];
}

/** Строка реестра — то же, что строка журнала на экране. */
export interface RegistryPdfRow {
    number: string;
    documentDate: Date;
    status: AccountingDocumentStatus;
    counterpartyName: string | null;
    counterpartyBin: string | null;
    orderNumbers: string[];
    total: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    balanceDue: Prisma.Decimal;
}

/** Какой журнал печатается — заголовок формы и её смысл. */
export type RegistryKind =
    | 'OUTGOING_INVOICES'
    | 'INCOMING_INVOICES'
    | 'SERVICE_ACTS'
    | 'DOCUMENTS';

export interface RegistryPdfInput {
    kind: RegistryKind;
    companyName: string | null;
    companyBin: string | null;
    counterpartyName: string | null;
    status: AccountingDocumentStatus | null;
    from: Date | null;
    to: Date | null;
    /** Печатаются только отмеченные в журнале строки. */
    selectionOnly: boolean;
    /** Выборка упёрлась в потолок строк — в форме об этом сказано прямо. */
    truncated: boolean;
    printedAt: Date;
    rows: RegistryPdfRow[];
    totals: { amount: Prisma.Decimal; paid: Prisma.Decimal; due: Prisma.Decimal };
}

const REGISTRY_TITLES: Record<RegistryKind, string> = {
    OUTGOING_INVOICES: 'Счета на оплату, исходящие',
    INCOMING_INVOICES: 'Счета на оплату, входящие',
    SERVICE_ACTS: 'Акты выполненных работ',
    DOCUMENTS: 'Бухгалтерские документы',
};

/** Термины журнала 1С — бухгалтер сверяет бумагу с экраном. */
const REGISTRY_STATUS_LABELS: Record<AccountingDocumentStatus, string> = {
    [AccountingDocumentStatus.DRAFT]: 'Черновик',
    [AccountingDocumentStatus.POSTED]: 'Проведён',
    [AccountingDocumentStatus.CANCELLED]: 'Отменён',
};

interface PartySnapshot {
    name?: string | null;
    bin?: string | null;
    address?: string | null;
    actualAddress?: string | null;
    phone?: string | null;
    email?: string | null;
    directorName?: string | null;
    bankAccount?: string | null;
    bankName?: string | null;
    bankBic?: string | null;
    kbe?: string | null;
    vatCertificateSeries?: string | null;
    vatCertificateNumber?: string | null;
    vatCertificateDate?: string | Date | null;
}

@Injectable()
export class AccountingDocumentPdfService {
    /**
     * `stamp` — картинка печати НАШЕЙ компании, если бухгалтер попросил
     * печатать «с подписью и печатью». Решение, можно ли её ставить,
     * принимает вызывающий код: сюда она доходит уже только своя.
     */
    async generatePdf(document: InvoicePdfDocument, stamp?: Buffer | null): Promise<Buffer> {
        if (document.type === AccountingDocumentType.PAYMENT_INVOICE) {
            return this.generateInvoicePdf(document, stamp);
        }
        if (document.type === AccountingDocumentType.SERVICE_ACT) {
            return this.generateServiceActPdf(document, stamp);
        }
        if (document.type === AccountingDocumentType.RECONCILIATION_ACT) {
            return this.generateReconciliationActPdf(document);
        }
        throw new BadRequestException('Печатная форма для этого типа документа ещё не реализована');
    }

    async generateInvoicePdf(document: InvoicePdfDocument, stamp?: Buffer | null): Promise<Buffer> {
        if (document.type !== AccountingDocumentType.PAYMENT_INVOICE) {
            throw new BadRequestException('Эта печатная форма предназначена только для счёта на оплату');
        }
        if (!document.lines.length) {
            throw new BadRequestException('Нельзя сформировать счёт без строк');
        }

        const issuer = this.party(document.issuerSnapshot);
        const recipient = this.party(document.recipientSnapshot);
        const basis = this.record(document.basisSnapshot);
        const creationDate = document.postedAt ?? document.createdAt;

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 28, bottom: 36, left: 32, right: 32 },
                bufferPages: true,
                compress: true,
                info: {
                    Title: `Счёт на оплату № ${document.number}`,
                    Author: issuer.name || 'LogiCore',
                    Subject: 'Счёт на оплату',
                    CreationDate: creationDate,
                    ModDate: creationDate,
                },
            });
            const fontsDir = path.join(__dirname, '..', 'contracts', 'fonts');
            doc.registerFont('Roboto', path.join(fontsDir, 'Roboto-Regular.ttf'));
            doc.registerFont('Roboto-Bold', path.join(fontsDir, 'Roboto-Bold.ttf'));

            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const drawDraftWatermark = () => {
                if (document.status !== AccountingDocumentStatus.DRAFT) return;
                // doc.save()/restore() возвращают цвет и поворот, но не
                // курсор текста: после надписи посреди листа он остаётся
                // там же, и весь документ печатался с середины страницы.
                const cursorX = doc.x;
                const cursorY = doc.y;
                doc.save();
                doc.opacity(0.07);
                doc.font('Roboto-Bold').fontSize(54).fillColor('#6b7280');
                doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
                doc.text('ЧЕРНОВИК', 70, doc.page.height / 2 - 30, {
                    width: doc.page.width - 140,
                    align: 'center',
                    lineBreak: false,
                });
                doc.restore();
                doc.x = cursorX;
                doc.y = cursorY;
            };
            doc.on('pageAdded', drawDraftWatermark);
            drawDraftWatermark();

            this.drawInvoiceHeader(doc, document, issuer, recipient, basis);
            this.drawInvoiceLines(doc, document.lines, document.number);
            this.drawInvoiceTotals(doc, document);
            this.drawInvoiceFooter(doc, document, issuer, stamp);
            this.addPageNumbers(doc);
            doc.end();
        });
    }

    async generateServiceActPdf(document: InvoicePdfDocument, stamp?: Buffer | null): Promise<Buffer> {
        if (document.type !== AccountingDocumentType.SERVICE_ACT) {
            throw new BadRequestException('Эта печатная форма предназначена только для акта выполненных работ');
        }
        if (!document.lines.length) {
            throw new BadRequestException('Нельзя сформировать акт без строк');
        }

        const issuer = this.party(document.issuerSnapshot);
        const recipient = this.party(document.recipientSnapshot);
        const issuerSignatory = this.record(document.issuerSignatorySnapshot ?? null);
        const recipientSignatory = this.record(document.recipientSignatorySnapshot ?? null);
        const basis = this.record(document.basisSnapshot);
        const creationDate = document.postedAt ?? document.createdAt;

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                layout: 'landscape',
                margins: { top: 22, bottom: 32, left: 24, right: 24 },
                bufferPages: true,
                compress: true,
                info: {
                    Title: `Акт выполненных работ № ${document.number}`,
                    Author: issuer.name || 'LogiCore',
                    Subject: 'Форма Р-1',
                    CreationDate: creationDate,
                    ModDate: creationDate,
                },
            });
            const fontsDir = path.join(__dirname, '..', 'contracts', 'fonts');
            doc.registerFont('Roboto', path.join(fontsDir, 'Roboto-Regular.ttf'));
            doc.registerFont('Roboto-Bold', path.join(fontsDir, 'Roboto-Bold.ttf'));

            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const drawDraftWatermark = () => {
                if (document.status !== AccountingDocumentStatus.DRAFT) return;
                // См. выше: курсор текста надо вернуть руками.
                const cursorX = doc.x;
                const cursorY = doc.y;
                doc.save();
                doc.opacity(0.07);
                doc.font('Roboto-Bold').fontSize(58).fillColor('#6b7280');
                doc.rotate(-25, { origin: [doc.page.width / 2, doc.page.height / 2] });
                doc.text('ЧЕРНОВИК', 130, doc.page.height / 2 - 30, {
                    width: doc.page.width - 260,
                    align: 'center',
                    lineBreak: false,
                });
                doc.restore();
                doc.x = cursorX;
                doc.y = cursorY;
            };
            doc.on('pageAdded', drawDraftWatermark);
            drawDraftWatermark();

            this.drawServiceActHeader(doc, document, issuer, recipient, basis);
            this.drawServiceActLines(doc, document);
            this.drawServiceActFooter(
                stamp,
                doc,
                document,
                issuer,
                recipient,
                issuerSignatory,
                recipientSignatory,
            );
            this.addPageNumbers(doc);
            doc.end();
        });
    }

    async generateReconciliationActPdf(document: InvoicePdfDocument): Promise<Buffer> {
        if (document.type !== AccountingDocumentType.RECONCILIATION_ACT) {
            throw new BadRequestException('Эта печатная форма предназначена только для акта сверки');
        }
        if (!document.reportPeriodFrom || !document.reportPeriodTo) {
            throw new BadRequestException('Нельзя сформировать акт сверки без отчётного периода');
        }

        const issuer = this.party(document.issuerSnapshot);
        const recipient = this.party(document.recipientSnapshot);
        const issuerSignatory = this.record(document.issuerSignatorySnapshot ?? null);
        const recipientSignatory = this.record(document.recipientSignatorySnapshot ?? null);
        const creationDate = document.postedAt ?? document.createdAt;

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                layout: 'landscape',
                margins: { top: 28, bottom: 34, left: 30, right: 30 },
                bufferPages: true,
                compress: true,
                info: {
                    Title: `Акт сверки взаимных расчётов № ${document.number}`,
                    Author: issuer.name || 'LogiCore',
                    Subject: 'Акт сверки взаимных расчётов',
                    CreationDate: creationDate,
                    ModDate: creationDate,
                },
            });
            const fontsDir = path.join(__dirname, '..', 'contracts', 'fonts');
            doc.registerFont('Roboto', path.join(fontsDir, 'Roboto-Regular.ttf'));
            doc.registerFont('Roboto-Bold', path.join(fontsDir, 'Roboto-Bold.ttf'));

            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const drawDraftWatermark = () => {
                if (document.status !== AccountingDocumentStatus.DRAFT) return;
                // См. выше: курсор текста надо вернуть руками.
                const cursorX = doc.x;
                const cursorY = doc.y;
                doc.save();
                doc.opacity(0.07);
                doc.font('Roboto-Bold').fontSize(58).fillColor('#6b7280');
                doc.rotate(-25, { origin: [doc.page.width / 2, doc.page.height / 2] });
                doc.text('ЧЕРНОВИК', 130, doc.page.height / 2 - 30, {
                    width: doc.page.width - 260,
                    align: 'center',
                    lineBreak: false,
                });
                doc.restore();
                doc.x = cursorX;
                doc.y = cursorY;
            };
            doc.on('pageAdded', drawDraftWatermark);
            drawDraftWatermark();

            this.drawReconciliationHeader(doc, document, issuer, recipient);
            this.drawReconciliationLines(doc, document);
            this.drawReconciliationFooter(
                doc,
                document,
                issuer,
                recipient,
                issuerSignatory,
                recipientSignatory,
            );
            this.addPageNumbers(doc);
            doc.end();
        });
    }

    /**
     * «Печать → Реестр документов» в 1С: сам журнал на бумаге.
     *
     * Это не первичный документ, а внутренняя опись — утверждённого бланка у
     * неё нет, поэтому форма свободная. Лист альбомный: колонок девять, и в
     * книжной ориентации маршрут с контрагентом сминались бы в столбик.
     */
    async generateRegistryPdf(input: RegistryPdfInput): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                layout: 'landscape',
                margins: { top: 28, bottom: 32, left: 28, right: 28 },
                bufferPages: true,
                compress: true,
                info: {
                    Title: 'Реестр документов',
                    Author: input.companyName || 'LogiCore',
                    Subject: 'Реестр документов',
                    CreationDate: input.printedAt,
                },
            });
            const fontsDir = path.join(__dirname, '..', 'contracts', 'fonts');
            doc.registerFont('Roboto', path.join(fontsDir, 'Roboto-Regular.ttf'));
            doc.registerFont('Roboto-Bold', path.join(fontsDir, 'Roboto-Bold.ttf'));

            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            this.drawRegistryHeader(doc, input);
            this.drawRegistryTable(doc, input);
            this.drawRegistryFooter(doc, input);
            this.addPageNumbers(doc);
            doc.end();
        });
    }

    private drawRegistryHeader(doc: PDFKit.PDFDocument, input: RegistryPdfInput) {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        doc.font('Roboto-Bold').fontSize(14).fillColor(INK);
        doc.text('Реестр документов', left, doc.y, { width, align: 'center' });
        doc.moveDown(0.2);

        doc.font('Roboto').fontSize(9.5);
        doc.text(REGISTRY_TITLES[input.kind], left, doc.y, { width, align: 'center' });
        doc.moveDown(0.5);

        const organisation = [input.companyName, input.companyBin && `БИН ${input.companyBin}`]
            .filter(Boolean)
            .join(', ');
        if (organisation) {
            doc.font('Roboto').fontSize(9);
            doc.text(`Организация: ${organisation}`, left, doc.y, { width });
        }

        // Отбор печатается рядом с итогом: иначе по листу нельзя понять, за
        // что эта сумма — за квартал, за одного контрагента или за галочки.
        const filters: string[] = [];
        filters.push(`Период: ${input.from ? this.formatDateNumeric(input.from) : '—'} — ${input.to ? this.formatDateNumeric(input.to) : '—'}`);
        if (input.counterpartyName) filters.push(`Контрагент: ${input.counterpartyName}`);
        if (input.status) filters.push(`Статус: ${REGISTRY_STATUS_LABELS[input.status]}`);
        if (input.selectionOnly) filters.push('Отобранные строки журнала');
        doc.font('Roboto').fontSize(9);
        doc.text(filters.join(' · '), left, doc.y, { width });
        doc.moveDown(0.6);
    }

    private drawRegistryTable(doc: PDFKit.PDFDocument, input: RegistryPdfInput) {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        // Ширины подобраны под альбомный A4: суммы фиксированы, контрагенту
        // отдаётся остаток — его название длиннее прочих полей.
        const columns: { title: string; width: number; align?: 'left' | 'right' }[] = [
            { title: '№', width: 26 },
            { title: 'Номер', width: 96 },
            { title: 'Дата', width: 60 },
            { title: 'Контрагент', width: width - 26 - 96 - 60 - 92 - 80 - 80 - 80 - 62 },
            { title: 'Сделка', width: 92 },
            { title: 'Сумма', width: 80, align: 'right' },
            { title: 'Оплачено', width: 80, align: 'right' },
            { title: 'Остаток', width: 80, align: 'right' },
            { title: 'Статус', width: 62 },
        ];

        const drawHead = () => {
            const y = doc.y;
            doc.font('Roboto-Bold').fontSize(8);
            let x = left;
            for (const column of columns) {
                doc.text(column.title, x + 3, y + 3, {
                    width: column.width - 6,
                    align: column.align || 'left',
                    lineBreak: false,
                });
                x += column.width;
            }
            const bottom = y + 15;
            doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.7).strokeColor(INK).stroke();
            doc.moveTo(left, bottom).lineTo(left + width, bottom).lineWidth(0.7).stroke();
            doc.y = bottom + 3;
        };

        drawHead();

        doc.font('Roboto').fontSize(8);
        input.rows.forEach((row, index) => {
            const cells = [
                String(index + 1),
                row.number,
                this.formatDateNumeric(row.documentDate),
                [row.counterpartyName || '—', row.counterpartyBin ? `БИН ${row.counterpartyBin}` : null]
                    .filter(Boolean)
                    .join('\n'),
                row.orderNumbers.length ? row.orderNumbers.join(', ') : '—',
                this.formatMoney(row.total),
                this.formatMoney(row.amountPaid),
                this.formatMoney(row.balanceDue),
                REGISTRY_STATUS_LABELS[row.status],
            ];

            const height = Math.max(
                ...cells.map((text, cellIndex) => doc.heightOfString(text, {
                    width: columns[cellIndex].width - 6,
                })),
                12,
            );

            // Разрыв страницы до отрисовки строки — иначе строка разрежется
            // пополам между листами.
            if (doc.y + height + 6 > doc.page.height - doc.page.margins.bottom - 40) {
                doc.addPage();
                drawHead();
                doc.font('Roboto').fontSize(8);
            }

            const y = doc.y;
            let x = left;
            cells.forEach((text, cellIndex) => {
                doc.text(text, x + 3, y, {
                    width: columns[cellIndex].width - 6,
                    align: columns[cellIndex].align || 'left',
                });
                x += columns[cellIndex].width;
            });
            doc.y = y + height + 4;
            doc.moveTo(left, doc.y - 2).lineTo(left + width, doc.y - 2)
                .lineWidth(0.3).strokeColor('#999999').stroke();
        });

        if (!input.rows.length) {
            doc.font('Roboto').fontSize(9);
            doc.text('За выбранный период документов нет', left, doc.y + 6, { width, align: 'center' });
            doc.moveDown(1);
        }
    }

    private drawRegistryFooter(doc: PDFKit.PDFDocument, input: RegistryPdfInput) {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.7).strokeColor(INK).stroke();
        doc.y += 5;
        doc.font('Roboto-Bold').fontSize(9);
        doc.text(
            `Документов: ${input.rows.length}    Всего: ${this.formatMoney(input.totals.amount)}    `
            + `Оплачено: ${this.formatMoney(input.totals.paid)}    Долг: ${this.formatMoney(input.totals.due)}`,
            left,
            doc.y,
            { width, align: 'right' },
        );

        if (input.truncated) {
            doc.moveDown(0.4);
            doc.font('Roboto').fontSize(8);
            doc.text(
                `Показаны первые ${input.rows.length} документов. Сузьте период, чтобы реестр поместился целиком.`,
                left,
                doc.y,
                { width },
            );
        }

        doc.moveDown(0.6);
        doc.font('Roboto').fontSize(8);
        doc.text(
            `Отменённые документы в итоги не входят. Сформировано ${this.formatDateNumeric(input.printedAt)}.`,
            left,
            doc.y,
            { width },
        );
    }

    private drawReconciliationHeader(
        doc: PDFKit.PDFDocument,
        document: InvoicePdfDocument,
        issuer: PartySnapshot,
        recipient: PartySnapshot,
    ) {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        doc.font('Roboto-Bold').fontSize(14).fillColor(INK);
        doc.text('АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ', left, 31, { width, align: 'center' });
        doc.font('Roboto').fontSize(8).fillColor(INK);
        doc.text(
            `за период с ${this.formatDateNumeric(document.reportPeriodFrom!)} по ${this.formatDateNumeric(document.reportPeriodTo!)}`,
            left,
            52,
            { width, align: 'center' },
        );
        doc.font('Roboto-Bold').fontSize(8.5).fillColor(INK);
        doc.text(`№ ${document.number} от ${this.formatDateNumeric(document.documentDate)}`, left, 68, {
            width,
            align: 'center',
        });

        const gap = 14;
        const blockWidth = (width - gap) / 2;
        const boxY = 89;
        const boxHeight = 58;
        this.drawReconciliationPartyBox(doc, 'Организация', issuer, left, boxY, blockWidth, boxHeight);
        this.drawReconciliationPartyBox(doc, 'Контрагент', recipient, left + blockWidth + gap, boxY, blockWidth, boxHeight);

        doc.font('Roboto').fontSize(7.2).fillColor(INK);
        doc.text(
            `Мы, нижеподписавшиеся, составили настоящий акт о том, что состояние взаимных расчётов между указанными сторонами за период с ${this.formatDateNumeric(document.reportPeriodFrom!)} по ${this.formatDateNumeric(document.reportPeriodTo!)} соответствует приведённым ниже данным.`,
            left,
            boxY + boxHeight + 10,
            { width, align: 'justify', lineGap: 1 },
        );
        doc.y = boxY + boxHeight + 38;
    }

    private drawReconciliationPartyBox(
        doc: PDFKit.PDFDocument,
        title: string,
        party: PartySnapshot,
        x: number,
        y: number,
        width: number,
        height: number,
    ) {
        doc.roundedRect(x, y, width, height, 4).lineWidth(0.7).strokeColor(INK).stroke();
        doc.font('Roboto-Bold').fontSize(7).fillColor(INK);
        doc.text(title.toUpperCase(), x + 9, y + 7, { width: width - 18 });
        doc.font('Roboto-Bold').fontSize(8).fillColor(INK);
        doc.text(party.name || '—', x + 9, y + 20, { width: width - 18, height: 20 });
        doc.font('Roboto').fontSize(7).fillColor(INK);
        doc.text(`БИН/ИИН: ${party.bin || '—'}`, x + 9, y + 42, { width: 120 });
        const address = party.address || party.actualAddress || 'адрес не указан';
        doc.text(address, x + 137, y + 42, { width: width - 146, height: 11, align: 'right' });
    }

    private drawReconciliationLines(doc: PDFKit.PDFDocument, document: InvoicePdfDocument) {
        const left = doc.page.margins.left;
        const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const widths = [34, 66, 125, 248, 92, 92, contentWidth - 657];
        const headers = ['№', 'Дата', 'Документ', 'Содержание операции', 'Дебет', 'Кредит', 'Сальдо'];
        const headerHeight = 26;

        const drawHeader = () => {
            const y = doc.y;
            let x = left;
            headers.forEach((header, index) => {
                doc.rect(x, y, widths[index], headerHeight).lineWidth(0.5).strokeColor(INK).stroke();
                doc.font('Roboto-Bold').fontSize(7).fillColor(INK);
                const textHeight = doc.heightOfString(header, { width: widths[index] - 6 });
                doc.text(header, x + 3, y + (headerHeight - textHeight) / 2, {
                    width: widths[index] - 6,
                    align: index >= 4 ? 'right' : 'center',
                });
                x += widths[index];
            });
            doc.y = y + headerHeight;
        };

        drawHeader();
        const opening = document.openingBalance ?? new Prisma.Decimal(0);
        this.drawReconciliationRow(doc, widths, [
            '',
            this.formatDateNumeric(document.reportPeriodFrom!),
            '',
            'Сальдо на начало периода',
            '',
            '',
            this.formatMoney(opening),
        ], true);

        for (const line of document.reconciliationLines ?? []) {
            const documentName = [line.sourceDocumentType, line.sourceDocumentNumber]
                .filter(Boolean)
                .join(' № ');
            const values = [
                String(line.lineNumber),
                this.formatDateNumeric(line.transactionDate),
                documentName || '—',
                line.description || '—',
                line.debit.isZero() ? '' : this.formatMoney(line.debit),
                line.credit.isZero() ? '' : this.formatMoney(line.credit),
                this.formatMoney(line.runningBalance),
            ];
            doc.font('Roboto').fontSize(7);
            const rowHeight = Math.max(22, ...values.map((value, index) => doc.heightOfString(value, {
                width: widths[index] - 8,
                lineGap: 0.6,
            }) + 7));
            if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 128) {
                doc.addPage();
                doc.y = doc.page.margins.top + 8;
                doc.font('Roboto-Bold').fontSize(8).fillColor(INK);
                doc.text(`Акт сверки № ${document.number} — продолжение`, left, doc.y, {
                    width: contentWidth,
                    align: 'right',
                });
                doc.moveDown(0.7);
                drawHeader();
            }
            this.drawReconciliationRow(doc, widths, values, false, rowHeight);
        }

        const debit = document.debitTurnover ?? new Prisma.Decimal(0);
        const credit = document.creditTurnover ?? new Prisma.Decimal(0);
        const closing = document.closingBalance ?? opening.plus(debit).minus(credit);
        this.drawReconciliationRow(doc, widths, [
            '', '', '', 'Обороты за период',
            this.formatMoney(debit),
            this.formatMoney(credit),
            '',
        ], true);
        this.drawReconciliationRow(doc, widths, [
            '', '', '', 'Сальдо на конец периода', '', '', this.formatMoney(closing),
        ], true);
    }

    private drawReconciliationRow(
        doc: PDFKit.PDFDocument,
        widths: number[],
        values: string[],
        bold: boolean,
        height = 22,
    ) {
        let x = doc.page.margins.left;
        const y = doc.y;
        values.forEach((value, index) => {
            doc.rect(x, y, widths[index], height).lineWidth(0.45).strokeColor(INK).stroke();
            doc.font(bold ? 'Roboto-Bold' : 'Roboto').fontSize(7).fillColor(INK);
            const textHeight = doc.heightOfString(value, { width: widths[index] - 8, lineGap: 0.6 });
            doc.text(value, x + 4, y + Math.max(4, (height - textHeight) / 2), {
                width: widths[index] - 8,
                height: height - 5,
                align: index >= 4 ? 'right' : index < 3 ? 'center' : 'left',
                lineGap: 0.6,
            });
            x += widths[index];
        });
        doc.y = y + height;
    }

    private drawReconciliationFooter(
        doc: PDFKit.PDFDocument,
        document: InvoicePdfDocument,
        issuer: PartySnapshot,
        recipient: PartySnapshot,
        issuerSignatory: Record<string, unknown>,
        recipientSignatory: Record<string, unknown>,
    ) {
        this.ensureSpace(doc, 80);
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const closing = document.closingBalance ?? new Prisma.Decimal(0);
        const debtText = this.reconciliationDebtText(closing, issuer.name || 'организация', recipient.name || 'контрагент');

        doc.moveDown(0.65);
        doc.font('Roboto-Bold').fontSize(8).fillColor(INK);
        doc.text(`По состоянию на ${this.formatDateNumeric(document.reportPeriodTo!)} ${debtText}`, left, doc.y, {
            width,
        });
        if (document.note) {
            doc.moveDown(0.35);
            doc.font('Roboto').fontSize(7).text(`Примечание: ${document.note}`, left, doc.y, { width });
        }
        doc.moveDown(0.8);

        const gap = 34;
        const blockWidth = (width - gap) / 2;
        const y = doc.y;
        this.actSignatureBlock(
            doc,
            'От организации',
            left,
            y,
            blockWidth,
            this.stringValue(issuerSignatory.position) || 'Руководитель',
            this.stringValue(issuerSignatory.name) || issuer.directorName || '',
        );
        this.actSignatureBlock(
            doc,
            'От контрагента',
            left + blockWidth + gap,
            y,
            blockWidth,
            this.stringValue(recipientSignatory.position) || 'Руководитель',
            this.stringValue(recipientSignatory.name) || recipient.directorName || '',
        );
        doc.font('Roboto-Bold').fontSize(7).text('М.П.', left + 5, y + 47);
        doc.text('М.П.', left + blockWidth + gap + 5, y + 47);
    }

    private reconciliationDebtText(balance: Prisma.Decimal, issuerName: string, recipientName: string) {
        if (balance.isZero()) return 'задолженность между сторонами отсутствует.';
        if (balance.isPositive()) {
            return `задолженность контрагента перед организацией составляет ${this.formatMoney(balance)} тенге (должник: ${recipientName}; кредитор: ${issuerName}).`;
        }
        return `задолженность организации перед контрагентом составляет ${this.formatMoney(balance.abs())} тенге (должник: ${issuerName}; кредитор: ${recipientName}).`;
    }

    private drawServiceActHeader(
        doc: PDFKit.PDFDocument,
        document: InvoicePdfDocument,
        issuer: PartySnapshot,
        recipient: PartySnapshot,
        basis: Record<string, unknown>,
    ) {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const legalWidth = 255;

        doc.font('Roboto').fontSize(6.5).fillColor(INK);
        doc.text(
            'Приложение 50\nк приказу Министра финансов\nРеспублики Казахстан\nот 20 декабря 2012 года № 562',
            left + width - legalWidth,
            18,
            { width: legalWidth, align: 'center', lineGap: 0.5 },
        );
        doc.font('Roboto').fontSize(7.5).fillColor(INK);
        doc.text('Форма Р-1', left + width - 105, 67, { width: 105, align: 'center' });

        let y = 82;
        y = this.drawActPartyRow(doc, 'Заказчик', recipient, y);
        y = this.drawActPartyRow(doc, 'Исполнитель', issuer, y);

        const contractNumber = this.stringValue(basis.contractNumber);
        const contractText = contractNumber
            ? `Договор № ${contractNumber}${this.formatBasisDate(basis.startDate)}`
            : '—';
        const boxWidth = 170;
        const contractLabelWidth = 64;
        const contractY = y + 2;
        doc.font('Roboto').fontSize(7.5).fillColor(INK);
        doc.text('Договор (контракт)', left, contractY, { width: contractLabelWidth });
        doc.font('Roboto-Bold').text(contractText, left + contractLabelWidth, contractY, {
            width: width - contractLabelWidth - boxWidth - 12,
        });

        const boxX = left + width - boxWidth;
        const headerHeight = 18;
        const valueHeight = 20;
        const numberWidth = 88;
        doc.rect(boxX, contractY - 2, boxWidth, headerHeight + valueHeight).lineWidth(0.55).strokeColor(INK).stroke();
        doc.moveTo(boxX + numberWidth, contractY - 2).lineTo(boxX + numberWidth, contractY + headerHeight + valueHeight - 2).stroke();
        doc.moveTo(boxX, contractY + headerHeight - 2).lineTo(boxX + boxWidth, contractY + headerHeight - 2).stroke();
        doc.font('Roboto').fontSize(6).text('Номер документа', boxX + 3, contractY + 2, {
            width: numberWidth - 6,
            align: 'center',
        });
        doc.text('Дата составления', boxX + numberWidth + 3, contractY + 2, {
            width: boxWidth - numberWidth - 6,
            align: 'center',
        });
        doc.font('Roboto-Bold').fontSize(7.5).text(document.number, boxX + 3, contractY + headerHeight + 2, {
            width: numberWidth - 6,
            align: 'center',
        });
        doc.text(this.formatDateNumeric(document.documentDate), boxX + numberWidth + 3, contractY + headerHeight + 2, {
            width: boxWidth - numberWidth - 6,
            align: 'center',
        });

        doc.y = contractY + headerHeight + valueHeight + 8;
        doc.font('Roboto-Bold').fontSize(11).fillColor(INK);
        doc.text('АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)', left, doc.y, {
            width,
            align: 'center',
        });
        // Строки «Отчётный период» в утверждённом бланке Р-1 нет — период
        // документа виден по датам выполнения работ в графе 3.
        doc.moveDown(0.55);
    }

    private drawActPartyRow(
        doc: PDFKit.PDFDocument,
        label: string,
        party: PartySnapshot,
        y: number,
    ) {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const labelWidth = 64;
        const binWidth = 118;
        const partyWidth = width - labelWidth - binWidth - 10;
        const partyText = this.formatParty(party, false);
        doc.font('Roboto-Bold').fontSize(7.2);
        const textHeight = doc.heightOfString(partyText, { width: partyWidth - 8, lineGap: 0.5 });
        const height = Math.max(29, textHeight + 10);

        doc.font('Roboto').fontSize(7.5).fillColor(INK);
        doc.text(label, left, y + 8, { width: labelWidth - 5 });
        doc.font('Roboto-Bold').fontSize(7.2).text(partyText, left + labelWidth, y + 2, {
            width: partyWidth - 8,
            lineGap: 0.5,
        });
        doc.moveTo(left + labelWidth, y + height - 5)
            .lineTo(left + labelWidth + partyWidth - 8, y + height - 5)
            .lineWidth(0.45)
            .strokeColor(INK)
            .stroke();
        doc.font('Roboto').fontSize(5.5).fillColor(INK);
        doc.text('полное наименование, адрес, данные о средствах связи', left + labelWidth, y + height - 3, {
            width: partyWidth - 8,
            align: 'center',
        });

        const binX = left + width - binWidth;
        doc.rect(binX, y, binWidth, height).lineWidth(0.55).strokeColor(INK).stroke();
        doc.font('Roboto').fontSize(6.5).fillColor(INK).text('ИИН/БИН', binX + 3, y + 3, {
            width: binWidth - 6,
            align: 'center',
        });
        doc.font('Roboto-Bold').fontSize(8).fillColor(INK).text(party.bin || '—', binX + 3, y + 15, {
            width: binWidth - 6,
            align: 'center',
        });
        return y + height + 4;
    }

    private drawServiceActLines(doc: PDFKit.PDFDocument, document: InvoicePdfDocument) {
        const left = doc.page.margins.left;
        const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const widths = [32, 230, 62, 112, 48, 45, 72, 94, contentWidth - 695];
        const fullHeaderHeight = 82;

        const drawHeader = () => {
            const y = doc.y;
            const topHeight = 32;
            const subHeight = 36;
            const numberHeight = fullHeaderHeight - topHeight - subHeight;
            const fixedHeaders = [
                'Номер по порядку',
                'Наименование работ (услуг) (в разрезе их подвидов в соответствии с технической спецификацией, заданием, графиком выполнения работ (услуг) при их наличии)',
                'Дата выполнения работ (оказания услуг)',
                'Сведения об отчете о научных исследованиях, маркетинговых, консультационных и прочих услугах (дата, номер, количество страниц) (при их наличии)',
                'Единица измерения',
            ];
            let x = left;
            fixedHeaders.forEach((header, index) => {
                this.actHeaderCell(doc, header, x, y, widths[index], topHeight + subHeight, index === 1 ? 5.1 : 5.5);
                x += widths[index];
            });
            const groupWidth = widths.slice(5).reduce((sum, value) => sum + value, 0);
            this.actHeaderCell(doc, 'Выполнено работ (оказано услуг)', x, y, groupWidth, topHeight, 6.2);
            const subHeaders = ['количество', 'цена за единицу', 'стоимость', 'в том числе НДС, в тенге'];
            subHeaders.forEach((header, offset) => {
                this.actHeaderCell(doc, header, x, y + topHeight, widths[offset + 5], subHeight, 5.7);
                x += widths[offset + 5];
            });

            x = left;
            widths.forEach((columnWidth, index) => {
                this.actHeaderCell(doc, String(index + 1), x, y + topHeight + subHeight, columnWidth, numberHeight, 5.5);
                x += columnWidth;
            });
            doc.y = y + fullHeaderHeight;
        };

        drawHeader();
        document.lines.forEach((line, index) => {
            const name = line.description ? `${line.name}\n${line.description}` : line.name;
            const values = [
                String(index + 1),
                name,
                this.formatDateNumeric(line.serviceDate ?? document.operationDate ?? document.documentDate),
                line.reportDetails || '',
                line.unit,
                this.formatQuantity(line.quantity),
                this.formatMoney(line.unitPrice),
                this.formatMoney(line.total),
                this.formatMoney(line.vatAmount ?? new Prisma.Decimal(0)),
            ];
            doc.font('Roboto').fontSize(6.2);
            const rowHeight = this.tableRowHeight(doc, values, widths);
            if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 125) {
                doc.addPage();
                doc.y = doc.page.margins.top + 5;
                doc.font('Roboto-Bold').fontSize(8).text(
                    `Продолжение акта № ${document.number} от ${this.formatDateNumeric(document.documentDate)}`,
                    left,
                    doc.y,
                    { width: contentWidth, align: 'right' },
                );
                doc.moveDown(0.35);
                drawHeader();
            }
            const y = doc.y;
            let x = left;
            values.forEach((value, column) => {
                const align = [0, 2, 4, 5].includes(column) ? 'center' : column >= 6 ? 'right' : 'left';
                doc.font('Roboto').fontSize(6.2);
                this.tableCell(doc, value, x, y, widths[column], rowHeight, align);
                x += widths[column];
            });
            doc.y = y + rowHeight;
        });

        const totalY = doc.y;
        const labelWidth = widths.slice(0, 5).reduce((sum, value) => sum + value, 0);
        const totalQuantity = document.lines.reduce(
            (sum, line) => sum.plus(line.quantity),
            new Prisma.Decimal(0),
        );
        const totals = [
            'Итого',
            this.formatQuantity(totalQuantity),
            'x',
            this.formatMoney(document.total),
            this.formatMoney(document.vatTotal),
        ];
        let x = left;
        doc.font('Roboto-Bold').fontSize(6.5);
        this.tableCell(doc, totals[0], x, totalY, labelWidth, 18, 'right');
        x += labelWidth;
        totals.slice(1).forEach((value, index) => {
            this.tableCell(doc, value, x, totalY, widths[index + 5], 18, index === 0 ? 'center' : 'right');
            x += widths[index + 5];
        });
        doc.y = totalY + 18;
    }

    private drawServiceActFooter(
        stamp: Buffer | null | undefined,
        doc: PDFKit.PDFDocument,
        document: InvoicePdfDocument,
        issuer: PartySnapshot,
        recipient: PartySnapshot,
        issuerSignatory: Record<string, unknown>,
        recipientSignatory: Record<string, unknown>,
    ) {
        this.ensureSpace(doc, 125);
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.moveDown(0.55);
        doc.font('Roboto').fontSize(6.8).fillColor(INK);
        this.actInfoLine(
            doc,
            'Сведения об использовании запасов, полученных от заказчика',
            document.customerMaterialsInfo || '',
            'наименование, количество, стоимость',
        );
        this.actInfoLine(
            doc,
            'Приложение: Перечень документации, в том числе отчет(ы) о маркетинговых, научных исследованиях, '
            + 'консультационных и прочих услугах (обязательны при его (их) наличии)',
            document.appendixInfo || '',
        );
        doc.moveDown(0.55);

        const gap = 34;
        const blockWidth = (width - gap) / 2;
        const y = doc.y;
        this.actSignatureBlock(
            doc,
            'Сдал (Исполнитель)',
            left,
            y,
            blockWidth,
            this.stringValue(issuerSignatory.position) || 'Руководитель',
            this.stringValue(issuerSignatory.name) || issuer.directorName || '',
        );
        this.actSignatureBlock(
            doc,
            'Принял (Заказчик)',
            left + blockWidth + gap,
            y,
            blockWidth,
            this.stringValue(recipientSignatory.position) || 'Руководитель',
            this.stringValue(recipientSignatory.name) || recipient.directorName || '',
        );
        doc.font('Roboto-Bold').fontSize(7).text('М.П.', left + 5, y + 47);
        doc.text('М.П.', left + blockWidth + gap + 5, y + 47);
        doc.font('Roboto').fontSize(6.5).text(
            `Дата подписания (принятия) работ (услуг): ${this.formatDateNumeric(document.documentDate)}`,
            left + blockWidth + gap,
            y + 47,
            { width: blockWidth, align: 'right' },
        );
        // Печать только исполнителя, то есть наша. «М.П.» заказчика
        // остаётся пустым местом под его настоящую печать.
        this.drawStamp(doc, stamp, left + 18, y + 6);
    }

    private actHeaderCell(
        doc: PDFKit.PDFDocument,
        value: string,
        x: number,
        y: number,
        width: number,
        height: number,
        fontSize: number,
    ) {
        doc.rect(x, y, width, height).lineWidth(0.45).strokeColor(INK).stroke();
        doc.font('Roboto').fontSize(fontSize).fillColor(INK);
        const textHeight = doc.heightOfString(value, { width: width - 5, lineGap: 0.2 });
        doc.text(value, x + 2.5, y + Math.max(2, (height - textHeight) / 2), {
            width: width - 5,
            height: height - 3,
            align: 'center',
            lineGap: 0.2,
        });
    }

    private actInfoLine(doc: PDFKit.PDFDocument, label: string, value: string, caption?: string) {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const y = doc.y;
        const labelWidth = 330;
        const lineY = y + 10;
        doc.text(label, left, y, { width: labelWidth });
        doc.font('Roboto-Bold').text(value, left + labelWidth, y, { width: width - labelWidth });
        doc.moveTo(left + labelWidth, lineY).lineTo(left + width, lineY).lineWidth(0.4).strokeColor(INK).stroke();
        doc.font('Roboto');
        if (caption) {
            // Пояснение под линией — часть бланка, а не подсказка интерфейса.
            doc.fontSize(5.5).text(caption, left + labelWidth, lineY + 1.5, {
                width: width - labelWidth,
                align: 'center',
            });
            doc.fontSize(6.8);
            doc.y = lineY + 10;
            return;
        }
        doc.y = y + 17;
    }

    private actSignatureBlock(
        doc: PDFKit.PDFDocument,
        title: string,
        x: number,
        y: number,
        width: number,
        position: string,
        name: string,
    ) {
        doc.font('Roboto-Bold').fontSize(7).fillColor(INK).text(title, x, y, { width: 92 });
        doc.font('Roboto').fontSize(6.8).text(position, x + 95, y, { width: 82, align: 'center' });
        doc.text('', x + 182, y, { width: 75 });
        doc.text(name || '________________', x + 262, y, { width: width - 262, align: 'center' });
        doc.moveTo(x + 95, y + 11).lineTo(x + 177, y + 11).stroke();
        doc.moveTo(x + 182, y + 11).lineTo(x + 257, y + 11).stroke();
        doc.moveTo(x + 262, y + 11).lineTo(x + width, y + 11).stroke();
        doc.font('Roboto').fontSize(5.2).fillColor(INK);
        doc.text('должность', x + 95, y + 13, { width: 82, align: 'center' });
        doc.text('подпись', x + 182, y + 13, { width: 75, align: 'center' });
        doc.text('расшифровка подписи', x + 262, y + 13, { width: width - 262, align: 'center' });
    }

    private formatDateNumeric(date: Date) {
        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(date);
    }

    private drawInvoiceHeader(
        doc: PDFKit.PDFDocument,
        document: InvoicePdfDocument,
        issuer: PartySnapshot,
        recipient: PartySnapshot,
        basis: Record<string, unknown>,
    ) {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        doc.font('Roboto').fontSize(8).fillColor(INK);
        doc.text(
            document.paymentTerms
                || 'Оплата данного счёта означает согласие с условиями оказания услуг. Уведомление об оплате обязательно.',
            left + 35,
            doc.y,
            { width: width - 70, align: 'center', lineGap: 1 },
        );
        doc.moveDown(1.1);

        const bankY = doc.y;
        const bankH = 86;
        const bankLeftW = width * 0.61;
        const bankMiddleW = width * 0.21;
        const bankRightW = width - bankLeftW - bankMiddleW;
        doc.lineWidth(0.7).strokeColor(INK).fillColor(INK);
        doc.rect(left, bankY, width, bankH).stroke();
        doc.moveTo(left + bankLeftW, bankY).lineTo(left + bankLeftW, bankY + bankH).stroke();
        doc.moveTo(left + bankLeftW + bankMiddleW, bankY).lineTo(left + bankLeftW + bankMiddleW, bankY + bankH).stroke();
        doc.moveTo(left, bankY + 50).lineTo(left + bankLeftW, bankY + 50).stroke();
        doc.moveTo(left + bankLeftW, bankY + 43).lineTo(left + width, bankY + 43).stroke();

        doc.font('Roboto-Bold').fontSize(8);
        doc.text('Бенефициар:', left + 4, bankY + 4, { width: bankLeftW - 8 });
        doc.text(issuer.name || '—', left + 4, bankY + 15, { width: bankLeftW - 8 });
        doc.font('Roboto').fontSize(8);
        doc.text(`БИН/ИИН: ${issuer.bin || '—'}`, left + 4, bankY + 37, { width: bankLeftW - 8 });
        doc.text('Банк бенефициара:', left + 4, bankY + 55, { width: bankLeftW - 8 });
        doc.font('Roboto-Bold').text(issuer.bankName || '—', left + 4, bankY + 67, { width: bankLeftW - 8 });

        this.bankCell(doc, 'ИИК', issuer.bankAccount || '—', left + bankLeftW, bankY, bankMiddleW, 43);
        this.bankCell(doc, 'КБе', issuer.kbe || '—', left + bankLeftW + bankMiddleW, bankY, bankRightW, 43);
        this.bankCell(doc, 'БИК', issuer.bankBic || '—', left + bankLeftW, bankY + 43, bankMiddleW, 43);
        this.bankCell(
            doc,
            'Код назначения платежа',
            document.paymentPurposeCode || '—',
            left + bankLeftW + bankMiddleW,
            bankY + 43,
            bankRightW,
            43,
        );
        doc.y = bankY + bankH + 6;

        // Свидетельство о постановке на учёт по НДС — обязательный реквизит
        // счёта у плательщика НДС. Нет номера — компания на учёте не стоит,
        // и строку печатать не нужно.
        const vatCertificate = this.vatCertificateLine(issuer);
        if (vatCertificate) {
            doc.font('Roboto').fontSize(8).fillColor(INK);
            doc.text(vatCertificate, left, doc.y, { width });
            doc.moveDown(0.4);
        }
        doc.y += 8;

        doc.font('Roboto-Bold').fontSize(16).fillColor(INK);
        doc.text(`Счёт на оплату № ${document.number} от ${this.formatDate(document.documentDate)}`, left, doc.y, {
            width,
        });
        doc.moveDown(0.35);
        doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1.2).strokeColor(INK).stroke();
        doc.moveDown(0.8);

        this.partyLine(doc, 'Поставщик:', this.formatParty(issuer));
        this.partyLine(doc, 'Покупатель:', this.formatParty(recipient));
        const contractNumber = this.stringValue(basis.contractNumber);
        if (contractNumber) {
            this.partyLine(doc, 'Договор:', `Договор № ${contractNumber}${this.formatBasisDate(basis.startDate)}`);
        }
        doc.moveDown(0.45);
    }

    private drawInvoiceLines(doc: PDFKit.PDFDocument, lines: InvoicePdfLine[], documentNumber: string) {
        const left = doc.page.margins.left;
        // Колонка «Код» убрана по просьбе бухгалтерии: код услуги нужен нам
        // внутри, а в счёте для контрагента он только занимает место —
        // освободившиеся 52 пункта отданы наименованию, где длинные маршруты
        // раньше переносились лишний раз.
        const widths = [24, 277, 42, 36, 76, 76];
        const headers = ['№', 'Наименование', 'Кол-во', 'Ед.', 'Цена', 'Сумма'];
        const tableWidth = widths.reduce((sum, value) => sum + value, 0);

        const drawHeader = () => {
            const y = doc.y;
            const height = 28;
            let x = left;
            doc.font('Roboto-Bold').fontSize(7.5).fillColor(INK);
            headers.forEach((header, index) => {
                this.tableCell(doc, header, x, y, widths[index], height, 'center');
                x += widths[index];
            });
            doc.y = y + height;
        };

        // Шапка таблицы не должна оставаться одна внизу страницы: строки
        // уедут на следующую и напечатают вторую шапку, а счёт из одной
        // услуги станет двухстраничным. Поэтому проверяем место сразу под
        // шапку и хотя бы одну строку.
        const tableBottom = doc.page.height - doc.page.margins.bottom - 125;
        if (doc.y + 28 + 24 > tableBottom) {
            doc.addPage();
            doc.y = doc.page.margins.top + 10;
        }

        drawHeader();
        lines.forEach((line, index) => {
            const name = line.description ? `${line.name}\n${line.description}` : line.name;
            doc.font('Roboto').fontSize(7.5);
            const nameHeight = doc.heightOfString(name, { width: widths[1] - 8, lineGap: 1 });
            const rowHeight = Math.max(24, nameHeight + 8);
            if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 125) {
                doc.addPage();
                doc.y = doc.page.margins.top + 10;
                doc.font('Roboto-Bold').fontSize(11).text(`Счёт № ${this.safeText(documentNumber)}`, left, doc.y, {
                    width: tableWidth,
                    align: 'right',
                });
                doc.moveDown(0.5);
                drawHeader();
            }

            const y = doc.y;
            const values = [
                String(index + 1),
                name,
                this.formatQuantity(line.quantity),
                line.unit,
                this.formatMoney(line.unitPrice),
                this.formatMoney(line.total),
            ];
            let x = left;
            doc.font('Roboto').fontSize(7.5);
            values.forEach((value, column) => {
                // № по центру, наименование по левому краю, количество и
                // единица по центру, деньги по правому — как в 1С.
                const align = column === 0 || column === 2 || column === 3
                    ? 'center'
                    : column >= 4 ? 'right' : 'left';
                this.tableCell(doc, value, x, y, widths[column], rowHeight, align);
                x += widths[column];
            });
            doc.y = y + rowHeight;
        });
    }

    private drawInvoiceTotals(doc: PDFKit.PDFDocument, document: InvoicePdfDocument) {
        this.ensureSpace(doc, 115);
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const labelX = left + width - 190;
        const valueX = left + width - 82;
        doc.moveDown(0.6);
        doc.font('Roboto-Bold').fontSize(9).fillColor(INK);
        this.totalLine(doc, 'Итого:', this.formatMoney(document.total), labelX, valueX);
        this.totalLine(doc, 'В том числе НДС:', this.formatMoney(document.vatTotal), labelX, valueX);
        doc.moveDown(0.5);
        doc.font('Roboto').fontSize(8.5);
        // Подпись валюты словом там, где она известна: «на сумму … долларов
        // США» читается, а «на сумму … USD» — нет.
        const words = wordsFor(document.currency);
        const currencyLabel = words.minor[0] ? words.major[2] : document.currency;
        doc.text(`Всего наименований ${document.lines.length}, на сумму ${this.formatMoney(document.total)} ${currencyLabel}`, left, doc.y, {
            width,
        });
        doc.moveDown(0.3);
        doc.font('Roboto-Bold').fontSize(9.5);
        doc.text(`Всего к оплате: ${this.amountInWords(document.total, document.currency)}`, left, doc.y, { width });

        // Справочная строка для валютного счёта.
        //
        // Обязательство остаётся в валюте документа — платить надо её. Но
        // бухгалтерия принимающей стороны и налоговая считают в тенге, и
        // курс должен быть виден на самом бланке, а не «где-то в системе».
        // Без курса и даты сумма в тенге ничем не подтверждается.
        if (document.currency !== 'KZT' && document.exchangeRate && document.totalBase) {
            const rateDate = document.exchangeRateDate ? new Date(document.exchangeRateDate) : null;
            const asOf = rateDate && !Number.isNaN(rateDate.getTime())
                ? ` на ${String(rateDate.getUTCDate()).padStart(2, '0')}.${String(rateDate.getUTCMonth() + 1).padStart(2, '0')}.${rateDate.getUTCFullYear()}`
                : '';
            doc.moveDown(0.3);
            doc.font('Roboto').fontSize(8);
            doc.text(
                `Справочно: ${this.formatMoney(document.totalBase)} тенге по курсу ` +
                `${document.exchangeRate.toFixed(2)} ₸ за 1 ${document.currency}${asOf}. ` +
                'Оплата производится в валюте счёта.',
                left, doc.y, { width },
            );
        }
        doc.moveDown(0.55);
        doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor(INK).stroke();
        doc.moveDown(0.7);
    }

    private drawInvoiceFooter(
        doc: PDFKit.PDFDocument,
        document: InvoicePdfDocument,
        issuer: PartySnapshot,
        stamp?: Buffer | null,
    ) {
        this.ensureSpace(doc, stamp ? 130 : 65);
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const signatory = this.record(document.issuerSignatorySnapshot ?? null);
        const signatoryName = this.stringValue(signatory.name) || issuer.directorName || '';
        const signatoryPosition = this.stringValue(signatory.position) || 'Исполнитель';
        doc.font('Roboto-Bold').fontSize(9);
        doc.text(signatoryPosition, left, doc.y, { continued: true });
        doc.font('Roboto').text(' ________________________________ ', { continued: true });
        doc.font('Roboto').text(signatoryName || '/подпись/', { align: 'right' });
        this.drawStamp(doc, stamp, left + 60, doc.y - 6);
        if (document.note) {
            doc.moveDown(1);
            doc.font('Roboto').fontSize(8).fillColor(INK);
            doc.text(`Примечание: ${document.note}`, left, doc.y, { width });
        }
    }

    /** «Свидетельство по НДС: серия 60001 № 0012345 от 01.01.2024». */
    private vatCertificateLine(party: PartySnapshot): string | null {
        if (!party.vatCertificateNumber) return null;
        const parts = [
            party.vatCertificateSeries ? `серия ${party.vatCertificateSeries}` : null,
            `№ ${party.vatCertificateNumber}`,
            party.vatCertificateDate ? `от ${this.formatDate(new Date(party.vatCertificateDate))}` : null,
        ].filter(Boolean);
        return `Свидетельство о постановке на регистрационный учёт по НДС: ${parts.join(' ')}`;
    }

    /**
     * Печать поверх блока подписи. Полупрозрачности нет — печать кладётся
     * рядом с «М.П.», а не поверх текста, чтобы ничего не перекрывать.
     */
    private drawStamp(doc: PDFKit.PDFDocument, stamp: Buffer | null | undefined, x: number, y: number) {
        if (!stamp) return;
        try {
            doc.image(stamp, x, y, { fit: [96, 96] });
        } catch {
            // Битая картинка печати не должна ронять весь документ.
        }
    }

    private bankCell(
        doc: PDFKit.PDFDocument,
        label: string,
        value: string,
        x: number,
        y: number,
        width: number,
        height: number,
    ) {
        doc.font('Roboto').fontSize(6.5).fillColor(INK);
        doc.text(label, x + 3, y + 3, { width: width - 6, align: 'center' });
        doc.font('Roboto-Bold').fontSize(value.length > 18 ? 6.5 : 8);
        doc.text(value, x + 3, y + 18, { width: width - 6, align: 'center' });
    }

    private partyLine(doc: PDFKit.PDFDocument, label: string, value: string) {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const labelWidth = 70;
        const valueWidth = width - labelWidth;
        const y = doc.y;
        doc.font('Roboto').fontSize(8.5);
        const height = Math.max(
            doc.heightOfString(label, { width: labelWidth - 5 }),
            doc.heightOfString(value, { width: valueWidth, lineGap: 1 }),
        );
        doc.font('Roboto').text(label, left, y, { width: labelWidth - 5 });
        doc.font('Roboto-Bold').text(value, left + labelWidth, y, { width: valueWidth, lineGap: 1 });
        doc.y = y + height + 5;
    }

    /**
     * Высота строки таблицы под её содержимое.
     *
     * Считается ТЕМИ ЖЕ параметрами, которыми tableCell рисует текст. Раньше
     * измерение и отрисовка расходились (ширина w-6 против w-8, межстрочный
     * 0.5 против 1), текст не помещался и молча обрезался по высоте — из акта
     * пропадала часть описания услуги.
     */
    private tableRowHeight(doc: PDFKit.PDFDocument, values: string[], widths: number[], minHeight = 22) {
        const heights = values.map((value, column) => doc.heightOfString(value, {
            width: widths[column] - AccountingDocumentPdfService.CELL_PAD_X * 2,
            lineGap: AccountingDocumentPdfService.CELL_LINE_GAP,
        }));
        return Math.max(minHeight, ...heights.map((h) => h + AccountingDocumentPdfService.CELL_PAD_Y * 2));
    }

    /** Отступы ячейки таблицы: по ним считается и высота строки, и отрисовка. */
    private static readonly CELL_PAD_X = 4;
    private static readonly CELL_PAD_Y = 5;
    private static readonly CELL_LINE_GAP = 1;

    private tableCell(
        doc: PDFKit.PDFDocument,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        align: 'left' | 'center' | 'right',
    ) {
        const padX = AccountingDocumentPdfService.CELL_PAD_X;
        const padY = AccountingDocumentPdfService.CELL_PAD_Y;
        doc.rect(x, y, width, height).lineWidth(0.5).strokeColor(INK).stroke();
        doc.fillColor(INK).text(text, x + padX, y + padY, {
            width: width - padX * 2,
            height: height - padY * 2,
            align,
            lineGap: AccountingDocumentPdfService.CELL_LINE_GAP,
            ellipsis: false,
        });
    }

    private totalLine(
        doc: PDFKit.PDFDocument,
        label: string,
        value: string,
        labelX: number,
        valueX: number,
    ) {
        const y = doc.y;
        doc.text(label, labelX, y, { width: 100, align: 'right' });
        doc.text(value, valueX, y, { width: 82, align: 'right' });
        doc.y = y + 14;
    }

    private ensureSpace(doc: PDFKit.PDFDocument, height: number) {
        if (doc.y + height <= doc.page.height - doc.page.margins.bottom) return;
        doc.addPage();
        doc.y = doc.page.margins.top + 10;
    }

    private addPageNumbers(doc: PDFKit.PDFDocument) {
        const range = doc.bufferedPageRange();
        // В утверждённых бланках колонтитула нет. Нумерация нужна только
        // чтобы не потерять лист многостраничного документа, поэтому на
        // одной странице её не печатаем.
        if (range.count < 2) return;
        for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
            doc.switchToPage(pageIndex);
            const originalBottomMargin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.font('Roboto').fontSize(7).fillColor(INK);
            doc.text(
                `Страница ${pageIndex - range.start + 1} из ${range.count}`,
                doc.page.margins.left,
                doc.page.height - 24,
                {
                    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                    align: 'right',
                    lineBreak: false,
                },
            );
            doc.page.margins.bottom = originalBottomMargin;
        }
    }

    /**
     * Реквизиты стороны одной строкой.
     *
     * includeBin=false — для акта Р-1: там БИН печатается в отдельной рамке
     * справа, и повторять его в строке наименования бланк не предусматривает.
     * В счёте на оплату, наоборот, БИН идёт в самой строке.
     */
    private formatParty(party: PartySnapshot, includeBin = true) {
        const contacts = [party.phone ? `тел.: ${party.phone}` : null, party.email].filter(Boolean).join(', ');
        return [
            includeBin && party.bin ? `БИН/ИИН ${party.bin}` : null,
            party.name || '—',
            party.address || party.actualAddress,
            contacts || null,
        ].filter(Boolean).join(', ');
    }

    private formatBasisDate(value: unknown) {
        if (typeof value !== 'string' || !value) return '';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : ` от ${this.formatDate(date)}`;
    }

    private formatDate(date: Date) {
        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(date);
    }

    private formatMoney(value: Prisma.Decimal) {
        const [integer, fraction] = value.toFixed(2).split('.');
        return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ,${fraction}`.replace(' ,', ',');
    }

    private formatQuantity(value: Prisma.Decimal) {
        return value.toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    }

    /**
     * Сумма прописью в валюте документа.
     *
     * Слова валюты берутся из справочника: «Пятьсот долларов США 00 центов»,
     * а не «Пятьсот тенге 00 тиын». Раньше слова стояли прямо здесь, и в
     * валютном счёте документ получался неверным — а сумма прописью это
     * первое, на что смотрит принимающая бухгалтерия.
     */
    private amountInWords(value: Prisma.Decimal, currencyCode = 'KZT') {
        const currency = wordsFor(currencyCode);
        const [integerPart, fractionPart] = value.toFixed(2).split('.');
        // У валюты без разменной единицы (или неизвестной) копейки пишутся
        // числом без слова: выдумывать название наугад хуже.
        const minorText = currency.minor[0]
            ? ` ${fractionPart} ${pluralForm(Number(fractionPart), currency.minor)}`
            : ` ${fractionPart}`;

        let remaining = BigInt(integerPart);
        if (remaining === 0n) {
            return `Ноль ${pluralForm(0, currency.major)}${minorText}`;
        }

        const groups = [
            // Род единиц целой части — как у самой валюты: «одна гривна», но
            // «один доллар».
            { forms: ['', '', ''], feminine: !!currency.majorFeminine },
            { forms: ['тысяча', 'тысячи', 'тысяч'], feminine: true },
            { forms: ['миллион', 'миллиона', 'миллионов'], feminine: false },
            { forms: ['миллиард', 'миллиарда', 'миллиардов'], feminine: false },
            { forms: ['триллион', 'триллиона', 'триллионов'], feminine: false },
            { forms: ['квадриллион', 'квадриллиона', 'квадриллионов'], feminine: false },
        ];
        const parts: string[] = [];
        let groupIndex = 0;
        while (remaining > 0n) {
            const group = Number(remaining % 1000n);
            if (group) {
                const config = groups[groupIndex];
                const chunk = this.threeDigits(group, config?.feminine ?? false);
                if (groupIndex > 0 && config) chunk.push(this.plural(group, config.forms));
                parts.unshift(chunk.join(' '));
            }
            remaining /= 1000n;
            groupIndex += 1;
        }
        const words = parts.join(' ');
        // Форму слова задают последние две цифры: «двадцать один доллар», но
        // «одиннадцать долларов».
        const majorWord = pluralForm(Number(BigInt(integerPart) % 100n), currency.major);
        return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${majorWord}${minorText}`;
    }

    private threeDigits(value: number, feminine: boolean) {
        const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
        const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
        const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
        const units = feminine
            ? ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
            : ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
        const result: string[] = [];
        if (Math.floor(value / 100)) result.push(hundreds[Math.floor(value / 100)]);
        const rest = value % 100;
        if (rest >= 10 && rest < 20) {
            result.push(teens[rest - 10]);
        } else {
            if (Math.floor(rest / 10)) result.push(tens[Math.floor(rest / 10)]);
            if (rest % 10) result.push(units[rest % 10]);
        }
        return result;
    }

    private plural(value: number, forms: string[]) {
        const lastTwo = value % 100;
        if (lastTwo >= 11 && lastTwo <= 19) return forms[2];
        const last = value % 10;
        if (last === 1) return forms[0];
        if (last >= 2 && last <= 4) return forms[1];
        return forms[2];
    }

    private party(value: Prisma.JsonValue): PartySnapshot {
        return this.record(value) as PartySnapshot;
    }

    private record(value: Prisma.JsonValue | null): Record<string, unknown> {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : {};
    }

    private stringValue(value: unknown) {
        return typeof value === 'string' ? value : '';
    }

    private safeText(value: string) {
        return value.replace(/[\r\n]+/g, ' ').trim();
    }
}
