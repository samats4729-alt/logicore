import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { getDefaultContractTemplate } from './contract-template';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ContractPdfService {
    private readonly logger = new Logger(ContractPdfService.name);

    constructor(
        private prisma: PrismaService,
        private s3Service: S3Service,
    ) { }

    async generateContractPdf(contractId: string): Promise<Buffer> {
        const contract = await this.prisma.contract.findUnique({
            where: { id: contractId },
            include: {
                customerCompany: true,
                forwarderCompany: true,
                agreements: {
                    include: {
                        tariffs: {
                            include: {
                                originCity: { include: { region: true } },
                                destinationCity: { include: { region: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!contract) throw new NotFoundException('Договор не найден');

        const customer = contract.customerCompany;
        const forwarder = contract.forwarderCompany;

        // Загружаем буферы печатей и подписей для обеих сторон
        let forwarderStampBuffer: Buffer | null = null;
        let forwarderSignatureBuffer: Buffer | null = null;
        let customerStampBuffer: Buffer | null = null;
        let customerSignatureBuffer: Buffer | null = null;

        this.logger.log(`[ContractPdf] Generating PDF for contractId=${contractId}. Forwarder="${forwarder?.name}", Customer="${customer?.name}"`);

        if (forwarder?.stampImage) {
            forwarderStampBuffer = await this.getImageBuffer(forwarder.stampImage);
        }
        if (forwarder?.signatureImage) {
            forwarderSignatureBuffer = await this.getImageBuffer(forwarder.signatureImage);
        }
        if (customer?.stampImage) {
            customerStampBuffer = await this.getImageBuffer(customer.stampImage);
        }
        if (customer?.signatureImage) {
            customerSignatureBuffer = await this.getImageBuffer(customer.signatureImage);
        }

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                // Нижнее поле увеличено, чтобы текст не залезал на подпись-колонтитул
                margins: { top: 50, bottom: 75, left: 60, right: 60 },
                bufferPages: true,
                info: {
                    Title: `Договор №${contract.contractNumber}`,
                    Author: forwarder.name,
                },
            });

            // Регистрация шрифтов с поддержкой кириллицы
            const fontsDir = path.join(__dirname, 'fonts');
            doc.registerFont('Roboto', path.join(fontsDir, 'Roboto-Regular.ttf'));
            doc.registerFont('Roboto-Bold', path.join(fontsDir, 'Roboto-Bold.ttf'));

            const buffers: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            const contractNum = contract.contractNumber || '____';
            const startDate = contract.startDate;
            const city = forwarder.address ? forwarder.address.split(',')[0] : 'г. Алматы';

            // Убираем префикс ТОО/TOO из имён компаний (уже пишем "Товарищество с ограниченной ответственностью")
            const forwarderCleanName = this.stripCompanyPrefix(forwarder.name);
            const customerCleanName = this.stripCompanyPrefix(customer.name);

            // ============ ШАПКА ============
            doc.fontSize(14).font('Roboto-Bold');
            doc.text(`ДОГОВОР № ${contractNum}`, { align: 'center' });
            doc.fontSize(12).font('Roboto-Bold');
            doc.text('транспортной экспедиции', { align: 'center' });
            doc.moveDown(0.5);

            // Город слева, дата справа — на одной строке
            doc.fontSize(10).font('Roboto');
            const dateStr = startDate
                ? `«${new Date(startDate).getDate()}» ${this.getMonthName(new Date(startDate))} ${new Date(startDate).getFullYear()}`
                : '«____» ___________ 202_';
            const headerRowY = doc.y;
            doc.text(city, doc.page.margins.left, headerRowY, { align: 'left' });
            doc.text(`${dateStr} года`, doc.page.margins.left, headerRowY, { align: 'right' });
            doc.moveDown(1);

            // ============ ПРЕАМБУЛА (с жирными названиями компаний) ============
            doc.fontSize(10).font('Roboto');

            // Экспедитор - жирное название
            doc.font('Roboto-Bold').text('Товарищество с ограниченной ответственностью ', { continued: true, align: 'justify' });
            doc.text(`«${forwarderCleanName}»`, { continued: true });
            doc.font('Roboto').text(`, именуемое в дальнейшем «Экспедитор», в лице директора, действующего на основании Устава, с одной стороны, и`, { align: 'justify', lineGap: 2 });

            // Заказчик - жирное название
            doc.font('Roboto-Bold').text('Товарищество с ограниченной ответственностью ', { continued: true, align: 'justify' });
            doc.text(`«${customerCleanName}»`, { continued: true });
            doc.font('Roboto').text(`, именуемое в дальнейшем «Заказчик», в лице директора, действующего (-ей) на основании Устава, с другой стороны, далее совместно именуемые `, { continued: true, align: 'justify', lineGap: 2 });
            doc.font('Roboto-Bold').text('«Стороны»', { continued: true });
            doc.font('Roboto').text(',а по отдельности как указано выше, заключили настоящий Договор о нижеследующем:', { align: 'justify', lineGap: 2 });
            doc.moveDown(1);

            // ============ СТАТЬИ ДОГОВОРА (из сохранённого содержимого или шаблона) ============
            const articles: any[] = (contract.content as any[]) || getDefaultContractTemplate();

            for (const article of articles) {
                this.addArticle(doc, article.title);

                // Специальная обработка для статьи 5 (подзаголовок)
                if (article.title.startsWith('5.')) {
                    doc.font('Roboto-Bold').fontSize(10).text('Требования к пунктам погрузки и разгрузки грузов', { align: 'center' });
                    doc.moveDown(0.3);
                }

                for (const para of article.paragraphs) {
                    // Определяем подзаголовки: пункты вида "X.Y." (без третьего уровня) с коротким текстом-заголовком
                    const isSubheading = /^\d+\.\d+\.$/.test(para.number) && para.text.endsWith(':');
                    if (isSubheading) {
                        this.addSubheading(doc, `${para.number} ${para.text}`);
                    } else {
                        this.addParagraph(doc, para.number, para.text);
                    }
                }
            }

            // ============ 15. ЮРИДИЧЕСКИЕ АДРЕСА И РЕКВИЗИТЫ СТОРОН ============
            doc.addPage();
            doc.moveDown(0.5);
            doc.fontSize(12).font('Roboto-Bold');
            doc.text('15.    ЮРИДИЧЕСКИЕ АДРЕСА И РЕКВИЗИТЫ СТОРОН:', { align: 'center' });
            doc.moveDown(1);

            // Рисуем таблицу реквизитов как в оригинале
            this.drawRequisitesTable(
                doc,
                forwarder,
                customer,
                forwarderStampBuffer,
                forwarderSignatureBuffer,
                customerStampBuffer,
                customerSignatureBuffer
            );

            // Колонтитулы на КАЖДОЙ странице: сверху (со 2-й) — «Договор № … от …»,
            // снизу — подпись и печать обеих сторон (если загружены картинки)
            this.addHeadersAndFooters(doc, contractNum, dateStr, forwarder, customer, {
                forwarderStampBuffer,
                forwarderSignatureBuffer,
                customerStampBuffer,
                customerSignatureBuffer,
            });

            doc.end();
        });
    }

    // ============ ТАБЛИЦА РЕКВИЗИТОВ ============
    private drawRequisitesTable(
        doc: PDFKit.PDFDocument,
        forwarder: any,
        customer: any,
        forwarderStampBuffer: Buffer | null,
        forwarderSignatureBuffer: Buffer | null,
        customerStampBuffer: Buffer | null,
        customerSignatureBuffer: Buffer | null
    ) {
        const startX = 60;
        const tableWidth = 475;
        const colWidth = tableWidth / 2;
        const leftX = startX;
        const rightX = startX + colWidth;
        const cellPadding = 5;
        let y = doc.y;

        // Заголовок таблицы
        const headerHeight = 25;
        doc.rect(leftX, y, colWidth, headerHeight).stroke();
        doc.rect(rightX, y, colWidth, headerHeight).stroke();
        doc.fontSize(10).font('Roboto-Bold');
        doc.text('ЭКСПЕДИТОР', leftX + cellPadding, y + 7, { width: colWidth - cellPadding * 2, align: 'center' });
        doc.text('ЗАКАЗЧИК', rightX + cellPadding, y + 7, { width: colWidth - cellPadding * 2, align: 'center' });
        y += headerHeight;

        // Строки таблицы: подтягиваем все реквизиты из карточек компаний
        const rows: string[][] = [
            [
                `ТОО «${this.stripCompanyPrefix(forwarder.name)}»`,
                `ТОО «${this.stripCompanyPrefix(customer.name)}»`
            ],
        ];
        const addRow = (label: string, fVal?: string | null, cVal?: string | null) => {
            const l = fVal ? `${label}${fVal}` : '';
            const r = cVal ? `${label}${cVal}` : '';
            if (l || r) rows.push([l, r]);
        };
        addRow('Юр. адрес: ', forwarder.address, customer.address);
        addRow('Факт. адрес: ', forwarder.actualAddress, customer.actualAddress);
        addRow('БИН/ИИН: ', forwarder.bin, customer.bin);
        addRow('р/счёт: ', forwarder.bankAccount, customer.bankAccount);
        addRow('Банк: ', forwarder.bankName, customer.bankName);
        addRow('БИК/SWIFT: ', forwarder.bankBic, customer.bankBic);
        addRow('КБЕ: ', forwarder.kbe, customer.kbe);
        addRow('тел.: ', forwarder.phone, customer.phone);
        addRow('E-mail: ', forwarder.email, customer.email);
        addRow('Директор: ', forwarder.directorName, customer.directorName);

        doc.font('Roboto').fontSize(9);

        for (const row of rows) {
            // Измеряем высоту текста в обеих ячейках
            const leftHeight = doc.heightOfString(row[0], { width: colWidth - cellPadding * 2 });
            const rightHeight = doc.heightOfString(row[1], { width: colWidth - cellPadding * 2 });
            const rowHeight = Math.max(leftHeight, rightHeight) + cellPadding * 2;

            // Проверяем нужна ли новая страница
            if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
                doc.addPage();
                y = doc.page.margins.top;
            }

            doc.rect(leftX, y, colWidth, rowHeight).stroke();
            doc.rect(rightX, y, colWidth, rowHeight).stroke();

            if (row[0]) {
                // Первая строка (названия компаний) жирным
                if (row[0].startsWith('ТОО')) {
                    doc.font('Roboto-Bold');
                } else {
                    doc.font('Roboto');
                }
                doc.text(row[0], leftX + cellPadding, y + cellPadding, { width: colWidth - cellPadding * 2 });
            }
            if (row[1]) {
                if (row[1].startsWith('ТОО')) {
                    doc.font('Roboto-Bold');
                } else {
                    doc.font('Roboto');
                }
                doc.text(row[1], rightX + cellPadding, y + cellPadding, { width: colWidth - cellPadding * 2 });
            }

            y += rowHeight;
        }

        doc.y = y;

        // ============ БЛОК ДЛЯ ПОДПИСЕЙ И ПЕЧАТЕЙ (без рамок) ============
        doc.moveDown(2);

        const signBlockY = doc.y;
        const signColWidth = 230;
        const signLeftX = leftX;
        const signRightX = leftX + 250;

        // Подчёркнутые заголовки ЭКСПЕДИТОР / ЗАКАЗЧИК
        doc.fontSize(10).font('Roboto-Bold');
        doc.text('ЭКСПЕДИТОР', signLeftX, signBlockY, { width: signColWidth, align: 'center', underline: true });
        doc.text('ЗАКАЗЧИК', signRightX, signBlockY, { width: signColWidth, align: 'center', underline: true });

        // Названия компаний жирным
        const compNameY = signBlockY + 18;
        doc.fontSize(9).font('Roboto-Bold');
        const fClean = this.stripCompanyPrefix(forwarder.name);
        const cClean = this.stripCompanyPrefix(customer.name);
        doc.text(`ТОО «${fClean}»`, signLeftX, compNameY, { width: signColWidth, align: 'center' });
        doc.text(`ТОО «${cClean}»`, signRightX, compNameY, { width: signColWidth, align: 'center' });

        // Строки подписи с ФИО директора (как в шаблоне: «Фамилия И.О. /____/»)
        const signLineY = compNameY + 50;
        doc.fontSize(10).font('Roboto-Bold');
        const fwdDir = forwarder.directorName ? `Директор ${forwarder.directorName}` : 'Директор';
        const custDir = customer.directorName ? `Директор ${customer.directorName}` : 'Директор';
        doc.text(`${fwdDir} __________`, signLeftX, signLineY, { width: signColWidth });
        doc.text(`${custDir} __________`, signRightX, signLineY, { width: signColWidth });

        // ============ ПОДПИСИ РУКОВОДИТЕЛЕЙ ============
        const signatureW = 85;
        const signatureH = 35;
        const signatureY = signLineY - 15;

        // Подпись экспедитора (слева)
        if (forwarderSignatureBuffer) {
            try {
                doc.image(forwarderSignatureBuffer, signLeftX + 55, signatureY, {
                    width: signatureW,
                    height: signatureH,
                });
                this.logger.log(`[ContractPdf] Rendered forwarder signature`);
            } catch (err) {
                this.logger.error(`[ContractPdf] Failed to render forwarder signature:`, err);
            }
        }

        // Подпись заказчика (справа)
        if (customerSignatureBuffer) {
            try {
                doc.image(customerSignatureBuffer, signRightX + 55, signatureY, {
                    width: signatureW,
                    height: signatureH,
                });
                this.logger.log(`[ContractPdf] Rendered customer signature`);
            } catch (err) {
                this.logger.error(`[ContractPdf] Failed to render customer signature:`, err);
            }
        }

        // ============ ПЕЧАТИ КОМПАНИЙ ============
        const stampY = signBlockY - 15;
        const stampSize = 110;

        // Печать экспедитора (слева)
        if (forwarderStampBuffer) {
            try {
                doc.image(forwarderStampBuffer, signLeftX + (signColWidth - stampSize) / 2, stampY, {
                    width: stampSize,
                    height: stampSize,
                });
                this.logger.log(`[ContractPdf] Rendered forwarder stamp`);
            } catch (err) {
                this.logger.error(`[ContractPdf] Failed to render forwarder stamp:`, err);
            }
        }

        // Печать заказчика (справа)
        if (customerStampBuffer) {
            try {
                doc.image(customerStampBuffer, signRightX + (signColWidth - stampSize) / 2, stampY, {
                    width: stampSize,
                    height: stampSize,
                });
                this.logger.log(`[ContractPdf] Rendered customer stamp`);
            } catch (err) {
                this.logger.error(`[ContractPdf] Failed to render customer stamp:`, err);
            }
        }

        doc.y = signLineY + 30;
    }

    // ============ КОЛОНТИТУЛЫ НА КАЖДОЙ СТРАНИЦЕ ============
    private addHeadersAndFooters(
        doc: PDFKit.PDFDocument,
        contractNum: string,
        dateStr: string,
        forwarder: any,
        customer: any,
        images: {
            forwarderStampBuffer: Buffer | null;
            forwarderSignatureBuffer: Buffer | null;
            customerStampBuffer: Buffer | null;
            customerSignatureBuffer: Buffer | null;
        },
    ) {
        const range = doc.bufferedPageRange(); // { start, count }
        const leftX = doc.page.margins.left;
        const rightColX = 320;
        const width = 235;
        const lastPageIndex = range.start + range.count - 1;

        const fwdDirector = forwarder.directorName ? `${forwarder.directorName} /____/` : 'Директор /____/';
        const custDirector = customer.directorName ? `${customer.directorName} /____/` : 'Директор /____/';

        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);

            // Отключаем нижнее поле на время рисования колонтитула, иначе pdfkit
            // считает запись ниже границы поля переполнением и добавляет пустые страницы
            const savedBottom = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;

            // Верхний колонтитул — со второй страницы
            if (i > range.start) {
                doc.fontSize(8).font('Roboto').fillColor('#666666');
                doc.text(`Договор № ${contractNum} от ${dateStr} года`, leftX, 25, {
                    width: doc.page.width - leftX - doc.page.margins.right,
                    align: 'left',
                    lineBreak: false,
                });
            }

            // Печать и подпись на каждой странице (кроме последней — там уже большой блок).
            // Рисуются только если компания загрузила картинки в настройках.
            const imgY = doc.page.height - 70;
            if (i !== lastPageIndex) {
                this.drawFooterSignAndStamp(doc, leftX, imgY, images.forwarderSignatureBuffer, images.forwarderStampBuffer);
                this.drawFooterSignAndStamp(doc, rightColX, imgY, images.customerSignatureBuffer, images.customerStampBuffer);
            }

            // Строка подписи директора внизу
            const footerY = doc.page.height - 22;
            doc.fontSize(8).font('Roboto').fillColor('#000000');
            doc.text(fwdDirector, leftX, footerY, { width, align: 'left', lineBreak: false });
            doc.text(custDirector, rightColX, footerY, { width, align: 'left', lineBreak: false });

            doc.page.margins.bottom = savedBottom;
        }
    }

    /** Небольшие подпись и печать в колонтитуле страницы */
    private drawFooterSignAndStamp(
        doc: PDFKit.PDFDocument,
        x: number,
        y: number,
        signatureBuffer: Buffer | null,
        stampBuffer: Buffer | null,
    ) {
        if (signatureBuffer) {
            try {
                doc.image(signatureBuffer, x, y + 10, { width: 55, height: 22 });
            } catch (err) {
                this.logger.error('[ContractPdf] footer signature failed:', err);
            }
        }
        if (stampBuffer) {
            try {
                doc.image(stampBuffer, x + 65, y, { width: 42, height: 42 });
            } catch (err) {
                this.logger.error('[ContractPdf] footer stamp failed:', err);
            }
        }
    }

    // ============ HELPER METHODS ============

    private addArticle(doc: PDFKit.PDFDocument, title: string) {
        this.ensureSpace(doc, 40);
        doc.moveDown(0.5);
        doc.fontSize(11).font('Roboto-Bold');
        doc.text(title, { align: 'center' });
        doc.moveDown(0.3);
    }

    private addSubheading(doc: PDFKit.PDFDocument, text: string) {
        this.ensureSpace(doc, 30);
        doc.fontSize(10).font('Roboto-Bold');
        doc.text(text, { align: 'left', indent: 20 });
        doc.moveDown(0.2);
    }

    private addParagraph(doc: PDFKit.PDFDocument, number: string, text: string) {
        this.ensureSpace(doc, 25);
        doc.fontSize(10).font('Roboto');
        doc.text(`${number} ${text}`, { align: 'justify', lineGap: 1, indent: 20 });
        doc.moveDown(0.2);
    }

    private ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
        if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
        }
    }

    private getMonthName(date: Date): string {
        const months = [
            'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
        ];
        return months[date.getMonth()];
    }

    /** Убирает префикс ТОО/TOO из названия компании */
    private stripCompanyPrefix(name: string): string {
        return name.replace(/^(ТОО|TOO|тоо)\s+/i, '').trim();
    }

    private async getImageBuffer(relativePath: string): Promise<Buffer | null> {
        if (this.s3Service.isS3Enabled()) {
            try {
                this.logger.log(`[ContractPdf] Attempting S3 download for path: ${relativePath}`);
                const { stream } = await this.s3Service.downloadFile(relativePath);
                return new Promise<Buffer>((resolve, reject) => {
                    const chunks: Buffer[] = [];
                    stream.on('data', (chunk) => chunks.push(chunk));
                    stream.on('end', () => resolve(Buffer.concat(chunks)));
                    stream.on('error', (err) => reject(err));
                });
            } catch (error: any) {
                this.logger.warn(`[ContractPdf] S3 download failed for ${relativePath}. Falling back to local file. Error: ${error.message}`);
            }
        } else {
            this.logger.log(`[ContractPdf] S3 is not enabled, using local storage check`);
        }

        const localPath = path.join(process.cwd(), relativePath);
        this.logger.log(`[ContractPdf] Checking local path: ${localPath}`);
        if (fs.existsSync(localPath)) {
            try {
                return fs.readFileSync(localPath);
            } catch (e) {
                this.logger.error(`[ContractPdf] Failed to read local file at ${localPath}:`, e);
                return null;
            }
        } else {
            this.logger.warn(`[ContractPdf] Local file not found at: ${localPath}`);
        }
        return null;
    }
}
