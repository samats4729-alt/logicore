import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StampImageService } from '../common/services/stamp-image.service';
import { moneyWithWords } from '../common/utils/amount-to-words';
import { toNum } from '../common/utils/money';

/** Официальный документ печатается чёрным: цветных выделений в нём нет. */
const INK = '#000000';

/**
 * Типовые условия перевозки. Вынесены в константу, потому что это
 * договорной текст: он одинаков для всех перевозок и меняется только
 * осознанно, а не по ходу правки вёрстки.
 */
const TERMS: string[] = [
    'Обязанность Перевозчика обеспечить перевозку конкретного груза наступает с момента подписания настоящего Договора-Заявки. Заявка, подписанная сторонами путем обмена электронными и факсимильными сообщениями, имеет юридическую силу.',
    'Перевозчик обязан принять груз к перевозке по количеству грузовых мест, указанных в транспортной накладной, в процессе погрузки груза — проверить внешнее состояние груза. Представитель Перевозчика (водитель-экспедитор) обязуется контролировать/обеспечивать соответствие размещения и крепления груза внутри транспортных средств, в соответствии с требованиями и стандартами, установленными действующим законодательством РК.',
    'Перевозчик несет полную имущественную ответственность за груз.',
    'Перевозчик обязан доставить груз в пункт назначения, указанный в настоящем Договоре-Заявке.',
    'Перевозчик обязуется в транспортной накладной/товарной накладной при сдаче груза обязательно требовать от грузополучателя подпись (расшифровка подписи обязательна) и оттиск синей печати (обязательно круглой) грузополучателя, подпись водителя сдающего груз (расшифровка подписи обязательна).',
    'Оплата транспортных услуг будет производиться только при наличии оформленной транспортной накладной/товарной накладной, согласно требованиям, указанным в п. 4.5 настоящего договора.',
    'Перевозчик обязан вернуть оригинал Договора-Заявки, а также транспортной накладной/товарной накладной с синей печатью и подписью грузополучателя в течение двадцати пяти дней с момента сдачи груза. Моментом получения транспортных накладных Заказчиком является почтовое уведомление с отметкой получения компетентным лицом.',
    'Перевозчик обязан оплатить штраф за просрочку возврата оригиналов транспортных накладных/товарных накладных в размере 0,5% от стоимости перевозки за каждый день просрочки невозврата; штраф за опоздание на погрузку/разгрузку составляет 5000 (пять тысяч) тенге в сутки; штраф за срыв погрузки (не предоставление на погрузку транспортного средства) в размере 20% от стоимости перевозки.',
    'Перевозчик возмещает все расходы Заказчика, причиненные недостачей, повреждением или утратой груза, в том числе документально подтвержденные убытки (штрафные санкции и т.п.) предъявленные Заказчику от его контрагентов (в том числе грузоотправителей, грузополучателей и т.п.).',
    'Заказчик обязан оплатить штраф за простой транспортного средства в размере 10000 (десять тысяч) тенге в сутки, только при наличии отметок в транспортной накладной. При этом штраф не начисляется и не уплачивается, если простой возник по вине Перевозчика.',
    'Перевозчик не вправе удерживать вверенные ему грузы, в обеспечение причитающейся ему оплаты услуг по перевозке.',
    'Заказчик имеет право изменить адрес выгрузки.',
    'Иные условия, не предусмотренные настоящим Договором-Заявкой, регламентируются законодательством РК.',
    'Любые исправления, уточнения, изменения, сделанные от руки, внесенные в Договор-Заявку не имеют юридической силы.',
    'В случае недостижения сторонами согласия в переговорном порядке, все споры подлежат рассмотрению в Арбитражном суде по месту нахождения Истца.',
];

interface ContractParty {
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
}

/**
 * Договор-заявка на перевозку груза автотранспортом.
 *
 * Документ, который заказчик перевозки подписывает с перевозчиком: он
 * одновременно и заявка (маршрут, груз, сроки, машина и водитель), и
 * договор (условия, штрафы, реквизиты сторон). Собирается из заявки —
 * отдельной сущности под него в системе нет.
 */
