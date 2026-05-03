import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getDefaultContractTemplate } from './contract-template';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ContractPdfService {
    constructor(private prisma: PrismaService) { }

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

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 60, right: 60 },
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

            // Город слева, дата справа
            doc.fontSize(10).font('Roboto');
            const dateStr = startDate
                ? `«${new Date(startDate).getDate()}» ${this.getMonthName(new Date(startDate))} ${new Date(startDate).getFullYear()}`
                : '«____» ___________ 202_';
            doc.text(city, { continued: true, align: 'left' });
            doc.text(dateStr, { align: 'right' });
            doc.font('Roboto-Bold').text('года', { align: 'center' });
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
            this.drawRequisitesTable(doc, forwarder, customer);

            doc.end();
        });
    }

    // ============ ТАБЛИЦА РЕКВИЗИТОВ ============
    private drawRequisitesTable(doc: PDFKit.PDFDocument, forwarder: any, customer: any) {
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

        // Строки таблицы
        const rows = [
            [
                `ТОО «${this.stripCompanyPrefix(forwarder.name)}»`,
                `ТОО «${this.stripCompanyPrefix(customer.name)}»`
            ],
            [
                forwarder.address || '',
                customer.address || ''
            ],
            [
                forwarder.bin ? `БИН ${forwarder.bin}` : '',
                customer.bin ? `БИН ${customer.bin}` : ''
            ],
            [
                forwarder.phone ? `тел.: ${forwarder.phone}` : '',
                customer.phone ? `Тел/факс: ${customer.phone}` : ''
            ],
        ];

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

        // Строки подписи - Директор__________________ 
        const signLineY = compNameY + 50;
        doc.fontSize(10).font('Roboto-Bold');
        doc.text('Директор__________________', signLeftX, signLineY, { width: signColWidth });
        doc.text('Директор __________________', signRightX, signLineY, { width: signColWidth });

        // ============ ПЕЧАТИ КОМПАНИЙ ============
        const stampY = signBlockY - 10;
        const stampSize = 120;

        // Печать экспедитора (слева)
        if (forwarder.stampImage) {
            const stampPath = path.join(process.cwd(), forwarder.stampImage);
            if (fs.existsSync(stampPath)) {
                try {
                    doc.image(stampPath, signLeftX + (signColWidth - stampSize) / 2, stampY, {
                        width: stampSize,
                        height: stampSize,
                    });
                } catch (e) {
                    // Ignore image rendering errors
                }
            }
        }

        // Печать заказчика (справа)
        if (customer.stampImage) {
            const stampPath = path.join(process.cwd(), customer.stampImage);
            if (fs.existsSync(stampPath)) {
                try {
                    doc.image(stampPath, signRightX + (signColWidth - stampSize) / 2, stampY, {
                        width: stampSize,
                        height: stampSize,
                    });
                } catch (e) {
                    // Ignore image rendering errors
                }
            }
        }

        doc.y = signLineY + 30;
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
}
