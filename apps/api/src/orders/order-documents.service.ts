import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyVerificationStatus, OrderDocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderContractService } from './order-contract.service';
import { OrderSettlementsService } from './order-settlements.service';
import { PowerOfAttorneyService, PowerOfAttorneySnapshot } from './power-of-attorney.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';

const TITLE: Record<string, string> = {
    CONTRACT: 'Договор-заявка',
    POWER_OF_ATTORNEY: 'Доверенность',
};

const ПОХОЖЕ_НА_ПОЧТУ = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Строка «a@b.kz, c@d.kz» или список — в чистый список без повторов.
 *
 * Принимаем и то и другое: в базе почты лежат строкой через запятую, а из
 * браузера приходит список. Регистр при сравнении не считаем: «Sklad@» и
 * «sklad@» — один и тот же ящик, и дважды письмо туда не нужно.
 */
export function разобратьПочты(raw?: string | string[] | null): string[] {
    const куски = Array.isArray(raw) ? raw : (raw ?? '').split(/[,;]/);
    const итог: string[] = [];
    for (const кусок of куски) {
        const адрес = String(кусок).trim();
        if (!адрес) continue;
        if (!итог.some((е) => е.toLowerCase() === адрес.toLowerCase())) итог.push(адрес);
    }
    return итог;
}

/**
 * Метка записи журнала: доверенность ушла письмом из карточки рейса
 * (кнопка «На почту»). В записи — адреса, куда она ушла.
 */
export const POA_SHARE_KIND = 'POWER_OF_ATTORNEY_SHARE';

/**
 * Что в документе относится к машине и водителю.
 *
 * Ровно эти поля меняются, когда машина сломалась и вышла другая. Всё
 * остальное — деньги, стороны, маршрут, груз, налоги — при такой замене
 * обязано совпасть, иначе это не замена машины, а новый договор.
 */
const VEHICLE_FIELDS = [
    'vehicleModel',
    'assignedDriverName', 'assignedDriverPhone', 'assignedDriverPlate', 'assignedDriverTrailer',
    'driver',
];

function withoutVehicle(snapshot: any) {
    const order = { ...(snapshot?.order ?? {}) };
    for (const field of VEHICLE_FIELDS) delete order[field];
    return JSON.stringify({ ...snapshot, order });
}

/** Между версиями поменялись только машина и водитель. */
export function onlyVehicleChanged(previous: any, next: any): boolean {
    if (!previous || !next) return false;
    return withoutVehicle(previous) === withoutVehicle(next);
}

/**
 * Версии документов по рейсу: договор-заявка и доверенность.
 *
 * Обе печатные формы собираются из заявки, а заявку правят и после того,
 * как документ подписали или отдали водителю. Поэтому формирование —
 * отдельное действие: оно снимает данные и сохраняет их навсегда.
 *
 * Исправление не переписывает документ, а добавляет следующую версию.
 * Номера версии в бланке нет: официальная форма должна выглядеть как
 * официальная форма, а «версия 2, прежняя от 14:30» — служебная пометка
 * платформы. Так у бухгалтера видно, что и когда исправляли, а у
 * контрагента на руках обычный документ.
 */
