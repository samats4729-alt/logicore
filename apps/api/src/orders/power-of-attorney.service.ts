import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class PowerOfAttorneyService {
    constructor(private prisma: PrismaService) { }

    async generatePdf(orderId: string, companyId: string): Promise<Buffer> {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customer: { include: { company: true } },
                driver: true,
                customerCompany: true,
                forwarder: true,
                pickupLocation: true,
                deliveryPoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
            },
        });

        if (!order) throw new NotFoundException('Заявка не найдена');

        // Определяем экспедиторскую компанию (от чьего имени доверенность)
        const forwarderCompany = await this.prisma.company.findUnique({
            where: { id: companyId },
        });

        if (!forwarderCompany) throw new NotFoundException('Компания не найдена');

        // Данные водителя
        const driver = order.driver;
        const driverName = driver
            ? `${driver.lastName} ${driver.firstName} ${driver.middleName || ''}`.trim()
            : (order.assignedDriverName || '—');
        const driverDoc = driver?.docNumber || driver?.iin || '—';
        const driverPlate = driver?.vehiclePlate || order.assignedDriverPlate || '—';
        const driverTrailer = driver?.trailerNumber || order.assignedDriverTrailer || '—';
        const driverPhone = driver?.phone || order.assignedDriverPhone || '';

        // Компания-заказчик (отправитель груза)
        const customerCompany = order.customerCompany;
        const customerName = customerCompany?.name || '—';
        const customerBin = customerCompany?.bin || '—';

        // Получатель груза (из точки доставки)
        const deliveryPoint = order.deliveryPoints?.[0];
        const receiverName = deliveryPoint?.location?.name || deliveryPoint?.location?.contactName || '';

        // Маршрут
        const pickupCity = order.pickupLocation?.city || order.pickupLocation?.address || '—';
        const deliveryCity = deliveryPoint?.location?.city || deliveryPoint?.location?.address || '—';
        const route = `${pickupCity} → ${deliveryCity}`;

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 40, left: 50, right: 50 },
                info: {
                    Title: `Доверенность к заявке ${order.orderNumber}`,
                    Author: forwarderCompany.name,
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
            doc.fontSize(12).font('Roboto-Bold');
            doc.text('ФИРМЕННЫЙ БЛАНК ЭКСПЕДИТОРСКОЙ КОМПАНИИ', { align: 'center' });
            doc.moveDown(1.5);

            // Номер доверенности
            const docNum = order.orderNumber || '____';
            doc.fontSize(14).font('Roboto-Bold');
            doc.text(`ДОВЕРЕННОСТЬ N ${docNum}`, { align: 'center' });
            doc.moveDown(1);

            // Город и дата
            const now = new Date();
            const city = forwarderCompany.address ? forwarderCompany.address.split(',')[0] : 'г. Алматы';
            const dateStr = `«${now.getDate()}» ${this.getMonthName(now)} ${now.getFullYear()} года`;

            doc.fontSize(10).font('Roboto');
            doc.text(city, { align: 'left' });
            doc.text(`Республика Казахстан`, { continued: true, align: 'left' });
            doc.text(dateStr, { align: 'right' });
            doc.moveDown(1);

            // ============ ПРЕАМБУЛА ============
            const fwClean = this.stripCompanyPrefix(forwarderCompany.name);
            const directorName = forwarderCompany.directorName || '_______________';

            doc.fontSize(10).font('Roboto');
            doc.text('Настоящей доверенностью, ', { continued: true, align: 'justify', lineGap: 2 });
            doc.font('Roboto-Bold').text(`ТОО ${fwClean}`, { continued: true });
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

            // ============ ТЕКСТ ДОВЕРЕННОСТИ ============
            doc.fontSize(10).font('Roboto');
            doc.text('действовать от своего имени и совершать все необходимые действия, связанные с транспортно-экспедиционным обслуживанием грузов, в рамках заявки ', { continued: true, align: 'justify', lineGap: 2 });
            doc.font('Roboto-Bold').text(`№ ${order.orderNumber}`, { continued: true });
            doc.font('Roboto').text(` между `, { continued: true });
            doc.font('Roboto-Bold').text(`ТОО "${this.stripCompanyPrefix(customerName)}"`, { continued: true });
            doc.font('Roboto').text(` (БИН ${customerBin}) и `, { continued: true });
            doc.font('Roboto-Bold').text(`ТОО ${fwClean}`, { continued: true });
            doc.font('Roboto').text(` (БИН ${forwarderCompany.bin || '—'}).`, { align: 'justify', lineGap: 2 });
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
                doc.text(`${i + 1}. ${powers[i]}`, { indent: 10, lineGap: 1 });
            }
            doc.moveDown(0.5);

            // ============ ИНФОРМАЦИЯ О ГРУЗЕ ============
            doc.font('Roboto-Bold').text('Информация о вверенном грузе:', { align: 'left' });
            doc.moveDown(0.3);

            this.drawCargoTable(doc, {
                senderName: customerName,
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
            doc.text('Настоящая доверенность выдана без права передоверия, сроком на один месяц.', { align: 'left', lineGap: 2 });
            doc.moveDown(0.3);
            doc.text('Подпись лица, получившего доверенность ________________________________.', { lineGap: 2 });
            doc.moveDown(0.3);
            doc.text(`Я, __________________________________, доверенное лицо в рамках настоящей доверенности беру на себя ответственность за обеспечение сохранности груза в пути следования.`, { align: 'justify', lineGap: 2 });
            doc.moveDown(1.5);

            // ============ ПОДПИСЬ ДИРЕКТОРА ============
            const signY = doc.y;

            doc.font('Roboto').fontSize(10);
            doc.text('Директор', leftM, signY);
            doc.text(`Наименование экспедиторской компании ${fwClean}`, leftM, signY + 15);
            doc.text(`ФИО ${directorName}`, leftM, signY + 30);
            doc.text('/___________________/', leftM + 300, signY + 30);

            // ============ ПЕЧАТЬ ============
            if (forwarderCompany.stampImage) {
                const stampPath = path.join(process.cwd(), forwarderCompany.stampImage);
                if (fs.existsSync(stampPath)) {
                    try {
                        doc.image(stampPath, leftM + 300, signY - 20, {
                            width: 120,
                            height: 120,
                        });
                    } catch { }
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
}
