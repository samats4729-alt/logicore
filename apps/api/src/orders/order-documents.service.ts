import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyVerificationStatus, OrderDocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderContractService } from './order-contract.service';
import { OrderSettlementsService } from './order-settlements.service';
import { PowerOfAttorneyService, PowerOfAttorneySnapshot } from './power-of-attorney.service';
import { EmailService } from '../email/email.service';

const TITLE: Record<string, string> = {
    CONTRACT: 'Договор-заявка',
    POWER_OF_ATTORNEY: 'Доверенность',
};

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
                id: true, kind: true, version: true, status: true,
                recipientCounterpartyId: true, recipientCompanyId: true,
                sentAt: true, sentToEmail: true, receiptStatus: true, receiptReason: true,
                receiptAt: true,
            },
        });
        if (!document) throw new NotFoundException('Документ не найден');

        const { counterparty, onPlatform } = await this.resolveRecipient(
            document.recipientCounterpartyId, companyId,
        );

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
    async send(documentId: string, companyId: string, userId: string, email?: string) {
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
        const address = (email || recipient?.email || '').trim();

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
            const company = await this.prisma.company.findUnique({
                where: { id: companyId },
                select: { name: true },
            });
            const pdf = await this.printSaved(documentId, companyId, { withStamp: true });
            await this.email.sendOrderDocumentEmail(address, {
                title: TITLE[document.kind],
                orderNumber: document.order?.orderNumber || '',
                senderCompanyName: company?.name || 'LogiCore',
                pdfBuffer: pdf,
                fileName: `${document.kind === 'CONTRACT' ? 'dogovor' : 'doverennost'}`
                    + `_${document.order?.orderNumber || document.orderId}_v${document.version}.pdf`,
            });
            sentToEmail = address;
            deliveredTo = address;
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
