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
        const driverName = driver
            ? `${driver.lastName} ${driver.firstName} ${driver.middleName || ''}`.trim()
            : (order.assignedDriverName || '—');
        const driverDoc = driver?.docNumber || driver?.iin || '—';
        const driverPlate = driver?.vehiclePlate || order.assignedDriverPlate || '—';
        const driverTrailer = driver?.trailerNumber || order.assignedDriverTrailer || '—';
        const driverPhone = driver?.phone || order.assignedDriverPhone || '';

        // Получатель груза (из точки доставки)
        const deliveryPoint = order.routePoints?.find(p => p.pointType === 'DELIVERY');
        const receiverName = deliveryPoint?.location?.name || deliveryPoint?.location?.contactName || '';

        // Маршрут
        const pickupPoint = order.routePoints?.find(p => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
        const pickupCity = pickupPoint?.location?.city || pickupPoint?.location?.address || '—';
        const deliveryCity = deliveryPoint?.location?.city || deliveryPoint?.location?.address || '—';
        const route = `${pickupCity} → ${deliveryCity}`;

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 40, left: 50, right: 50 },
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

            const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
            const leftM = doc.page.margins.left;

            // ============ ШАПКА ============
            const issuerClean = this.stripCompanyPrefix(issuerCompany.name);
            const isCustomerIssuer = (issuerCompany.id === order.customerCompanyId);
            const headerText = isCustomerIssuer ? 'ФИРМЕННЫЙ БЛАНК КОМПАНИИ-ЗАКАЗЧИКА' : 'ФИРМЕННЫЙ БЛАНК КОМПАНИИ-ОТПРАВИТЕЛЯ ДОВЕРЕННОСТИ';
            const companyLabel = isCustomerIssuer ? 'Наименование компании-заказчика' : 'Наименование компании';

            doc.fontSize(12).font('Roboto-Bold');
            doc.text(headerText, { align: 'center' });
            doc.moveDown(1.5);

            // Номер доверенности
            const docNum = order.orderNumber || '____';
            doc.fontSize(14).font('Roboto-Bold');
            doc.text(`ДОВЕРЕННОСТЬ N ${docNum}`, { align: 'center' });
            doc.moveDown(1);

            // Город и дата
            const now = new Date();
            const city = issuerCompany.address ? issuerCompany.address.split(',')[0] : 'г. Алматы';
            const dateStr = `«${now.getDate()}» ${this.getMonthName(now)} ${now.getFullYear()} года`;

            doc.fontSize(10).font('Roboto');
            doc.text(city, { align: 'left' });
            doc.text(`Республика Казахстан`, { continued: true, align: 'left' });
            doc.text(dateStr, { align: 'right' });
            doc.moveDown(1);

            // ============ ПРЕАМБУЛА ============
            const directorName = issuerCompany.directorName || '_______________';

            doc.fontSize(10).font('Roboto');
            doc.text('Настоящей доверенностью, ', { continued: true, align: 'justify', lineGap: 2 });
            doc.font('Roboto-Bold').text(`ТОО "${issuerClean}"`, { continued: true });
            doc.font('Roboto').text(` в лице ${directorName}, действующего на основании Устава`, { align: 'justify', lineGap: 2 });
            doc.moveDown(0.3);
            doc.text('доверяет водителю:', { align: 'left' });
            doc.moveDown(0.5);

            // ============ ТАБЛИЦА ВОДИТЕЛЯ ============
            this.drawDriverTable(doc, {
                name: driverName,
                docNumber: driverDoc,
                plate: driverPlate,
                trailer: driverTrailer,
                phone: driverPhone,
            });
            doc.moveDown(0.5);
            doc.x = leftM; // Reset x position after table

            // ============ ТЕКСТ ДОВЕРЕННОСТИ ============
            const executorClean = this.stripCompanyPrefix(executorCompany.name);
            const issuerBin = issuerCompany.bin || '—';
            const executorBin = executorCompany.bin || '—';

            doc.fontSize(10).font('Roboto');
            doc.text('действовать от своего имени и совершать все необходимые действия, связанные с транспортно-экспедиционным обслуживанием грузов, в рамках заявки ', { continued: true, align: 'justify', lineGap: 2, width: pageWidth });
            doc.font('Roboto-Bold').text(`№ ${order.orderNumber}`, { continued: true });
            doc.font('Roboto').text(` между `, { continued: true });
            doc.font('Roboto-Bold').text(`ТОО "${issuerClean}"`, { continued: true });
            doc.font('Roboto').text(` (БИН ${issuerBin}) и `, { continued: true });
            doc.font('Roboto-Bold').text(`ТОО "${executorClean}"`, { continued: true });
            doc.font('Roboto').text(` (БИН ${executorBin}).`, { align: 'justify', lineGap: 2, width: pageWidth });
            doc.moveDown(0.5);

            // Полномочия
            const powers = [
                'Получение/забор груза на складе отправителя,',
                'Доставлять/перевозить получателю адресованный ему груз,',
                'Сдавать груз получателю,',
                'Получать на руки от отправителя и передавать получателю сопроводительные документы на груз,',
                'Оформление/составление товарно-транспортной накладной на груз,',
                'Получать от отправителя необходимую информацию о грузе,',
                'Присутствовать при составлении Коммерческих актов, подписывать их и вносить свои комментарии,',
                'Осуществлять иные действия, направленные на обеспечение сохранности и целостности груза.',
            ];

            for (let i = 0; i < powers.length; i++) {
                doc.text(`${i + 1}. ${powers[i]}`, leftM, doc.y, { indent: 10, lineGap: 1, width: pageWidth });
            }
            doc.moveDown(0.5);

            // ============ ИНФОРМАЦИЯ О ГРУЗЕ ============
            doc.font('Roboto-Bold').text('Информация о вверенном грузе:', leftM, doc.y, { align: 'left', width: pageWidth });
            doc.moveDown(0.3);

            this.drawCargoTable(doc, {
                senderName: issuerCompany.name,
                receiverName: receiverName,
                cargoDescription: order.cargoDescription || '—',
                weight: order.cargoWeight ? String(order.cargoWeight) : '—',
                volume: order.cargoVolume ? String(order.cargoVolume) : '',
                route: route,
                additionalInfo: order.requirements || '',
            });
            doc.moveDown(1);

            // ============ НИЖНИЙ БЛОК ============
            this.ensureSpace(doc, 200);

            doc.font('Roboto').fontSize(10);
            doc.text('Настоящая доверенность выдана без права передоверия, сроком на один месяц.', leftM, doc.y, { align: 'left', lineGap: 2, width: pageWidth });
            doc.moveDown(0.3);
            doc.text('Подпись лица, получившего доверенность ________________________________.', leftM, doc.y, { lineGap: 2, width: pageWidth });
            doc.moveDown(0.3);
            doc.text(`Я, __________________________________, доверенное лицо в рамках настоящей доверенности беру на себя ответственность за обеспечение сохранности груза в пути следования.`, leftM, doc.y, { align: 'justify', lineGap: 2, width: pageWidth });
            doc.moveDown(1.5);

            // ============ ПОДПИСЬ ДИРЕКТОРА ============
            const signY = doc.y;

            doc.font('Roboto').fontSize(10);
            doc.text('Директор', leftM, signY);
            doc.text(`${companyLabel} ТОО "${issuerClean}"`, leftM, signY + 15);
            doc.text(`ФИО ${directorName}`, leftM, signY + 30);
            doc.text('/___________________/', leftM + 300, signY + 30);

            // ============ ПЕЧАТЬ ============
            if (stampBuffer) {
                try {
                    doc.image(stampBuffer, leftM + 300, signY - 20, {
                        width: 120,
                        height: 120,
                    });
                    this.logger.log(`[PoA] Successfully rendered stamp image on PDF`);
                } catch (err) {
                    this.logger.error(`[PoA] Failed to render stamp image onto PDF:`, err);
                }
            }

            // ============ ПОДПИСЬ ДИРЕКТОРА (РИСУНОК) ============
            if (signatureBuffer) {
                try {
                    doc.image(signatureBuffer, leftM + 320, signY + 10, {
                        width: 100,
                        height: 40,
                    });
                    this.logger.log(`[PoA] Successfully rendered signature image on PDF`);
                } catch (err) {
                    this.logger.error(`[PoA] Failed to render signature image onto PDF:`, err);
                }
            }

            doc.end();
        });
    }

    // ============ ТАБЛИЦА ВОДИТЕЛЯ ============
    private drawDriverTable(doc: PDFKit.PDFDocument, data: {
        name: string; docNumber: string; plate: string; trailer: string; phone: string;
    }) {
        const startX = doc.page.margins.left;
        const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const cols = [
            { title: 'ФИО', width: tableWidth * 0.28 },
            { title: 'Паспортные\nданные', width: tableWidth * 0.18 },
            { title: 'Гос. номер\nавто', width: tableWidth * 0.14 },
            { title: 'Гос. номер\nприцепа', width: tableWidth * 0.14 },
            { title: 'Доп.\nинформация/контакты\nводителя', width: tableWidth * 0.26 },
        ];

        let x = startX;
        let y = doc.y;
        const headerH = 35;

        // Заголовки
        doc.fontSize(8).font('Roboto-Bold');
        for (const col of cols) {
            doc.rect(x, y, col.width, headerH).stroke();
            doc.text(col.title, x + 3, y + 4, { width: col.width - 6, align: 'center' });
            x += col.width;
        }
        y += headerH;

        // Данные
        const rowH = 22;
        const values = [data.name, data.docNumber, data.plate, data.trailer, data.phone];
        x = startX;
        doc.fontSize(8).font('Roboto');
        for (let i = 0; i < cols.length; i++) {
            doc.rect(x, y, cols[i].width, rowH).stroke();
            doc.text(values[i], x + 3, y + 5, { width: cols[i].width - 6, align: 'center' });
            x += cols[i].width;
        }

        doc.y = y + rowH;
        doc.x = doc.page.margins.left;
    }

    // ============ ТАБЛИЦА ГРУЗА ============
    private drawCargoTable(doc: PDFKit.PDFDocument, data: {
        senderName: string; receiverName: string;
        cargoDescription: string; weight: string; volume: string;
        route: string; additionalInfo: string;
    }) {
        const startX = doc.page.margins.left;
        const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const labelW = 150;
        const valueW = tableWidth - labelW;
        let y = doc.y;

        const drawRow = (label: string, value: string, height = 20) => {
            doc.rect(startX, y, labelW, height).stroke();
            doc.rect(startX + labelW, y, valueW, height).stroke();
            doc.fontSize(9).font('Roboto-Bold');
            doc.text(label, startX + 5, y + 5, { width: labelW - 10 });
            doc.fontSize(9).font('Roboto');
            doc.text(value, startX + labelW + 5, y + 5, { width: valueW - 10 });
            y += height;
        };

        drawRow('Отправитель груза:', data.senderName);
        drawRow('Получатель груза:', data.receiverName);

        // Детали груза — таблица с подстолбцами
        const subCols = [
            { title: 'Наименование груза:', width: tableWidth * 0.25 },
            { title: 'Вес/объем', width: tableWidth * 0.15 },
            { title: 'Количество', width: tableWidth * 0.12 },
            { title: 'Маршрут', width: tableWidth * 0.25 },
            { title: 'Доп. Информация', width: tableWidth * 0.23 },
        ];

        // Заголовки подтаблицы
        let x = startX;
        const subHeaderH = 20;
        doc.fontSize(8).font('Roboto-Bold');
        for (const col of subCols) {
            doc.rect(x, y, col.width, subHeaderH).stroke();
            doc.text(col.title, x + 2, y + 5, { width: col.width - 4, align: 'center' });
            x += col.width;
        }
        y += subHeaderH;

        // Данные
        const subRowH = 22;
        const subValues = [data.cargoDescription, data.weight, data.volume || '—', data.route, data.additionalInfo || '—'];
        x = startX;
        doc.fontSize(8).font('Roboto');
        for (let i = 0; i < subCols.length; i++) {
            doc.rect(x, y, subCols[i].width, subRowH).stroke();
            doc.text(subValues[i], x + 2, y + 5, { width: subCols[i].width - 4, align: 'center' });
            x += subCols[i].width;
        }
        y += subRowH;

        doc.y = y;
        doc.x = doc.page.margins.left;
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
}
