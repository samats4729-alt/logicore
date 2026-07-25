import { BadRequestException, Injectable } from '@nestjs/common';
import {
    AccountingDocumentStatus,
    AccountingDocumentType,
    Prisma,
} from '@prisma/client';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';

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
    subtotal: Prisma.Decimal;
    vatTotal: Prisma.Decimal;
    total: Prisma.Decimal;
    issuerSnapshot: Prisma.JsonValue;
    recipientSnapshot: Prisma.JsonValue;
    issuerSignatorySnapshot?: Prisma.JsonValue | null;
    recipientSignatorySnapshot?: Prisma.JsonValue | null;
    basisSnapshot: Prisma.JsonValue | null;
    createdAt: Date;
    postedAt: Date | null;
    lines: InvoicePdfLine[];
}

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
}

@Injectable()
export class AccountingDocumentPdfService {
    async generatePdf(document: InvoicePdfDocument): Promise<Buffer> {
        if (document.type === AccountingDocumentType.PAYMENT_INVOICE) {
            return this.generateInvoicePdf(document);
        }
        if (document.type === AccountingDocumentType.SERVICE_ACT) {
            return this.generateServiceActPdf(document);
        }
        throw new BadRequestException('Печатная форма для этого типа документа ещё не реализована');
    }

    async generateInvoicePdf(document: InvoicePdfDocument): Promise<Buffer> {
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
            };
            doc.on('pageAdded', drawDraftWatermark);
            drawDraftWatermark();

