import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class PowerOfAttorneyService {
    private readonly logger = new Logger(PowerOfAttorneyService.name);

    constructor(
        private prisma: PrismaService,
        private s3Service: S3Service,
    ) { }

    async generatePdf(orderId: string, companyId: string): Promise<Buffer> {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customer: { include: { company: true } },
                driver: true,
                customerCompany: true,
                forwarder: true,
                subForwarder: true,
                partner: true,
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
            },
        });

        if (!order) throw new NotFoundException('Заявка не найдена');

        // Определяем компанию-эмитента (кто выписывает доверенность) и исполнителя (кто везет груз)
        let issuerCompany: any = null;
        let executorCompany: any = null;

        if (companyId && order.forwarderId === companyId) {
            issuerCompany = order.forwarder || await this.prisma.company.findUnique({ where: { id: companyId } });
            executorCompany = order.subForwarder || order.partner || issuerCompany;
        } else if (companyId && order.subForwarderId === companyId) {
            issuerCompany = order.subForwarder || await this.prisma.company.findUnique({ where: { id: companyId } });
            executorCompany = order.partner || issuerCompany;
        } else {
            issuerCompany = order.customerCompany || await this.prisma.company.findUnique({ where: { id: companyId } });
            executorCompany = order.subForwarder || order.forwarder || order.partner || issuerCompany;
        }

        if (!issuerCompany) throw new NotFoundException('Компания-отправитель не найдена');
        if (!executorCompany) throw new NotFoundException('Компания-исполнитель не найдена');

        // Загружаем буферы для печати и подписи компании-эмитента (Заказчика)
        let stampBuffer: Buffer | null = null;
        let signatureBuffer: Buffer | null = null;

        this.logger.log(`[PoA] Issuer company "${issuerCompany.name}" (ID: ${issuerCompany.id}) has stampImage="${issuerCompany.stampImage}", signatureImage="${issuerCompany.signatureImage}"`);

        if (issuerCompany.stampImage) {
            stampBuffer = await this.getImageBuffer(issuerCompany.stampImage);
            this.logger.log(`[PoA] Loaded stampBuffer: ${stampBuffer ? stampBuffer.length + ' bytes' : 'failed/null'}`);
        }
        if (issuerCompany.signatureImage) {
            signatureBuffer = await this.getImageBuffer(issuerCompany.signatureImage);
            this.logger.log(`[PoA] Loaded signatureBuffer: ${signatureBuffer ? signatureBuffer.length + ' bytes' : 'failed/null'}`);
        }

        // Данные водителя
        const driver = order.driver;
        
        let driverLastName = '—';
        let driverFirstName = '';
        let driverMiddleName = '';
        
        if (driver) {
            driverLastName = driver.lastName || '';
            driverFirstName = driver.firstName || '';
            driverMiddleName = driver.middleName || '';
        } else if (order.assignedDriverName) {
            const parts = order.assignedDriverName.trim().split(/\s+/);
            if (parts.length > 0) driverLastName = parts[0];
            if (parts.length > 1) driverFirstName = parts[1];
            if (parts.length > 2) driverMiddleName = parts.slice(2).join(' ');
        }
        
        const driverName = driver
            ? `${driver.lastName} ${driver.firstName} ${driver.middleName || ''}`.trim()
            : (order.assignedDriverName || '—');
        const driverDoc = driver?.docNumber || driver?.iin || '—';
        const driverPlate = driver?.vehiclePlate || order.assignedDriverPlate || '—';
        const driverTrailer = driver?.trailerNumber || order.assignedDriverTrailer || '—';
        
        const driverShort = `${driverLastName} ${driverFirstName ? driverFirstName[0] + '.' : ''} ${driverMiddleName ? driverMiddleName[0] + '.' : ''}`.trim();
        let docTypeStr = driver?.docType === 'PASSPORT' ? 'Иностранный паспорт' : 'Удостоверение личности';
        const docIssuedBy = driver?.docIssuedBy || '—';

        // Получатель груза (из точки доставки)
        const deliveryPoint = order.routePoints?.find(p => p.pointType === 'DELIVERY');

        // Маршрут
        const pickupPoint = order.routePoints?.find(p => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
        const pickupCity = pickupPoint?.location?.city || pickupPoint?.location?.address || '—';
        const deliveryCity = deliveryPoint?.location?.city || deliveryPoint?.location?.address || '—';
        const route = `${pickupCity} - ${deliveryCity}`;

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 30, bottom: 30, left: 30, right: 30 },
                info: {
                    Title: `Доверенность к заявке ${order.orderNumber}`,
                    Author: issuerCompany.name,
                },
            });

            // Шрифты
            const fontsDir = path.join(__dirname, '..', 'contracts', 'fonts');
            doc.registerFont('Roboto', path.join(fontsDir, 'Roboto-Regular.ttf'));
            doc.registerFont('Roboto-Bold', path.join(fontsDir, 'Roboto-Bold.ttf'));

            const buffers: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            const leftM = doc.page.margins.left;
            const rightEdge = doc.page.width - doc.page.margins.right;
            const tableWidth = rightEdge - leftM; // 535 pt

            // Format fields
            const orgDetails = this.formatCompanyDetails(issuerCompany);
            const bankDetails = this.formatBankDetails(issuerCompany);

            const vehicleParts: string[] = [];
            if (driver?.vehicleModel) vehicleParts.push(driver.vehicleModel);
            if (driverPlate && driverPlate !== '—') vehicleParts.push(driverPlate);
            if (driverTrailer && driverTrailer !== '—') vehicleParts.push(`ПП ${driverTrailer}`);
            const vehicleInfo = vehicleParts.join(' ') || '—';

            const supplierNameFormatted = this.formatFullCompanyName(pickupPoint?.location?.name || '—');

            // ============================================
            // 1. TOP STUB TABLE (Корешок доверенности)
            // ============================================
            let curY = 30;
            
            // Column widths (сумма должна оставаться прежней — ширина таблицы)
            const w1 = 90;
            const w2 = 65;
            const w3 = 65;
            const w4 = 165;
            const w5 = 150;

            const x1 = leftM;
            const x2 = x1 + w1;
            const x3 = x2 + w2;
            const x4 = x3 + w3;
            const x5 = x4 + w4;

            // Row 1 (Headers)
            doc.strokeColor('#000000').lineWidth(0.5);
            
            const drawCellHeader = (x: number, w: number, text: string) => {
                doc.rect(x, curY, w, 30).stroke();
                doc.fontSize(7).font('Roboto-Bold').text(text, x + 2, curY + 2, { width: w - 4, align: 'center' });
            };

            drawCellHeader(x1, w1, 'Номер доверенности');
            drawCellHeader(x2, w2, 'Дата выдачи');
            drawCellHeader(x3, w3, 'Срок действия');
            drawCellHeader(x4, w4, 'Должность и фамилия лица, которому выдана доверенность');
            drawCellHeader(x5, w5, 'Расписка в получении доверенности');

            curY += 30;

            // Row 2 (Indexes 1-5)
            const drawCellIndex = (x: number, w: number, text: string) => {
                doc.rect(x, curY, w, 10).stroke();
                doc.fontSize(6).font('Roboto').text(text, x + 2, curY + 2, { width: w - 4, align: 'center' });
            };

            drawCellIndex(x1, w1, '1');
            drawCellIndex(x2, w2, '2');
            drawCellIndex(x3, w3, '3');
            drawCellIndex(x4, w4, '4');
            drawCellIndex(x5, w5, '5');

            curY += 10;

            // Row 3 (Values 1-5)
            // Автоподбор размера шрифта: значение всегда в одну строку внутри ячейки
            const drawCellValue = (x: number, w: number, text: string, isBold = false) => {
                doc.rect(x, curY, w, 20).stroke();
                const font = isBold ? 'Roboto-Bold' : 'Roboto';
                let size = 7;
                doc.font(font).fontSize(size);
                while (size > 4.5 && doc.widthOfString(text) > w - 6) {
                    size -= 0.5;
                    doc.fontSize(size);
                }
                doc.text(text, x + 3, curY + 6, { width: w - 6, align: 'center', lineBreak: false });
            };

            const validToDate = deliveryPoint?.expectedDate 
                ? new Date(deliveryPoint.expectedDate) 
                : new Date(order.createdAt.getTime() + 10 * 24 * 60 * 60 * 1000);

            drawCellValue(x1, w1, order.orderNumber, true);
            drawCellValue(x2, w2, this.formatDateDDMMYYYY(order.createdAt));
            drawCellValue(x3, w3, this.formatDateDDMMYYYY(validToDate));
            drawCellValue(x4, w4, `Водитель ${driverShort}`, true);
            drawCellValue(x5, w5, '');

            curY += 20;

            // Row 4 (Headers 6-8)
            const drawCellHeader2 = (x: number, w: number, text: string) => {
                doc.rect(x, curY, w, 20).stroke();
                doc.fontSize(7).font('Roboto-Bold').text(text, x + 2, curY + 2, { width: w - 4, align: 'center' });
            };

            drawCellHeader2(x1, w1 + w2 + w3, 'Поставщик');
            drawCellHeader2(x4, w4, 'Номер и дата наряда (замещающего наряд документа) или извещения');
            drawCellHeader2(x5, w5, 'Номер и дата документа, подтверждающего выполнение поручения');

            curY += 20;

            // Row 5 (Indexes 6-8)
            drawCellIndex(x1, w1 + w2 + w3, '6');
            drawCellIndex(x4, w4, '7');
            drawCellIndex(x5, w5, '8');

            curY += 10;

            // Row 6 (Values 6-8)
            const drawCellValueLarge = (x: number, w: number, text: string, isBold = false) => {
                doc.rect(x, curY, w, 30).stroke();
                doc.fontSize(7).font(isBold ? 'Roboto-Bold' : 'Roboto').text(text, x + 4, curY + 5, { width: w - 8, align: 'left' });
            };

            drawCellValueLarge(x1, w1 + w2 + w3, supplierNameFormatted, true);
            drawCellValueLarge(x4, w4, '');
            drawCellValueLarge(x5, w5, '');

            curY += 30;

            // Cut-off line
            curY += 10;
            doc.strokeColor('#555555').lineWidth(0.5).dash(3, { space: 3 });
            doc.moveTo(leftM, curY).lineTo(rightEdge, curY).stroke();
            doc.undash();
            doc.fontSize(7).font('Roboto').text('Линия отреза', leftM, curY - 3, { align: 'center', width: tableWidth });

            curY += 15;

            // ============================================
            // 2. MAIN PART
            // ============================================
            
            // Typographical form indicator
            doc.strokeColor('#000000');
            doc.fontSize(7).font('Roboto').text('Типовая межотраслевая форма № М-2', leftM, curY, { align: 'right', width: tableWidth });
            curY += 10;

            // OKUD codes box
            const codesX = rightEdge - 70;
            const codesY = curY;
            
            doc.rect(codesX, codesY, 70, 10).stroke();
            doc.fontSize(7).font('Roboto-Bold').text('коды', codesX, codesY + 2, { width: 70, align: 'center' });

            doc.rect(codesX, codesY + 10, 70, 15).stroke();
            doc.fontSize(7).font('Roboto-Bold').text('0315001', codesX, codesY + 14, { width: 70, align: 'center' });

            doc.rect(codesX, codesY + 25, 70, 15).stroke();

            doc.fontSize(8).font('Roboto').text('Форма по ОКУД', codesX - 90, codesY + 14, { width: 85, align: 'right' });
            doc.fontSize(8).font('Roboto').text('по ОКПО', codesX - 90, codesY + 29, { width: 85, align: 'right' });

            // Organization info on the left
            doc.fontSize(8).font('Roboto-Bold').text('Организация', leftM, curY + 5, { width: 60 });
            doc.fontSize(8).font('Roboto').text(orgDetails, leftM + 65, curY + 5, { width: 300, lineGap: 4 });
            
            doc.moveTo(leftM + 65, curY + 14).lineTo(codesX - 100, curY + 14).stroke();
            doc.moveTo(leftM, curY + 27).lineTo(codesX - 100, curY + 27).stroke();

            curY += 45;

            // Power of Attorney Title
            doc.fontSize(12).font('Roboto-Bold').text(`ДОВЕРЕННОСТЬ № ${order.orderNumber}`, leftM, curY, { align: 'center', width: tableWidth });
            curY += 20;

            // Issue & validity dates
            doc.fontSize(8).font('Roboto').text('Дата выдачи', leftM + 50, curY, { width: 80 });
            doc.fontSize(8).font('Roboto-Bold').text(this.formatDateLong(order.createdAt), leftM + 135, curY, { width: 250 });
            doc.moveTo(leftM + 135, curY + 9).lineTo(leftM + 385, curY + 9).stroke();
            curY += 15;

            doc.fontSize(8).font('Roboto').text('Доверенность действительна по', leftM + 50, curY, { width: 150 });
            doc.fontSize(8).font('Roboto-Bold').text(this.formatDateLong(validToDate), leftM + 205, curY, { width: 180 });
            doc.moveTo(leftM + 205, curY + 9).lineTo(leftM + 385, curY + 9).stroke();
            curY += 20;

            // Consumer (Потребитель)
            doc.fontSize(8).font('Roboto-Bold').text(orgDetails, leftM, curY, { width: tableWidth, lineGap: 3 });
            doc.moveTo(leftM, curY + 9).lineTo(rightEdge, curY + 9).stroke();
            doc.moveTo(leftM, curY + 21).lineTo(rightEdge, curY + 21).stroke();
            doc.fontSize(6).font('Roboto').text('(наименование потребителя и его адрес)', leftM, curY + 23, { width: tableWidth, align: 'center' });
            curY += 32;

            // Payer (Плательщик)
            doc.fontSize(8).font('Roboto-Bold').text(orgDetails, leftM, curY, { width: tableWidth, lineGap: 3 });
            doc.moveTo(leftM, curY + 9).lineTo(rightEdge, curY + 9).stroke();
            doc.moveTo(leftM, curY + 21).lineTo(rightEdge, curY + 21).stroke();
            doc.fontSize(6).font('Roboto').text('(наименование плательщика и его адрес)', leftM, curY + 23, { width: tableWidth, align: 'center' });
            curY += 32;

            // Bank (Банк)
            doc.fontSize(8).font('Roboto').text('Счет №', leftM, curY);
            doc.fontSize(8).font('Roboto-Bold').text(bankDetails, leftM + 40, curY, { width: tableWidth - 40 });
            doc.moveTo(leftM + 40, curY + 9).lineTo(rightEdge, curY + 9).stroke();
            doc.fontSize(6).font('Roboto').text('(наименование банка)', leftM + 40, curY + 11, { width: tableWidth - 40, align: 'center' });
            curY += 22;

            // Driver выдана
            doc.fontSize(8).font('Roboto').text('Доверенность выдана', leftM, curY);
            
            // Position
            doc.fontSize(8).font('Roboto-Bold').text('Водитель', leftM + 110, curY, { width: 80, align: 'center' });
            doc.moveTo(leftM + 110, curY + 9).lineTo(leftM + 190, curY + 9).stroke();
            doc.fontSize(6).font('Roboto').text('должность', leftM + 110, curY + 11, { width: 80, align: 'center' });
            
            // Name
            doc.fontSize(8).font('Roboto-Bold').text(driverName, leftM + 195, curY, { width: tableWidth - 195, align: 'center' });
            doc.moveTo(leftM + 195, curY + 9).lineTo(rightEdge, curY + 9).stroke();
            doc.fontSize(6).font('Roboto').text('фамилия, имя, отчество', leftM + 195, curY + 11, { width: tableWidth - 195, align: 'center' });
            curY += 22;

            // Passport
            doc.fontSize(8).font('Roboto').text(docTypeStr + ':', leftM, curY, { width: 110 });
            doc.fontSize(8).font('Roboto-Bold').text(driverDoc, leftM + 110, curY, { width: tableWidth - 110 });
            doc.moveTo(leftM + 110, curY + 9).lineTo(rightEdge, curY + 9).stroke();
            curY += 15;

            doc.fontSize(8).font('Roboto').text('Кем выдан', leftM, curY, { width: 110 });
            doc.fontSize(8).font('Roboto-Bold').text(docIssuedBy, leftM + 110, curY, { width: tableWidth - 110 });
            doc.moveTo(leftM + 110, curY + 9).lineTo(rightEdge, curY + 9).stroke();
            curY += 15;

            doc.fontSize(8).font('Roboto').text('Дата выдачи', leftM, curY, { width: 110 });
            doc.fontSize(8).font('Roboto-Bold').text(driver?.docIssuedAt ? this.formatDocDate(driver.docIssuedAt) : '—', leftM + 110, curY, { width: tableWidth - 110 });
            doc.moveTo(leftM + 110, curY + 9).lineTo(rightEdge, curY + 9).stroke();
            curY += 15;

            // Vehicle details
            doc.fontSize(8).font('Roboto').text('Данные на в/м', leftM, curY, { width: 110 });
            doc.fontSize(8).font('Roboto-Bold').text(vehicleInfo, leftM + 110, curY, { width: tableWidth - 110 });
            doc.moveTo(leftM + 110, curY + 9).lineTo(rightEdge, curY + 9).stroke();
            curY += 18;

            // Supplier
            doc.fontSize(8).font('Roboto').text('На получение от', leftM, curY, { width: 110 });
            doc.fontSize(8).font('Roboto-Bold').text(supplierNameFormatted, leftM + 110, curY, { width: tableWidth - 110 });
            doc.moveTo(leftM + 110, curY + 9).lineTo(rightEdge, curY + 9).stroke();
            doc.fontSize(6).font('Roboto').text('(наименование поставщика)', leftM + 110, curY + 11, { width: tableWidth - 110, align: 'center' });
            curY += 22;

            // Contract/order details
            doc.fontSize(8).font('Roboto').text('материальных ценностей по', leftM, curY, { width: 130 });
            const docText = `Договор-заявка №${order.orderNumber} от ${this.formatDateDDMMYYYY(order.createdAt)} ${route}`;
            doc.fontSize(8).font('Roboto-Bold').text(docText, leftM + 130, curY, { width: tableWidth - 130 });
            doc.moveTo(leftM + 130, curY + 9).lineTo(rightEdge, curY + 9).stroke();
            doc.fontSize(6).font('Roboto').text('(наименование, номер и дата документа)', leftM + 130, curY + 11, { width: tableWidth - 130, align: 'center' });
            curY += 28;

            // ============================================
            // 3. GOODS TABLE
            // ============================================
            doc.fontSize(8).font('Roboto-Bold').text('Перечень товарно-материальных ценностей, подлежащих получению', leftM, curY, { align: 'center', width: tableWidth });
            curY += 10;

            // Table widths
            const gtW1 = 40;
            const gtW2 = 265;
            const gtW3 = 80;
            const gtW4 = 150;

            const gtX1 = leftM;
            const gtX2 = gtX1 + gtW1;
            const gtX3 = gtX2 + gtW2;
            const gtX4 = gtX3 + gtW3;

            // Table Header Row 1
            const drawGtHeader = (x: number, w: number, text: string) => {
                doc.rect(x, curY, w, 20).stroke();
                doc.fontSize(7).font('Roboto-Bold').text(text, x + 2, curY + 2, { width: w - 4, align: 'center' });
            };

            drawGtHeader(gtX1, gtW1, 'Номер\nпо порядку');
            drawGtHeader(gtX2, gtW2, 'Материальные ценности');
            drawGtHeader(gtX3, gtW3, 'Единица\nизмерения');
            drawGtHeader(gtX4, gtW4, 'Количество (прописью)');

            curY += 20;

            // Table Header Row 2 (numbers)
            const drawGtIndex = (x: number, w: number, text: string) => {
                doc.rect(x, curY, w, 10).stroke();
                doc.fontSize(6).font('Roboto').text(text, x + 2, curY + 2, { width: w - 4, align: 'center' });
            };

            drawGtIndex(gtX1, gtW1, '1');
            drawGtIndex(gtX2, gtW2, '2');
            drawGtIndex(gtX3, gtW3, '3');
            drawGtIndex(gtX4, gtW4, '4');

            curY += 10;

            // Table Value Row 3
            const drawGtValue = (x: number, w: number, text: string, isBold = false) => {
                doc.rect(x, curY, w, 20).stroke();
                doc.fontSize(7).font(isBold ? 'Roboto-Bold' : 'Roboto').text(text, x + 4, curY + 6, { width: w - 8, align: x === gtX2 ? 'left' : 'center' });
            };

            const tons = (order.cargoWeight || 0) / 1000;
            const qtyText = `${tons} (${this.numberToRussianWords(tons)})`;

            drawGtValue(gtX1, gtW1, '1');
            drawGtValue(gtX2, gtW2, order.cargoDescription || '—', true);
            drawGtValue(gtX3, gtW3, 'Тонна');
            drawGtValue(gtX4, gtW4, qtyText, true);

            curY += 20;

            // ============================================
            // 4. SIGNATURES
            // ============================================
            curY += 20;

            // Recipient line
            doc.fontSize(8).font('Roboto').text('Подпись лица, получившего доверенность', leftM, curY);
            doc.moveTo(leftM + 195, curY + 9).lineTo(leftM + 315, curY + 9).stroke();
            doc.fontSize(6).text('подпись', leftM + 195, curY + 11, { width: 120, align: 'center' });
            doc.fontSize(8).text('удостоверяем.', leftM + 325, curY);

            curY += 25;

            // Director line
            const directorY = curY;
            doc.fontSize(8).text('Руководитель', leftM, directorY);
            doc.moveTo(leftM + 110, directorY + 9).lineTo(leftM + 230, directorY + 9).stroke();
            doc.fontSize(6).text('подпись', leftM + 110, directorY + 11, { width: 120, align: 'center' });

            if (signatureBuffer) {
                try {
                    doc.image(signatureBuffer, leftM + 130, directorY - 12, {
                        width: 80,
                        height: 20,
                    });
                    this.logger.log(`[PoA] Successfully rendered signature image on PDF`);
                } catch (err) {
                    this.logger.error(`[PoA] Failed to render signature image onto PDF:`, err);
                }
            }

            doc.fontSize(8).font('Roboto-Bold').text(issuerCompany.directorName || '—', leftM + 240, directorY, { width: 150, align: 'center' });
            doc.moveTo(leftM + 240, directorY + 9).lineTo(leftM + 390, directorY + 9).stroke();
            doc.fontSize(6).font('Roboto').text('расшифровка подписи', leftM + 240, directorY + 11, { width: 150, align: 'center' });

            curY += 25;

            // Accountant line
            const accountantY = curY;
            doc.fontSize(8).text('Главный бухгалтер', leftM, accountantY);
            doc.moveTo(leftM + 110, accountantY + 9).lineTo(leftM + 230, accountantY + 9).stroke();
            doc.fontSize(6).text('подпись', leftM + 110, accountantY + 11, { width: 120, align: 'center' });

            doc.moveTo(leftM + 240, accountantY + 9).lineTo(leftM + 390, accountantY + 9).stroke();
            doc.fontSize(6).text('расшифровка подписи', leftM + 240, accountantY + 11, { width: 150, align: 'center' });

            // M.P.
            doc.fontSize(8).font('Roboto-Bold').text('М.П.', leftM + 10, accountantY - 10);

            if (stampBuffer) {
                try {
                    doc.image(stampBuffer, leftM + 35, directorY - 30, {
                        width: 90,
                        height: 90,
                    });
                    this.logger.log(`[PoA] Successfully rendered stamp image on PDF`);
                } catch (err) {
                    this.logger.error(`[PoA] Failed to render stamp image onto PDF:`, err);
                }
            }

            doc.end();
        });
    }

    private numberToRussianWords(num: number): string {
        const numberToRussianWordsInt = (n: number, useFemaleForUnits = false): string => {
            if (n === 0) return 'ноль';
            
            const units = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
            const unitsFemale = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
            const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемьнадцать', 'девятнадцать'];
            const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
            const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
            
            const words: string[] = [];
            const chunks: number[] = [];
            let temp = n;
            while (temp > 0) {
                chunks.push(temp % 1000);
                temp = Math.floor(temp / 1000);
            }
            
            const chunkNames = [
                { name: ['', '', ''], female: false },
                { name: ['тысяча', 'тысячи', 'тысяч'], female: true },
                { name: ['миллион', 'миллиона', 'миллионов'], female: false },
                { name: ['миллиард', 'миллиарда', 'миллиардов'], female: false }
            ];
            
            const getPluralForm = (val: number, forms: string[]): string => {
                const mod10 = val % 10;
                const mod100 = val % 100;
                if (mod100 >= 11 && mod100 <= 19) return forms[2];
                if (mod10 === 1) return forms[0];
                if (mod10 >= 2 && mod10 <= 4) return forms[1];
                return forms[2];
            };
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                if (chunk === 0) continue;
                
                const chunkWords: string[] = [];
                const h = Math.floor(chunk / 100);
                const t = Math.floor((chunk % 100) / 10);
                const u = chunk % 10;
                
                if (h > 0) chunkWords.push(hundreds[h]);
                
                if (t === 1) {
                    chunkWords.push(teens[u]);
                } else {
                    if (t > 0) chunkWords.push(tens[t]);
                    if (u > 0) {
                        if (chunkNames[i].female || (i === 0 && useFemaleForUnits)) {
                            chunkWords.push(unitsFemale[u]);
                        } else {
                            chunkWords.push(units[u]);
                        }
                    }
                }
                
                if (i > 0) {
                    const form = getPluralForm(chunk, chunkNames[i].name);
                    chunkWords.push(form);
                }
                
                words.unshift(...chunkWords);
            }
            
            return words.join(' ');
        };

        if (num === 0) return 'Ноль';
        
        const parts = num.toString().split('.');
        const integerPart = parseInt(parts[0], 10);
        const decimalPart = parts[1] ? parseInt(parts[1], 10) : 0;
        
        if (decimalPart === 0) {
            const res = numberToRussianWordsInt(integerPart);
            return res.charAt(0).toUpperCase() + res.slice(1);
        }
        
        let integerWords = numberToRussianWordsInt(integerPart);
        let integerSuffix = 'целых';
        const lastDigitInt = integerPart % 10;
        const lastTwoDigitsInt = integerPart % 100;
        if (lastDigitInt === 1 && lastTwoDigitsInt !== 11) {
            integerWords = numberToRussianWordsInt(integerPart, true);
            integerSuffix = 'целая';
        } else if ((lastDigitInt === 2 || lastDigitInt === 3 || lastDigitInt === 4) && !(lastTwoDigitsInt >= 12 && lastTwoDigitsInt <= 14)) {
            integerWords = numberToRussianWordsInt(integerPart, true);
        }
        
        const decimalLength = parts[1].length;
        let decimalWords = numberToRussianWordsInt(decimalPart);
        let decimalSuffix = '';
        
        if (decimalLength === 1) {
            const lastDigitDec = decimalPart % 10;
            if (lastDigitDec === 1) {
                decimalWords = numberToRussianWordsInt(decimalPart, true);
                decimalSuffix = 'десятая';
            } else {
                if (lastDigitDec === 2) decimalWords = numberToRussianWordsInt(decimalPart, true);
                decimalSuffix = 'десятых';
            }
        } else if (decimalLength === 2) {
            const lastDigitDec = decimalPart % 10;
            const lastTwoDigitsDec = decimalPart % 100;
            if (lastDigitDec === 1 && lastTwoDigitsDec !== 11) {
                decimalWords = numberToRussianWordsInt(decimalPart, true);
                decimalSuffix = 'сотая';
            } else {
                if (lastDigitDec === 2 && lastTwoDigitsDec !== 12) decimalWords = numberToRussianWordsInt(decimalPart, true);
                decimalSuffix = 'сотых';
            }
        } else {
            const lastDigitDec = decimalPart % 10;
            const lastTwoDigitsDec = decimalPart % 100;
            if (lastDigitDec === 1 && lastTwoDigitsDec !== 11) {
                decimalWords = numberToRussianWordsInt(decimalPart, true);
                decimalSuffix = 'тысячная';
            } else {
                if (lastDigitDec === 2 && lastTwoDigitsDec !== 12) decimalWords = numberToRussianWordsInt(decimalPart, true);
                decimalSuffix = 'тысячных';
            }
        }
        
        const result = `${integerWords} ${integerSuffix} ${decimalWords} ${decimalSuffix}`;
        return result.charAt(0).toUpperCase() + result.slice(1);
    }

    private formatFullCompanyName(name: string): string {
        if (!name) return '—';
        let clean = name.trim();
        if (/^(ТОО|TOO|тоо)\s+/i.test(clean)) {
            const withoutPrefix = clean.replace(/^(ТОО|TOO|тоо)\s+/i, '').trim();
            const withoutQuotes = withoutPrefix.replace(/^["'?«](.*)["'?»]$/, '$1').trim();
            return `Товарищество с ограниченной ответственностью "${withoutQuotes}"`;
        }
        if (/\s+(ТОО|TOO|тоо)$/i.test(clean)) {
            const withoutSuffix = clean.replace(/\s+(ТОО|TOO|тоо)$/i, '').trim();
            const withoutQuotes = withoutSuffix.replace(/^["'?«](.*)["'?»]$/, '$1').trim();
            return `Товарищество с ограниченной ответственностью "${withoutQuotes}"`;
        }
        return clean;
    }

    private formatCompanyDetails(company: any): string {
        let fullName = this.formatFullCompanyName(company.name);
        const parts: string[] = [fullName];
        if (company.bin) {
            parts.push(`ИИН ${company.bin}`);
        }
        if (company.address) {
            parts.push(`Юр. адрес: ${company.address}`);
        }
        if (company.phone) {
            parts.push(`тел.: ${company.phone}`);
        }
        return parts.join(', ');
    }

    private formatBankDetails(company: any): string {
        const parts: string[] = [];
        if (company.bankAccount) {
            parts.push(`p/c ${company.bankAccount}`);
        }
        if (company.bankName) {
            parts.push(`в банке ${company.bankName}`);
        }
        if (company.bankBic) {
            const bicLabel = /^[A-Z]{6,8}/i.test(company.bankBic) ? 'SWIFT' : 'БИК';
            parts.push(`${bicLabel} ${company.bankBic}`);
        }
        return parts.join(', ');
    }

    private formatDocDate(date: Date | null | undefined): string {
        if (!date) return '—';
        const d = new Date(date);
        return `«${d.getDate()}» ${this.getMonthName(d)} ${d.getFullYear()} г.`;
    }

    private formatDateLong(date: Date | null | undefined): string {
        if (!date) return '—';
        const d = new Date(date);
        return `${d.getDate()} ${this.getMonthName(d)} ${d.getFullYear()} г.`;
    }

    private formatDateDDMMYYYY(date: Date): string {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
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

    private stripCompanyPrefix(name: string): string {
        return name.replace(/^(ТОО|TOO|тоо)\s+/i, '').trim();
    }

    private async getImageBuffer(relativePath: string): Promise<Buffer | null> {
        if (this.s3Service.isS3Enabled()) {
            try {
                this.logger.log(`[PoA] Attempting S3 download for path: ${relativePath}`);
                const { stream } = await this.s3Service.downloadFile(relativePath);
                return new Promise<Buffer>((resolve, reject) => {
                    const chunks: Buffer[] = [];
                    stream.on('data', (chunk) => chunks.push(chunk));
                    stream.on('end', () => resolve(Buffer.concat(chunks)));
                    stream.on('error', (err) => reject(err));
                });
            } catch (error: any) {
                this.logger.warn(`[PoA] S3 download failed for ${relativePath}. Falling back to local file. Error: ${error.message}`);
            }
        } else {
            this.logger.log(`[PoA] S3 is not enabled, using local storage check`);
        }

        const localPath = path.join(process.cwd(), relativePath);
        this.logger.log(`[PoA] Checking local path: ${localPath}`);
        if (fs.existsSync(localPath)) {
            try {
                return fs.readFileSync(localPath);
            } catch (e) {
                this.logger.error(`[PoA] Failed to read local file at ${localPath}:`, e);
                return null;
            }
        } else {
            this.logger.warn(`[PoA] Local file not found at: ${localPath}`);
        }
        return null;
    }

    private declineNameToGenitive(fullName: string): string {
        if (!fullName || fullName.trim() === '') return '_______________';
        
        const parts = fullName.trim().split(/\s+/);
        if (parts.length === 0) return '_______________';

        // Определение пола по отчеству или имени
        let isFemale = false;
        for (const part of parts) {
            const lowerPart = part.toLowerCase();
            if (lowerPart.endsWith('на') || lowerPart.endsWith('кызы')) {
                isFemale = true;
                break;
            }
        }

        const declinedParts = parts.map((part, index) => {
            const cleanPart = part.replace(/[^a-zA-Zа-яА-ЯёЁ\-]/g, '');
            if (!cleanPart) return part;

            const declined = this.declineWord(cleanPart, isFemale, index, parts.length);
            return part.replace(cleanPart, declined);
        });

        return declinedParts.join(' ');
    }

    private declineWord(word: string, isFemale: boolean, partIndex: number, totalParts: number): string {
        const lower = word.toLowerCase();
        
        if (lower.endsWith('ич')) {
            return word + 'а';
        }
        if (lower.endsWith('на')) {
            return word.slice(0, -1) + 'ы';
        }
        if (lower.endsWith('кызы')) {
            return word;
        }
        if (lower.endsWith('улы') || lower.endsWith('уулу')) {
            return word;
        }

        let isLastName = false;
        let isFirstName = false;

        if (totalParts === 3) {
            if (partIndex === 0) isLastName = true;
            if (partIndex === 1) isFirstName = true;
        } else if (totalParts === 2) {
            if (partIndex === 1) {
                isLastName = true;
            } else {
                isFirstName = true;
            }
        } else {
            isLastName = lower.endsWith('ов') || lower.endsWith('ев') || lower.endsWith('ин') || lower.endsWith('ий') || lower.endsWith('ая') || lower.endsWith('ова') || lower.endsWith('ева') || lower.endsWith('ина');
            isFirstName = !isLastName;
        }

        if (isFemale) {
            if (isLastName) {
                if (lower.endsWith('ая')) {
                    return word.slice(0, -2) + 'ой';
                }
                if (lower.endsWith('ова') || lower.endsWith('ева')) {
                    return word.slice(0, -1) + 'ой';
                }
                if (lower.endsWith('ина') || lower.endsWith('ына')) {
                    return word.slice(0, -1) + 'ой';
                }
                return word;
            } else {
                if (lower.endsWith('ия')) {
                    return word.slice(0, -2) + 'ии';
                }
                if (lower.endsWith('я')) {
                    return word.slice(0, -1) + 'и';
                }
                if (lower.endsWith('а')) {
                    const beforeA = lower.slice(-2, -1);
                    if (['г', 'к', 'х', 'ж', 'ч', 'ш', 'щ'].includes(beforeA)) {
                        return word.slice(0, -1) + 'и';
                    }
                    return word.slice(0, -1) + 'ы';
                }
                if (lower.endsWith('ь')) {
                    return word.slice(0, -1) + 'и';
                }
                return word;
            }
        } else {
            if (isLastName) {
                if (lower.endsWith('ий') || lower.endsWith('ый')) {
                    return word.slice(0, -2) + 'ого';
                }
                if (lower.endsWith('ов') || lower.endsWith('ев')) {
                    return word + 'а';
                }
                if (lower.endsWith('ин') || lower.endsWith('ын')) {
                    return word + 'а';
                }
                if (this.isConsonant(lower.slice(-1))) {
                    return word + 'а';
                }
                return word;
            } else {
                if (lower.endsWith('ий')) {
                    return word.slice(0, -2) + 'ия';
                }
                if (lower.endsWith('й')) {
                    return word.slice(0, -1) + 'я';
                }
                if (lower.endsWith('ь')) {
                    return word.slice(0, -1) + 'я';
                }
                if (lower.endsWith('а') || lower.endsWith('я')) {
                    if (lower.endsWith('я')) return word.slice(0, -1) + 'и';
                    return word.slice(0, -1) + 'ы';
                }
                if (this.isConsonant(lower.slice(-1))) {
                    return word + 'а';
                }
                return word;
            }
        }
    }

    private isConsonant(char: string): boolean {
        return 'бвгджзйклмнпрстфхцчшщ'.includes(char);
    }
}
