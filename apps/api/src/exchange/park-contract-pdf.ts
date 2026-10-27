import * as path from 'path';
import * as PDFDocument from 'pdfkit';
import { ddmmyyyy, ParkContractContent, ContractParty } from './park-contract';

/** Подпись водителя в приложении — чем подтверждена. */
export interface DriverSignature {
    signedAt: Date;
    device: string | null;
    ip: string | null;
}

const INK = '#111111';
const MUTED = '#555555';
const LEFT = 56;
const WIDTH = 483;

/**
 * Договор парка в PDF — из замороженного текста подписи.
 *
 * Шрифты — те же, что у договоров с заказчиками (`contracts/fonts`), чтобы
 * документы платформы печатались одним почерком. Печать и подпись парка —
 * из его кабинета («Печать и подпись»), если загружены; за водителя —
 * отметка о подписи в приложении: когда, с какого устройства и адреса.
 *
 * Договор с владельцем машины (Q9) подписывают на бумаге: `signature` нет,
 * и за вторую сторону остаётся строка для подписи от руки.
 */
export function renderParkContractPdf(
    content: ParkContractContent,
    signature: DriverSignature | null,
    park: { stamp: Buffer | null; signature: Buffer | null },
): Promise<Buffer> {
    // В договорах, подписанных до 26.10.2026, вида нет: там всегда аренда с экипажем.
    const subtitle = content.subtitle ?? 'аренды транспортного средства с экипажем';
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 48, bottom: 48, left: LEFT, right: 56 },
            bufferPages: true,
            info: { Title: content.title, Author: content.lessee.name, Subject: `Договор ${subtitle}` },
        });
        const fontsDir = path.join(__dirname, '..', 'contracts', 'fonts');
        doc.registerFont('Roboto', path.join(fontsDir, 'Roboto-Regular.ttf'));
        doc.registerFont('Roboto-Bold', path.join(fontsDir, 'Roboto-Bold.ttf'));

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const ensure = (needed: number) => {
            if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
        };

        // Шапка: название, номер, дата.
        doc.fillColor(INK).font('Roboto-Bold').fontSize(13);
        doc.text('ДОГОВОР', { align: 'center' });
        doc.fontSize(11).text(subtitle, { align: 'center' });
        doc.moveDown(0.3);
        doc.font('Roboto').fontSize(10);
        doc.text(`№ ${content.number}`, LEFT, doc.y, { width: WIDTH / 2, continued: false });
        doc.moveUp();
        doc.text(`${ddmmyyyy(new Date(`${content.date}T00:00:00Z`))}`, LEFT + WIDTH / 2, doc.y, { width: WIDTH / 2, align: 'right' });
        doc.moveDown(0.8);
        doc.x = LEFT;
        doc.text(content.preamble, { align: 'justify', width: WIDTH, lineGap: 1 });

        for (const section of content.sections) {
            ensure(48);
            doc.moveDown(0.6);
            doc.font('Roboto-Bold').fontSize(10.5).text(section.title, LEFT, doc.y, { width: WIDTH, align: 'center' });
            doc.moveDown(0.3);
            for (const item of section.items) {
                ensure(28);
                doc.font('Roboto').fontSize(10).text(`${item.n} ${item.text}`, LEFT, doc.y, { width: WIDTH, align: 'justify', lineGap: 1 });
                doc.moveDown(0.25);
            }
        }

        // Реквизиты — две колонки, слева парк, справа водитель.
        ensure(200);
        doc.moveDown(0.8);
        doc.font('Roboto-Bold').fontSize(10.5).text(`${content.sections.length + 1}. Реквизиты и подписи сторон`, LEFT, doc.y, { width: WIDTH, align: 'center' });
        doc.moveDown(0.4);
        const colW = WIDTH / 2 - 8;
        const top = doc.y;
        const leftEnd = party(doc, content.lessee, LEFT, top, colW);
        const rightEnd = party(doc, content.lessor, LEFT + WIDTH / 2 + 8, top, colW);
        doc.y = Math.max(leftEnd, rightEnd) + 18;

        // Подписи. Блок рисуется по координатам — место под него целиком.
        if (doc.y + 120 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        const signY = doc.y;
        doc.font('Roboto').fontSize(9.5).fillColor(INK);
        doc.text(`${content.lesseeSignLabel ?? 'За Арендатора'}: ${content.lesseeSigner || ''}`, LEFT, signY, { width: colW });
        doc.text('_______________________', LEFT, signY + 40, { width: colW });
        if (park.signature) {
            try { doc.image(park.signature, LEFT + 10, signY + 14, { fit: [110, 40] }); } catch { /* битая картинка — подпись линией */ }
        }
        if (park.stamp) {
            try { doc.image(park.stamp, LEFT + 110, signY + 4, { fit: [90, 90] }); } catch { /* битая картинка — без печати */ }
        }

        const rx = LEFT + WIDTH / 2 + 8;
        if (signature) {
            doc.text(`${content.lessor.role}: ${content.lessor.name}`, rx, signY, { width: colW });
            doc.font('Roboto-Bold').fontSize(9).text('Подписано в приложении LogiCore', rx, signY + 18, { width: colW });
            doc.font('Roboto').fontSize(8.5).fillColor(MUTED);
            const when = signature.signedAt.toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            doc.text(`${when} (время Алматы)`, rx, doc.y, { width: colW });
            if (signature.device) doc.text(`устройство: ${signature.device}`, rx, doc.y, { width: colW });
            if (signature.ip) doc.text(`адрес: ${signature.ip}`, rx, doc.y, { width: colW });
        } else {
            // Подпись от руки: за организацию — с именем подписанта, за человека — своё ФИО.
            const who = content.lessorSigner ? `За ${content.lessor.role === 'Арендодатель' ? 'Арендодателя' : content.lessor.role}: ${content.lessorSigner}` : `${content.lessor.role}: ${content.lessor.name}`;
            doc.text(who, rx, signY, { width: colW });
            doc.text('_______________________', rx, signY + 40, { width: colW });
            doc.font('Roboto').fontSize(8).fillColor(MUTED).text('подпись', rx, signY + 54, { width: colW });
        }

        // Внизу каждой страницы — номер договора и страница: распечатку не перепутать.
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(range.start + i);
            const bottom = doc.page.height - 32;
            // Строка ниже нижнего поля: без снятия поля pdfkit счёл бы, что
            // страница кончилась, и завёл пустую новую — так выходило шесть
            // страниц вместо трёх.
            const margin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.font('Roboto').fontSize(8).fillColor(MUTED);
            doc.text(`Договор № ${content.number} · версия текста ${content.version} · стр. ${i + 1} из ${range.count}`, LEFT, bottom, { width: WIDTH, align: 'center', lineBreak: false });
            doc.page.margins.bottom = margin;
        }
        doc.end();
    });
}

/** Колонка реквизитов стороны; возвращает, где она кончилась. */
function party(doc: PDFKit.PDFDocument, p: ContractParty, x: number, y: number, width: number): number {
    doc.fillColor(INK).font('Roboto-Bold').fontSize(9.5).text(p.role.toUpperCase(), x, y, { width });
    doc.font('Roboto-Bold').fontSize(9.5).text(p.name, x, doc.y + 2, { width });
    doc.font('Roboto').fontSize(9);
    for (const line of p.lines) doc.text(`${line.label}: ${line.value}`, x, doc.y + 1, { width });
    return doc.y;
}