            this.drawInvoiceHeader(doc, document, issuer, recipient, basis);
            this.drawInvoiceLines(doc, document.lines, document.number);
            this.drawInvoiceTotals(doc, document);
            this.drawInvoiceFooter(doc, document, issuer);
            this.addPageNumbers(doc);
            doc.end();
        });
    }

    async generateServiceActPdf(document: InvoicePdfDocument): Promise<Buffer> {
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
            };
            doc.on('pageAdded', drawDraftWatermark);
            drawDraftWatermark();

            this.drawServiceActHeader(doc, document, issuer, recipient, basis);
            this.drawServiceActLines(doc, document);
            this.drawServiceActFooter(
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

        doc.font('Roboto').fontSize(6.5).fillColor('#444444');
        doc.text(
            'Приложение 50\nк приказу Министра финансов\nРеспублики Казахстан\nот 20 декабря 2012 года № 562',
            left + width - legalWidth,
            18,
            { width: legalWidth, align: 'center', lineGap: 0.5 },
        );
        doc.font('Roboto').fontSize(7.5).fillColor('#222222');
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
        doc.font('Roboto').fontSize(7.5).fillColor('#222222');
        doc.text('Договор (контракт)', left, contractY, { width: contractLabelWidth });
        doc.font('Roboto-Bold').text(contractText, left + contractLabelWidth, contractY, {
            width: width - contractLabelWidth - boxWidth - 12,
        });

        const boxX = left + width - boxWidth;
        const headerHeight = 18;
        const valueHeight = 20;
        const numberWidth = 88;
        doc.rect(boxX, contractY - 2, boxWidth, headerHeight + valueHeight).lineWidth(0.55).strokeColor('#333333').stroke();
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
        doc.font('Roboto-Bold').fontSize(11).fillColor('#111111');
        doc.text('АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)', left, doc.y, {
            width,
            align: 'center',
        });
        if (document.reportPeriodFrom && document.reportPeriodTo) {
            doc.moveDown(0.2);
            doc.font('Roboto').fontSize(6.8).text(
                `Отчётный период: ${this.formatDateNumeric(document.reportPeriodFrom)} - ${this.formatDateNumeric(document.reportPeriodTo)}`,
                left,
                doc.y,
                { width, align: 'center' },
            );
        }
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
        const partyText = this.formatParty(party);
        doc.font('Roboto-Bold').fontSize(7.2);
        const textHeight = doc.heightOfString(partyText, { width: partyWidth - 8, lineGap: 0.5 });
        const height = Math.max(29, textHeight + 10);

        doc.font('Roboto').fontSize(7.5).fillColor('#222222');
        doc.text(label, left, y + 8, { width: labelWidth - 5 });
        doc.font('Roboto-Bold').fontSize(7.2).text(partyText, left + labelWidth, y + 2, {
            width: partyWidth - 8,
            lineGap: 0.5,
        });
        doc.moveTo(left + labelWidth, y + height - 5)
            .lineTo(left + labelWidth + partyWidth - 8, y + height - 5)
            .lineWidth(0.45)
            .strokeColor('#555555')
            .stroke();
        doc.font('Roboto').fontSize(5.5).fillColor('#666666');
        doc.text('полное наименование, адрес, данные о средствах связи', left + labelWidth, y + height - 3, {
            width: partyWidth - 8,
            align: 'center',
        });

        const binX = left + width - binWidth;
        doc.rect(binX, y, binWidth, height).lineWidth(0.55).strokeColor('#333333').stroke();
        doc.font('Roboto').fontSize(6.5).fillColor('#333333').text('ИИН/БИН', binX + 3, y + 3, {
            width: binWidth - 6,
            align: 'center',
        });
        doc.font('Roboto-Bold').fontSize(8).fillColor('#111111').text(party.bin || '—', binX + 3, y + 15, {
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
                'Наименование работ (услуг) в разрезе их подвидов в соответствии с технической спецификацией, заданием, графиком выполнения работ (услуг)',
                'Дата выполнения работ (оказания услуг)',
                'Сведения об отчёте о научных исследованиях, маркетинговых, консультационных и прочих услугах',
                'Единица измерения',
            ];
            let x = left;
            fixedHeaders.forEach((header, index) => {
                this.actHeaderCell(doc, header, x, y, widths[index], topHeight + subHeight, index === 1 ? 5.1 : 5.5);
                x += widths[index];
            });
            const groupWidth = widths.slice(5).reduce((sum, value) => sum + value, 0);
            this.actHeaderCell(doc, 'Выполнено работ (оказано услуг)', x, y, groupWidth, topHeight, 6.2);
            const subHeaders = ['количество', 'цена за единицу', 'стоимость', 'в том числе НДС'];
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
            const heights = values.map((value, column) => doc.heightOfString(value, {
                width: widths[column] - 6,
                lineGap: 0.5,
            }));
            const rowHeight = Math.max(22, ...heights.map((height) => height + 7));
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
        doc.font('Roboto').fontSize(6.8).fillColor('#222222');
        this.actInfoLine(
            doc,
            'Сведения об использовании запасов, полученных от заказчика',
            document.customerMaterialsInfo || 'не использовались',
        );
        this.actInfoLine(
            doc,
            'Приложение: перечень документации, в том числе отчётов и прочих материалов',
            document.appendixInfo || 'отсутствует',
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
            this.stringValue(issuerSignatory.position) || 'директор',
            this.stringValue(issuerSignatory.name) || issuer.directorName || '',
        );
        this.actSignatureBlock(
            doc,
            'Принял (Заказчик)',
            left + blockWidth + gap,
            y,
            blockWidth,
            this.stringValue(recipientSignatory.position) || 'должность',
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
        doc.rect(x, y, width, height).lineWidth(0.45).strokeColor('#333333').stroke();
        doc.font('Roboto').fontSize(fontSize).fillColor('#111111');
        const textHeight = doc.heightOfString(value, { width: width - 5, lineGap: 0.2 });
        doc.text(value, x + 2.5, y + Math.max(2, (height - textHeight) / 2), {
            width: width - 5,
            height: height - 3,
            align: 'center',
            lineGap: 0.2,
        });
    }

    private actInfoLine(doc: PDFKit.PDFDocument, label: string, value: string) {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const y = doc.y;
        const labelWidth = 330;
        doc.text(label, left, y, { width: labelWidth });
        doc.font('Roboto-Bold').text(value, left + labelWidth, y, { width: width - labelWidth });
        doc.moveTo(left + labelWidth, y + 10).lineTo(left + width, y + 10).lineWidth(0.4).strokeColor('#555555').stroke();
        doc.y = y + 17;
        doc.font('Roboto');
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
        doc.font('Roboto-Bold').fontSize(7).fillColor('#111111').text(title, x, y, { width: 92 });
        doc.font('Roboto').fontSize(6.8).text(position, x + 95, y, { width: 82, align: 'center' });
        doc.text('', x + 182, y, { width: 75 });
        doc.text(name || '________________', x + 262, y, { width: width - 262, align: 'center' });
        doc.moveTo(x + 95, y + 11).lineTo(x + 177, y + 11).stroke();
        doc.moveTo(x + 182, y + 11).lineTo(x + 257, y + 11).stroke();
        doc.moveTo(x + 262, y + 11).lineTo(x + width, y + 11).stroke();
        doc.font('Roboto').fontSize(5.2).fillColor('#666666');
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

        doc.font('Roboto').fontSize(8).fillColor('#333333');
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
        doc.lineWidth(0.7).strokeColor('#222222').fillColor('#111111');
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
        doc.y = bankY + bankH + 18;

        doc.font('Roboto-Bold').fontSize(16).fillColor('#111111');
        doc.text(`Счёт на оплату № ${document.number} от ${this.formatDate(document.documentDate)}`, left, doc.y, {
            width,
        });
        doc.moveDown(0.35);
        doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1.2).strokeColor('#222222').stroke();
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
        const widths = [24, 52, 225, 42, 36, 76, 76];
        const headers = ['№', 'Код', 'Наименование', 'Кол-во', 'Ед.', 'Цена', 'Сумма'];
        const tableWidth = widths.reduce((sum, value) => sum + value, 0);

        const drawHeader = () => {
            const y = doc.y;
            const height = 28;
            let x = left;
            doc.font('Roboto-Bold').fontSize(7.5).fillColor('#111111');
            headers.forEach((header, index) => {
                this.tableCell(doc, header, x, y, widths[index], height, index >= 3 ? 'center' : 'center');
                x += widths[index];
            });
            doc.y = y + height;
        };

        drawHeader();
        lines.forEach((line, index) => {
            const name = line.description ? `${line.name}\n${line.description}` : line.name;
            doc.font('Roboto').fontSize(7.5);
            const nameHeight = doc.heightOfString(name, { width: widths[2] - 8, lineGap: 1 });
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
                line.serviceCode || '',
                name,
                this.formatQuantity(line.quantity),
                line.unit,
                this.formatMoney(line.unitPrice),
                this.formatMoney(line.total),
            ];
            let x = left;
            doc.font('Roboto').fontSize(7.5);
            values.forEach((value, column) => {
                const align = column === 0 || column === 3 || column === 4
                    ? 'center'
                    : column >= 5 ? 'right' : 'left';
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
        doc.font('Roboto-Bold').fontSize(9).fillColor('#111111');
        this.totalLine(doc, 'Итого:', this.formatMoney(document.total), labelX, valueX);
        this.totalLine(doc, 'В том числе НДС:', this.formatMoney(document.vatTotal), labelX, valueX);
        doc.moveDown(0.5);
        doc.font('Roboto').fontSize(8.5);
        const currencyLabel = document.currency === 'KZT' ? 'тенге' : document.currency;
        doc.text(`Всего наименований ${document.lines.length}, на сумму ${this.formatMoney(document.total)} ${currencyLabel}`, left, doc.y, {
            width,
        });
        doc.moveDown(0.3);
        doc.font('Roboto-Bold').fontSize(9.5);
        doc.text(`Всего к оплате: ${this.amountInWords(document.total)}`, left, doc.y, { width });
        doc.moveDown(0.55);
        doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor('#222222').stroke();
        doc.moveDown(0.7);
    }

    private drawInvoiceFooter(
        doc: PDFKit.PDFDocument,
        document: InvoicePdfDocument,
        issuer: PartySnapshot,
    ) {
        this.ensureSpace(doc, 65);
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.font('Roboto-Bold').fontSize(9);
        doc.text('Исполнитель', left, doc.y, { continued: true });
        doc.font('Roboto').text(' ________________________________ ', { continued: true });
        doc.font('Roboto').text(issuer.directorName || '/бухгалтер/', { align: 'right' });
        if (document.note) {
            doc.moveDown(1);
            doc.font('Roboto').fontSize(8).fillColor('#444444');
            doc.text(`Примечание: ${document.note}`, left, doc.y, { width });
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
        doc.font('Roboto').fontSize(6.5).fillColor('#333333');
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

    private tableCell(
        doc: PDFKit.PDFDocument,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        align: 'left' | 'center' | 'right',
    ) {
        doc.rect(x, y, width, height).lineWidth(0.5).strokeColor('#333333').stroke();
        doc.fillColor('#111111').text(text, x + 4, y + 5, {
            width: width - 8,
            height: height - 8,
            align,
            lineGap: 1,
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
        for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
            doc.switchToPage(pageIndex);
            const originalBottomMargin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.font('Roboto').fontSize(7).fillColor('#666666');
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

    private formatParty(party: PartySnapshot) {
        const contacts = [party.phone ? `тел.: ${party.phone}` : null, party.email].filter(Boolean).join(', ');
        return [
            party.bin ? `БИН/ИИН ${party.bin}` : null,
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

    private amountInWords(value: Prisma.Decimal) {
        const [integerPart, fractionPart] = value.toFixed(2).split('.');
        let remaining = BigInt(integerPart);
        if (remaining === 0n) return `Ноль тенге ${fractionPart} тиын`;

        const groups = [
            { forms: ['', '', ''], feminine: false },
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
                const words = this.threeDigits(group, config?.feminine ?? false);
                if (groupIndex > 0 && config) words.push(this.plural(group, config.forms));
                parts.unshift(words.join(' '));
            }
            remaining /= 1000n;
            groupIndex += 1;
        }
        const words = parts.join(' ');
        return `${words.charAt(0).toUpperCase()}${words.slice(1)} тенге ${fractionPart} тиын`;
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