@Injectable()
export class OrderContractService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly stamps: StampImageService,
    ) {}

    /**
     * Журнал сформированных договоров-заявок.
     *
     * Здесь именно документы, а не рейсы: договор существует как
     * сохранённая версия со снимком, и в журнале должно быть видно то же
     * самое, что подписано, — включая прежние версии.
     */
    async listContractJournal(companyId: string, query: { from?: string; to?: string }) {
        const documents = await this.prisma.orderContractDocument.findMany({
            where: {
                companyId,
                ...(query.from || query.to
                    ? {
                        createdAt: {
                            gte: query.from ? new Date(query.from) : undefined,
                            lte: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined,
                        },
                    }
                    : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: {
                id: true,
                orderId: true,
                version: true,
                createdAt: true,
                snapshot: true,
                createdBy: { select: { firstName: true, lastName: true } },
                order: { select: { orderNumber: true, status: true } },
            },
        });

        // Действующая версия — с наибольшим номером в рамках заявки.
        const latest = new Map<string, number>();
        for (const document of documents) {
            latest.set(document.orderId, Math.max(latest.get(document.orderId) ?? 0, document.version));
        }

        return documents.map((document) => {
            const snapshot = document.snapshot as any;
            const points = snapshot?.order?.routePoints ?? [];
            return {
                id: document.id,
                orderId: document.orderId,
                orderNumber: snapshot?.order?.orderNumber ?? document.order?.orderNumber ?? null,
                status: document.order?.status ?? null,
                version: document.version,
                isCurrent: latest.get(document.orderId) === document.version,
                createdAt: document.createdAt,
                createdBy: document.createdBy,
                route: points.length
                    ? `${this.place(points[0])} — ${this.place(points[points.length - 1])}`
                    : null,
                carrier: snapshot?.carrier?.name ?? null,
                driverName: snapshot?.order?.assignedDriverName ?? null,
                driverPlate: snapshot?.order?.assignedDriverPlate ?? null,
                amount: snapshot?.order?.driverCost ?? null,
            };
        });
    }

    /**
     * Журнал доверенностей: рейсы с назначенным водителем.
     *
     * Доверенность, в отличие от договора, не фиксируется версиями —
     * она разовая, и печатается из текущих данных заявки.
     */
    async listJournal(
        companyId: string,
        query: { kind: 'POWER_OF_ATTORNEY' | 'CONTRACT'; from?: string; to?: string },
    ) {
        const isContract = query.kind === 'CONTRACT';
        const orders = await this.prisma.order.findMany({
            where: {
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                OR: [
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { customerCompanyId: companyId },
                ],
                ...(isContract
                    // Договор-заявка заключается с перевозчиком: без него
                    // документу не с кем быть подписанным.
                    ? { AND: [{ OR: [{ partnerId: { not: null } }, { subForwarderId: { not: null } }] }] }
                    // Доверенность выдаётся водителю.
                    : { assignedDriverName: { not: null } }),
                ...(query.from || query.to
                    ? {
                        createdAt: {
                            gte: query.from ? new Date(query.from) : undefined,
                            lte: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined,
                        },
                    }
                    : {}),
            },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                createdAt: true,
                assignedDriverName: true,
                assignedDriverPlate: true,
                driverCost: true,
                customerPrice: true,
                partner: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                customerCompany: { select: { id: true, name: true } },
                routePoints: {
                    orderBy: { sequence: 'asc' },
                    select: { location: { select: { city: true, address: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
        });

        return orders.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            createdAt: order.createdAt,
            route: order.routePoints.length
                ? `${this.place(order.routePoints[0])} — ${this.place(order.routePoints[order.routePoints.length - 1])}`
                : null,
            driverName: order.assignedDriverName,
            driverPlate: order.assignedDriverPlate,
            carrier: order.subForwarder?.name ?? order.partner?.name ?? null,
            customer: order.customerCompany?.name ?? null,
            amount: isContract ? order.driverCost : order.customerPrice,
        }));
    }

    /**
     * Сформировать договор-заявку: снять данные заявки и сохранить.
     *
     * Каждое формирование — новая версия. Прежняя остаётся: если сумма
     * изменилась и перевозчику отправили исправленный договор, старый
     * подписанный вариант всё равно должен быть виден.
     */
    async formDocument(orderId: string, companyId: string, userId: string) {
        const { order, customer, carrier } = await this.collect(orderId, companyId);
        const snapshot = this.snapshotOf(order, customer, carrier);

        return this.prisma.$transaction(async (tx) => {
            const last = await tx.orderContractDocument.findFirst({
                where: { orderId },
                orderBy: { version: 'desc' },
                select: { version: true },
            });
            return tx.orderContractDocument.create({
                data: {
                    companyId,
                    orderId,
                    version: (last?.version ?? 0) + 1,
                    snapshot: snapshot as any,
                    createdById: userId,
                },
                select: { id: true, version: true, createdAt: true },
            });
        });
    }

    /** Версии договора по заявке — история для карточки рейса. */
    async listForOrder(orderId: string, companyId: string) {
        const documents = await this.prisma.orderContractDocument.findMany({
            where: { orderId, companyId },
            orderBy: { version: 'desc' },
            select: {
                id: true,
                version: true,
                createdAt: true,
                snapshot: true,
                createdBy: { select: { firstName: true, lastName: true } },
            },
        });
        return documents.map((document, index) => {
            const snapshot = document.snapshot as any;
            return {
                id: document.id,
                version: document.version,
                createdAt: document.createdAt,
                createdBy: document.createdBy,
                // Действующей считается последняя сформированная версия.
                isCurrent: index === 0,
                rate: snapshot?.order?.driverCost ?? null,
                carrierName: snapshot?.carrier?.name ?? null,
                driverName: snapshot?.order?.assignedDriverName ?? null,
            };
        });
    }

    /** Печать сохранённой версии — строго из её снимка. */
    async generateSavedPdf(documentId: string, companyId: string, options?: { withStamp?: boolean }) {
        const document = await this.prisma.orderContractDocument.findFirst({
            where: { id: documentId, companyId },
            select: { snapshot: true },
        });
        if (!document) throw new NotFoundException('Договор-заявка не найден');

        const snapshot = document.snapshot as any;
        const { stamp, signature } = await this.stamps.loadFor(
            snapshot.customer,
            options?.withStamp === true,
        );
        return this.render(snapshot.order, snapshot.customer, snapshot.carrier, { stamp, signature });
    }

    /** Снимок: ровно то, что нужно печатной форме, и ничего лишнего. */
    private snapshotOf(order: any, customer: any, carrier: any) {
        const party = (company: any) => company && {
            id: company.id,
            name: company.name,
            bin: company.bin,
            address: company.address,
            actualAddress: company.actualAddress,
            phone: company.phone,
            email: company.email,
            directorName: company.directorName,
            bankAccount: company.bankAccount,
            bankName: company.bankName,
            bankBic: company.bankBic,
            stampImage: company.stampImage,
            signatureImage: company.signatureImage,
        };
        return {
            order: {
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                cargoDescription: order.cargoDescription,
                cargoWeight: order.cargoWeight,
                cargoVolume: order.cargoVolume,
                cargoType: order.cargoType,
                vehicleModel: order.vehicleModel,
                driverCost: toNum(order.driverCost ?? order.subForwarderPrice ?? 0),
                executorHasVat: order.executorHasVat,
                driverPaymentCondition: order.driverPaymentCondition,
                assignedDriverName: order.assignedDriverName,
                assignedDriverPhone: order.assignedDriverPhone,
                assignedDriverPlate: order.assignedDriverPlate,
                assignedDriverTrailer: order.assignedDriverTrailer,
                driver: order.driver && {
                    firstName: order.driver.firstName,
                    lastName: order.driver.lastName,
                    phone: order.driver.phone,
                },
                routePoints: (order.routePoints || []).map((point: any) => ({
                    pointType: point.pointType,
                    expectedDate: point.expectedDate,
                    notes: point.notes,
                    location: point.location && {
                        city: point.location.city,
                        address: point.location.address,
                        contactName: point.location.contactName,
                    },
                })),
            },
            customer: party(customer),
            carrier: party(carrier),
        };
    }

    /** Заявка и обе стороны для формирования и «живой» печати. */
    private async collect(orderId: string, companyId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customerCompany: true,
                forwarder: true,
                subForwarder: true,
                partner: true,
                driver: true,
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        const customer = [order.forwarder, order.partner, order.subForwarder, order.customerCompany]
            .find((company) => company?.id === companyId);
        if (!customer) {
            throw new BadRequestException('Ваша организация не участвует в этой заявке');
        }
        const carrier = [order.subForwarder, order.partner]
            .find((company) => company && company.id !== companyId) ?? null;
        return { order, customer, carrier };
    }

    async generatePdf(orderId: string, companyId: string, options?: { withStamp?: boolean }) {
        const { order, customer, carrier } = await this.collect(orderId, companyId);

        // Печать только своя и только по флажку — см. правило T-04.
        const { stamp, signature } = await this.stamps.loadFor(
            customer,
            options?.withStamp === true,
        );

        return this.render(order, customer, carrier, { stamp, signature });
    }

    private render(
        order: any,
        customer: ContractParty & { id: string },
        carrier: (ContractParty & { id: string }) | null,
        images: { stamp: Buffer | null; signature: Buffer | null },
    ): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 34, bottom: 34, left: 34, right: 34 },
                info: { Title: `Договор-заявка ${order.orderNumber}` },
            });
            // Шрифты лежат рядом со сборкой, как у остальных печатных форм.
            const fontsDir = path.join(__dirname, '..', 'contracts', 'fonts');
            try {
                doc.registerFont('Roboto', path.join(fontsDir, 'Roboto-Regular.ttf'));
                doc.registerFont('Roboto-Bold', path.join(fontsDir, 'Roboto-Bold.ttf'));
            } catch (error) {
                // Без своих шрифтов кириллица превратится в кракозябры —
                // молча отдавать такой документ нельзя.
                reject(error);
                return;
            }

            const chunks: Buffer[] = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            doc.fillColor(INK);
            const left = doc.page.margins.left;
            const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

            this.drawHeader(doc, order, customer, left, width);
            this.drawConditions(doc, order, left, width);
            this.drawPrice(doc, order, left, width);
            this.drawVehicle(doc, order, left, width);
            this.drawTerms(doc, left, width);
            this.drawParties(doc, customer, carrier, left, width, images);

            doc.end();
        });
    }

    private drawHeader(doc: any, order: any, customer: ContractParty, left: number, width: number) {
        doc.font('Roboto-Bold').fontSize(12).text(customer.name || '', left, doc.y, {
            width,
            align: 'right',
        });
        const contacts = [
            customer.phone ? `Тел: ${customer.phone}` : null,
            customer.email ? `Email: ${customer.email}` : null,
        ].filter(Boolean).join(' | ');
        if (contacts) {
            doc.font('Roboto').fontSize(8).text(contacts, left, doc.y + 2, { width, align: 'right' });
        }

        doc.moveDown(1.2);
        const date = new Date(order.createdAt);
        doc.font('Roboto-Bold').fontSize(11).text(
            `ДОГОВОР-ЗАЯВКА № ${order.orderNumber} от ${this.longDate(date)}`,
            left, doc.y, { width, align: 'center' },
        );
        doc.font('Roboto').fontSize(8).text('на перевозку груза автотранспортом', left, doc.y + 2, {
            width, align: 'center',
        });
        doc.moveDown(0.8);
    }

    private drawConditions(doc: any, order: any, left: number, width: number) {
        this.sectionTitle(doc, '1. Условия перевозки:', left, width);

        const points = order.routePoints || [];
        const route = points.length
            ? `${this.place(points[0])} — ${this.place(points[points.length - 1])}`
            : '—';
        doc.font('Roboto-Bold').fontSize(8).text('Маршрут перевозки:', left, doc.y, { continued: true });
        doc.font('Roboto-Bold').text(`   ${route}`, { underline: true });
        doc.moveDown(0.5);

        points.forEach((point: any, index: number) => {
            const isPickup = point.pointType !== 'DELIVERY';
            const title = `${index + 1} место: (${isPickup ? 'ПОГРУЗКА' : 'РАЗГРУЗКА'})`;
            const when = point.expectedDate
                ? `дата ${this.longDate(new Date(point.expectedDate))}   время с 08:00 по 20:00`
                : '';
            doc.font('Roboto-Bold').fontSize(8).text(title, left, doc.y, { continued: Boolean(when) });
            if (when) doc.font('Roboto-Bold').text(`      ${when}`);

            this.field(doc, isPickup ? 'Адрес погрузки:' : 'Адрес разгрузки:', point.location?.address || '', left);
            this.field(doc, 'Контактное лицо:', point.location?.contactName || '', left);
            this.field(doc, isPickup ? 'Способ погрузки:' : 'Способ разгрузки:', 'Задняя', left);
            this.field(doc, 'Груз/параметры:', this.cargo(order), left);
            this.field(doc, 'Дополнительно:', point.notes || '', left);
            doc.moveDown(0.3);
        });
    }

    private drawPrice(doc: any, order: any, left: number, width: number) {
        this.sectionTitle(doc, '2. Цена и условия оплаты:', left, width);

        const half = width / 2;
        const y = doc.y;
        doc.rect(left, y, half, 12).stroke();
        doc.rect(left + half, y, half, 12).stroke();
        doc.font('Roboto-Bold').fontSize(7.5)
            .text('Ставка перевозки', left, y + 3, { width: half, align: 'center' })
            .text('Предоплата', left + half, y + 3, { width: half, align: 'center' });

        const rate = toNum(order.driverCost ?? order.subForwarderPrice ?? 0);
        const terms = [
            `${moneyWithWords(rate)} Тенге.`,
            order.executorHasVat ? 'Безналичный расчет в т.ч. НДС.' : 'Безналичный расчет без НДС.',
            'По копиям накладных (ТН, ТТН, CMR).',
            order.driverPaymentCondition || '15 Календарных дней',
        ].join(' ');

        const boxY = y + 12;
        const boxHeight = Math.max(24, doc.font('Roboto').fontSize(7).heightOfString(terms, { width: half - 8 }) + 8);
        doc.rect(left, boxY, half, boxHeight).stroke();
        doc.rect(left + half, boxY, half, boxHeight).stroke();
        doc.font('Roboto').fontSize(7).text(terms, left + 4, boxY + 4, { width: half - 8 });
        doc.y = boxY + boxHeight + 6;
    }

    private drawVehicle(doc: any, order: any, left: number, width: number) {
        this.sectionTitle(doc, '3. Предоставленный подвижной состав и водитель:', left, width);

        const driverName = order.assignedDriverName
            || [order.driver?.lastName, order.driver?.firstName].filter(Boolean).join(' ')
            || '—';
        const driverPhone = order.assignedDriverPhone || order.driver?.phone || '';
        const rows: [string, string][] = [
            ['Водитель', `${driverName}${driverPhone ? `;  Телефоны: ${driverPhone}` : ''}`],
            ['Тягач', `${order.vehicleModel || ''}    Гос.номер тягача: ${order.assignedDriverPlate || '—'}    Гос.номер прицепа: ${order.assignedDriverTrailer || '—'}`],
            ['Тип кузова', `${order.cargoType || '—'}    Грузоподъемность: ${order.cargoWeight ? `${order.cargoWeight} кг` : '—'}    Объем кузова: ${order.cargoVolume ? `${order.cargoVolume} м3` : '—'}`],
        ];

        const labelWidth = 96;
        for (const [label, value] of rows) {
            const height = Math.max(13, doc.font('Roboto').fontSize(7).heightOfString(value, { width: width - labelWidth - 8 }) + 6);
            const y = doc.y;
            doc.rect(left, y, labelWidth, height).stroke();
            doc.rect(left + labelWidth, y, width - labelWidth, height).stroke();
            doc.font('Roboto-Bold').fontSize(7).text(label, left + 3, y + 3, { width: labelWidth - 6 });
            doc.font('Roboto').fontSize(7).text(value, left + labelWidth + 4, y + 3, { width: width - labelWidth - 8 });
            doc.y = y + height;
        }
        doc.moveDown(0.5);
    }

    private drawTerms(doc: any, left: number, width: number) {
        this.sectionTitle(doc, '4. Права и обязанности сторон:', left, width);
        doc.font('Roboto').fontSize(6.5);
        TERMS.forEach((term, index) => {
            this.ensureSpace(doc, 24);
            doc.text(`4.${index + 1}. ${term}`, left, doc.y, { width, align: 'justify' });
            doc.moveDown(0.15);
        });
        doc.moveDown(0.4);
    }

    private drawParties(
        doc: any,
        customer: ContractParty,
        carrier: ContractParty | null,
        left: number,
        width: number,
        images: { stamp: Buffer | null; signature: Buffer | null },
    ) {
        this.ensureSpace(doc, 170);
        this.sectionTitle(doc, '5. Реквизиты сторон:', left, width);

        const gap = 16;
        const half = (width - gap) / 2;
        const startY = doc.y;

        const column = (party: ContractParty | null, role: string, x: number) => {
            doc.y = startY;
            doc.font('Roboto-Bold').fontSize(7.5).text(`${role}:`, x, doc.y, { continued: true });
            doc.font('Roboto').text(`  ${party?.name || '—'}`, { width: half });
            doc.moveDown(0.2);
            const rows: [string, string][] = [
                ['ИИН/БИН:', party?.bin || '—'],
                ['р/счет', party?.bankAccount || '—'],
                ['в банке', party?.bankName || '—'],
                ['БИК', party?.bankBic || '—'],
                ['Юр. адрес:', party?.address || '—'],
                ['Почт. адрес:', party?.actualAddress || party?.address || '—'],
                ['Контактное лицо:', [party?.directorName, party?.phone].filter(Boolean).join(', ') || '—'],
            ];
            for (const [label, value] of rows) {
                doc.font('Roboto-Bold').fontSize(7).text(label, x, doc.y, { width: 70, continued: true });
                doc.font('Roboto').text(`  ${value}`, { width: half - 70 });
            }
            return doc.y;
        };

        const leftEnd = column(customer, 'Заказчик', left);
        const rightEnd = column(carrier, 'Перевозчик', left + half + gap);

        // Подписи на одной линии у обеих сторон.
        const signY = Math.max(leftEnd, rightEnd) + 14;
        const signLine = (x: number, name: string) => {
            doc.font('Roboto-Bold').fontSize(7.5).text('Руководитель:', x, signY);
            doc.font('Roboto').fontSize(7)
                .text('________________', x + 74, signY)
                .text(`/ ${name}`, x + 150, signY);
            doc.fontSize(6).text('подпись', x + 84, signY + 10);
            doc.font('Roboto-Bold').fontSize(7).text('М.П.', x, signY + 12);
        };
        signLine(left, customer.directorName || '');
        signLine(left + half + gap, carrier?.directorName || '');

        // Печать и подпись — только своей стороны; у перевозчика место
        // остаётся пустым под его живую печать.
        if (images.signature) {
            try {
                doc.image(images.signature, left + 78, signY - 12, { fit: [70, 22] });
            } catch { /* битая картинка не должна ронять документ */ }
        }
        if (images.stamp) {
            try {
                doc.image(images.stamp, left + 4, signY + 4, { fit: [86, 86] });
            } catch { /* см. выше */ }
        }
        doc.y = signY + 30;
    }

    // ==================== вспомогательное ====================

    private sectionTitle(doc: any, title: string, left: number, width: number) {
        this.ensureSpace(doc, 30);
        doc.font('Roboto-Bold').fontSize(8.5).fillColor(INK)
            .text(title, left, doc.y, { width, underline: true });
        doc.moveDown(0.25);
    }

    private field(doc: any, label: string, value: string, left: number) {
        doc.font('Roboto').fontSize(7.5).text(label, left, doc.y, { width: 110, continued: true });
        doc.text(`     ${value}`);
    }

    private cargo(order: any) {
        return [
            order.cargoDescription,
            order.cargoWeight ? `вес (тонн): ${Math.round(Number(order.cargoWeight) / 1000 * 100) / 100}` : null,
            order.cargoVolume ? `Объем (м3): ${order.cargoVolume}` : null,
        ].filter(Boolean).join(' / ') || '—';
    }

    private place(point: any) {
        return point?.location?.city || point?.location?.address || '—';
    }

    private longDate(date: Date) {
        const months = [
            'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
        ];
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} г.`;
    }

    private ensureSpace(doc: any, needed: number) {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + needed > bottom) doc.addPage();
    }
}