@Injectable()
export class OrderDocumentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly contracts: OrderContractService,
        private readonly poa: PowerOfAttorneyService,
        private readonly settlements: OrderSettlementsService,
        private readonly email: EmailService,
        private readonly redis: RedisService,
    ) {}

    /** Сформировать очередную версию: снять данные заявки и сохранить. */
    async form(kind: OrderDocumentKind, orderId: string, companyId: string, userId: string) {
        const snapshot: any = kind === 'CONTRACT'
            ? await this.contracts.snapshotFor(orderId, companyId)
            : await this.poa.snapshotFor(orderId, companyId);

        // Кому выписан документ — запоминаем здесь, а не выводим из заявки при
        // отправке. Перевозчика в рейсе меняют, а бумага выписана прежнему:
        // «отправить перевозчику» обязано означать того, кто стоит в бумаге.
        const recipientCounterpartyId: string | null = snapshot?.carrier?.id ?? null;

        return this.prisma.$transaction(async (tx) => {
            const last = await tx.orderDocument.findFirst({
                where: { orderId, kind },
                orderBy: { version: 'desc' },
                select: { version: true, status: true, snapshot: true, sentAt: true, id: true },
            });

            const status = await this.statusForNewVersion(tx, kind, orderId, last, snapshot);

            return tx.orderDocument.create({
                data: {
                    companyId,
                    orderId,
                    kind,
                    version: (last?.version ?? 0) + 1,
                    snapshot: snapshot as unknown as Prisma.InputJsonValue,
                    createdById: userId,
                    recipientCounterpartyId,
                    status,
                    postedAt: status === 'POSTED' ? new Date() : null,
                    postedById: status === 'POSTED' && kind === 'CONTRACT' ? userId : null,
                    // Исправление не отменяет уже отправленное, но и не
                    // притворяется отдельным документом: у контрагента прежняя
                    // версия помечается заменённой.
                    replacesId: last?.sentAt ? last.id : null,
                },
                select: { id: true, kind: true, version: true, createdAt: true, status: true },
            });
        });
    }

    /**
     * Черновик или сразу проведённый.
     *
     * Доверенность проводить не нужно: в ней нет ни сумм, ни налогов — только
     * водитель и машина, и выписывает её тот же человек, который назначает
     * водителя. Заставлять его ждать бухгалтера означало бы остановить
     * погрузку ради формальности.
     *
     * Договор-заявка — черновик: в нём ставка, НДС и срок оплаты. Но если
     * прежняя версия была проведена, а поменялись только водитель, машина или
     * прицеп, новая версия проводится сама. Это самый частый случай правки:
     * машина сломалась, вышла другая, рейс идёт — будить бухгалтера ночью
     * ради тех же денег и тех же сторон незачем.
     */
    private async statusForNewVersion(
        tx: Prisma.TransactionClient,
        kind: OrderDocumentKind,
        orderId: string,
        last: { status?: string; snapshot?: any } | null,
        snapshot: any,
    ): Promise<string> {
        if (kind !== 'CONTRACT') return 'POSTED';
        if (last?.status === 'POSTED' && onlyVehicleChanged(last.snapshot, snapshot)) {
            return 'POSTED';
        }
        return 'DRAFT';
    }

    /**
     * Провести документ: содержимое замирает, печать разрешена.
     *
     * Пока расчёты по рейсу не проверены, проводить нечего: именно налоговая
     * часть и срок оплаты в договоре и бывают неверными, а печать на документе
     * означает, что компания за них отвечает.
     */
    async post(documentId: string, companyId: string, userId: string) {
        const document = await this.prisma.orderDocument.findFirst({
            where: { id: documentId, companyId },
            select: { id: true, kind: true, version: true, status: true, orderId: true },
        });
        if (!document) throw new NotFoundException('Документ не найден');
        if (document.status === 'POSTED' || document.status === 'SENT') {
            throw new BadRequestException('Документ уже проведён');
        }

        const settlements = await this.settlements.stateOf(document.orderId, companyId);
        if (!settlements.confirmed) {
            throw new BadRequestException(
                settlements.missing.length
                    ? `Сначала разберитесь с расчётами. ${settlements.missing.join('. ')}`
                    : 'Расчёты по рейсу не подтверждены — проверьте их во вкладке «Финансы»',
            );
        }

        const updated = await this.prisma.orderDocument.update({
            where: { id: documentId },
            data: { status: 'POSTED', postedAt: new Date(), postedById: userId },
            select: { id: true, kind: true, version: true, status: true, orderId: true, postedAt: true },
        });
        return { ...updated, title: `${TITLE[document.kind]}, версия ${document.version}` };
    }

    /**
     * Кому уйдёт документ и можно ли отправить прямо сейчас.
     *
     * Получателя человек не выбирает: документ выписан на конкретного
     * контрагента, ему и уходит. Если у контрагента есть кабинет на платформе,
     * оригинал ложится туда — копий не появляется, спорить о том, чей вариант
     * правильный, не приходится. Нет кабинета — уходит почтой вложением.
     */
    async deliveryTarget(documentId: string, companyId: string) {
        const document = await this.prisma.orderDocument.findFirst({
            where: { id: documentId, companyId },
            select: {
                id: true, kind: true, version: true, status: true, orderId: true,
                recipientCounterpartyId: true, recipientCompanyId: true,
                sentAt: true, sentToEmail: true, receiptStatus: true, receiptReason: true,
                receiptAt: true,
            },
        });
        if (!document) throw new NotFoundException('Документ не найден');

        const { counterparty, onPlatform } = await this.resolveRecipient(
            document.recipientCounterpartyId, companyId,
        );

        // Почты складов погрузки. Доверенность предъявляют там, и уходит она
        // из раза в раз одним и тем же людям — а поле в окне отправки было
        // пустым всегда, потому что постоянного получателя у неё нет.
        // Менеджер набирал адреса заново каждый рейс.
        const склады = counterparty
            ? []
            : await this.почтыПогрузки(document.orderId, companyId);

        // Получателя может и не быть: доверенность выписывается на водителя, а
        // предъявляют её на погрузке — постоянного адресата у неё нет.
        // Отправку это не запрещает, просто адрес спрашиваем при отправке.
        const reason = document.status === 'DRAFT'
            ? 'Черновик не отправляется: сначала документ проводят'
            : document.sentAt
                ? 'Документ уже отправлен. Исправление уходит новой версией'
                : null;

        return {
            available: !reason,
            reason,
            recipient: counterparty && {
                id: counterparty.id,
                name: counterparty.name,
                email: counterparty.email,
                onPlatform: !!onPlatform,
                platformCompanyId: onPlatform?.id ?? null,
            },
            /** Кому отправляли доверенность по этим складам в прошлый раз. */
            suggestedEmails: склады,
            sent: document.sentAt
                ? {
                    at: document.sentAt,
                    toEmail: document.sentToEmail,
                    inCabinet: !!document.recipientCompanyId,
                    status: document.receiptStatus,
                    reason: document.receiptReason,
                    reviewedAt: document.receiptAt,
                }
                : null,
        };
    }

    /**
     * Отправить документ получателю.
     *
     * Отправляет и менеджер, и бухгалтер: к этому моменту документ проведён,
     * то есть проверен и заверен, а дальше это обычная работа с контрагентом.
     * Черновик не уходит никуда — иначе у контрагента окажется бумага, за
     * которую компания ещё не отвечает.
     */
    async send(
        documentId: string,
        companyId: string,
        userId: string,
        email?: string | string[],
    ) {
        const delivery = await this.deliveryTarget(documentId, companyId);
        if (!delivery.available) {
            throw new BadRequestException(delivery.reason || 'Документ отправить нельзя');
        }

        const document = await this.prisma.orderDocument.findFirst({
            where: { id: documentId, companyId },
            select: {
                id: true, kind: true, version: true, orderId: true, snapshot: true,
                recipientCounterpartyId: true, replacesId: true,
                order: { select: { orderNumber: true } },
            },
        });
        if (!document) throw new NotFoundException('Документ не найден');

        const recipient = delivery.recipient;
        // Адресов может быть много: у склада их бывает и пятнадцать, и
        // пятьдесят. Раньше поле было одно, и всех, кроме первого, вписывали
        // «через запятую» наугад — уйдёт письмо или нет, никто не проверял.
        const адреса = разобратьПочты(email).length
            ? разобратьПочты(email)
            : разобратьПочты(recipient?.email);
        const address = адреса.join(', ');

        // Кабинет получателя — главный путь: документ остаётся один, у
        // контрагента появляется он же, а не набранная на слух копия.
        let deliveredTo: string;
        let recipientCompanyId: string | null = null;
        let sentToEmail: string | null = null;

        if (recipient?.onPlatform && recipient.platformCompanyId) {
            recipientCompanyId = recipient.platformCompanyId;
            deliveredTo = `${recipient.name} (кабинет на платформе)`;
        } else {
            if (!address) {
                throw new BadRequestException(
                    recipient
                        ? `У «${recipient.name}» нет кабинета на платформе и не указана почта. `
                            + 'Впишите адрес — документ уйдёт письмом.'
                        : 'Укажите почту получателя — документ уйдёт письмом с вложением.',
                );
            }
            // Опечатку ловим до отправки: письмо на «sklad@company» просто
            // не уйдёт, а человек будет считать, что доверенность на складе.
            const кривой = адреса.find((а) => !ПОХОЖЕ_НА_ПОЧТУ.test(а));
            if (кривой) {
                throw new BadRequestException(`«${кривой}» не похоже на адрес почты`);
            }
            const company = await this.prisma.company.findUnique({
                where: { id: companyId },
                select: { name: true },
            });
            const pdf = await this.printSaved(documentId, companyId, { withStamp: true });
            const письмо = {
                title: TITLE[document.kind],
                orderNumber: document.order?.orderNumber || '',
                senderCompanyName: company?.name || 'LogiCore',
                pdfBuffer: pdf,
                fileName: `${document.kind === 'CONTRACT' ? 'dogovor' : 'doverennost'}`
                    + `_${document.order?.orderNumber || document.orderId}_v${document.version}.pdf`,
            };
            // Каждому своё письмо, а не одно на всех: получатели с разных
            // складов не должны видеть почты друг друга, а упавший адрес не
            // должен уносить с собой остальные.
            for (const адрес of адреса) {
                await this.email.sendOrderDocumentEmail(адрес, письмо);
            }
            sentToEmail = address;
            deliveredTo = address;

            // Запоминаем только там, где адрес спрашивают у человека. У
            // договора-заявки получатель постоянный — его почта живёт в
            // карточке контрагента, и складу она никакого отношения не имеет.
            if (!recipient) {
                await this.запомнитьПочтыСкладов(document.orderId, companyId, адреса);
            }
        }

        await this.prisma.orderDocument.update({
            where: { id: documentId },
            data: {
                status: 'SENT',
                sentAt: new Date(),
                sentById: userId,
                recipientCompanyId,
                sentToEmail,
            },
        });

        return {
            id: documentId,
            orderId: document.orderId,
            title: `${TITLE[document.kind]}, версия ${document.version}`,
            sentTo: deliveredTo,
            inCabinet: !!recipientCompanyId,
            replacedVersion: document.replacesId ? document.version - 1 : null,
        };
    }

    /**
     * Кому ушла последняя доверенность по рейсу.
     *
     * Сменили водителя — новую доверенность отправляют туда же, куда ушла
     * прежняя: там на руках бумага с другим водителем. Отправляют её двумя
     * путями — письмом из карточки рейса и сохранённой версией из «Документов
     * рейса», — поэтому смотрим оба и берём свежее. Только свою компанию: у
     * второй стороны рейса свои получатели.
     */
    async lastPowerOfAttorneyRecipients(orderId: string, companyId: string | null) {
        const [письма, версия] = await Promise.all([
            this.prisma.auditLog.findMany({
                where: { orderId, companyId, entity: 'order_document' },
                orderBy: { createdAt: 'desc' },
                take: 20,
                select: { createdAt: true, details: true },
            }),
            companyId
                ? this.prisma.orderDocument.findFirst({
                    where: { orderId, companyId, kind: 'POWER_OF_ATTORNEY', sentAt: { not: null }, sentToEmail: { not: null } },
                    orderBy: { sentAt: 'desc' },
                    select: { sentAt: true, sentToEmail: true },
                })
                : null,
        ]);

        const письмо = письма.find((з) => (з.details as any)?.kind === POA_SHARE_KIND);
        const варианты = [
            письмо && { at: письмо.createdAt, emails: разобратьПочты((письмо.details as any)?.emails) },
            версия?.sentAt && { at: версия.sentAt, emails: разобратьПочты(версия.sentToEmail) },
        ].filter((в): в is { at: Date; emails: string[] } => !!в && в.emails.length > 0);

        варианты.sort((а, б) => б.at.getTime() - а.at.getTime());
        return варианты[0] ?? { at: null, emails: [] as string[] };
    }

    /**
     * Точки погрузки рейса — те, за которыми и держатся почты.
     *
     * Догруз считается погрузкой: там тоже предъявляют доверенность.
     */
    private async точкиПогрузки(orderId: string) {
        return this.prisma.orderRoutePoint.findMany({
            where: { orderId, pointType: { in: ['PICKUP', 'ADDITIONAL_PICKUP'] } },
            orderBy: { sequence: 'asc' },
            select: { locationId: true },
        });
    }

    /**
     * Почты, заведённые компанией за складами погрузки этого рейса.
     *
     * Список компании (`LocationEmailList`) сильнее общего поля в карточке
     * адреса: справочник адресов общий, и контакты у каждой компании свои.
     * Порядок сохраняем — первым идёт первый склад маршрута.
     */
    private async почтыПогрузки(orderId: string, companyId: string): Promise<string[]> {
        const точки = await this.точкиПогрузки(orderId);
        if (!точки.length) return [];

        const ids = точки.map((т) => т.locationId);
        const [свои, общие] = await Promise.all([
            this.prisma.locationEmailList.findMany({
                where: { companyId, locationId: { in: ids } },
                select: { locationId: true, emails: true },
            }),
            this.prisma.location.findMany({
                where: { id: { in: ids } },
                select: { id: true, emails: true },
            }),
        ]);
        const свойСписок = new Map(свои.map((с) => [с.locationId, с.emails]));
        const общийСписок = new Map(общие.map((о) => [о.id, о.emails]));

        const собрано: string[] = [];
        for (const id of ids) {
            const строка = свойСписок.has(id) ? свойСписок.get(id) : общийСписок.get(id);
            for (const адрес of разобратьПочты(строка)) {
                if (!собрано.some((е) => е.toLowerCase() === адрес.toLowerCase())) {
                    собрано.push(адрес);
                }
            }
        }
        return собрано;
    }

    /**
     * Запомнить, кому ушла доверенность, — за складами погрузки.
     *
     * Ровно то, что отправили, и становится списком склада: в следующий раз
     * подставится оно же. Список из окна отправки и список в карточке точки —
     * одно и то же место, а не два расходящихся.
     *
     * Когда складов в маршруте несколько, пишем всем одинаково. Разложить
     * «этот адрес относится ко второй погрузке» неоткуда: человек отправлял
     * одним списком, и делить его за него — гадание.
     */
    private async запомнитьПочтыСкладов(orderId: string, companyId: string, адреса: string[]) {
        const точки = await this.точкиПогрузки(orderId);
        if (!точки.length) return;

        const value = адреса.join(',');
        for (const точка of точки) {
            await this.prisma.locationEmailList.upsert({
                where: { locationId_companyId: { locationId: точка.locationId, companyId } },
                create: { locationId: точка.locationId, companyId, emails: value },
                update: { emails: value },
            });
        }
        // Списки адресов лежат в кэше — иначе подстановка вернёт прежнее.
        await this.redis.delByPattern('locations:*');
    }

    /**
     * Получатель документа: карточка контрагента и его кабинет, если он есть.
     *
     * Кабинет ищется по БИН и только среди подтверждённых компаний: справочная
     * копия контрагента, заведённая нами, — не кабинет, доставлять туда некуда.
     */
    private async resolveRecipient(counterpartyId: string | null, companyId: string) {
        const counterparty = counterpartyId
            ? await this.prisma.company.findUnique({
                where: { id: counterpartyId },
                select: { id: true, name: true, bin: true, email: true },
            })
            : null;

        const onPlatform = counterparty?.bin
            ? await this.prisma.company.findFirst({
                where: {
                    bin: counterparty.bin,
                    isExternal: false,
                    id: { not: companyId },
                    verificationStatus: CompanyVerificationStatus.VERIFIED,
                },
                select: { id: true, name: true },
            })
            : null;

        return { counterparty, onPlatform };
    }

    /** Версии документа по рейсу — история для карточки рейса. */
    async listForOrder(kind: OrderDocumentKind, orderId: string, companyId: string) {
        const documents = await this.prisma.orderDocument.findMany({
            where: { orderId, companyId, kind },
            orderBy: { version: 'desc' },
            select: {
                id: true,
                kind: true,
                version: true,
                createdAt: true,
                snapshot: true,
                status: true,
                postedAt: true,
                sentAt: true,
                sentToEmail: true,
                recipientCompanyId: true,
                receiptStatus: true,
                receiptReason: true,
                createdBy: { select: { firstName: true, lastName: true } },
                postedBy: { select: { firstName: true, lastName: true } },
                sentBy: { select: { firstName: true, lastName: true } },
            },
        });
        return documents.map((document, index) => ({
            id: document.id,
            kind: document.kind,
            version: document.version,
            createdAt: document.createdAt,
            createdBy: document.createdBy,
            // Действующей считается последняя сформированная версия.
            isCurrent: index === 0,
            status: document.status,
            postedAt: document.postedAt,
            postedBy: document.postedBy,
            sentAt: document.sentAt,
            sentBy: document.sentBy,
            sentToEmail: document.sentToEmail,
            sentToCabinet: !!document.recipientCompanyId,
            receiptStatus: document.receiptStatus,
            receiptReason: document.receiptReason,
            ...this.summary(document.kind, document.snapshot),
        }));
    }

    /**
     * Журнал выданных документов за период.
     *
     * Здесь именно сформированные документы, а не рейсы: доверенность в РК
     * положено регистрировать в журнале учёта выданных доверенностей, и
     * попадать в него должно то, что действительно выдали.
     */
    async listJournal(
        companyId: string,
        query: { kind: OrderDocumentKind; from?: string; to?: string },
    ) {
        const documents = await this.prisma.orderDocument.findMany({
            where: {
                companyId,
                kind: query.kind,
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
                kind: true,
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
            const summary = this.summary(document.kind, document.snapshot);
            return {
                id: document.id,
                orderId: document.orderId,
                kind: document.kind,
                version: document.version,
                isCurrent: latest.get(document.orderId) === document.version,
                createdAt: document.createdAt,
                createdBy: document.createdBy,
                status: document.order?.status ?? null,
                ...summary,
                orderNumber: summary.orderNumber ?? document.order?.orderNumber ?? null,
            };
        });
    }

    /** Печать сохранённой версии — строго из её снимка. */
    async printSaved(documentId: string, companyId: string, options?: { withStamp?: boolean }) {
        const document = await this.prisma.orderDocument.findFirst({
            where: { id: documentId, companyId },
            select: { kind: true, snapshot: true, status: true },
        });
        if (!document) throw new NotFoundException('Документ не найден');

        // Печать и подпись — только на проведённом.
        //
        // Раньше заверить можно было что угодно и в один клик: черновик с
        // чужой ошибкой уходил контрагенту уже с печатью, и отозвать его было
        // нельзя. Скачать черновик по-прежнему можно — это проект договора,
        // его и положено сперва согласовать.
        if (options?.withStamp && document.status === 'DRAFT') {
            throw new BadRequestException(
                'Печать ставится только на проведённый документ. Сейчас это черновик — '
                + 'его можно скачать для согласования или провести.',
            );
        }

        return document.kind === 'CONTRACT'
            ? this.contracts.renderFromSnapshot(document.snapshot, companyId, options)
            : this.poa.renderFromSnapshot(
                document.snapshot as unknown as PowerOfAttorneySnapshot,
                companyId,
                options,
            );
    }

    private summary(kind: OrderDocumentKind, snapshot: Prisma.JsonValue) {
        return kind === 'CONTRACT'
            ? this.contracts.summaryOf(snapshot)
            : this.poa.summaryOf(snapshot as unknown as PowerOfAttorneySnapshot);
    }
}
