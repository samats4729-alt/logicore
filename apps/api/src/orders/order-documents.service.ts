import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderDocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderContractService } from './order-contract.service';
import { PowerOfAttorneyService, PowerOfAttorneySnapshot } from './power-of-attorney.service';

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
    ) {}

    /** Сформировать очередную версию: снять данные заявки и сохранить. */
    async form(kind: OrderDocumentKind, orderId: string, companyId: string, userId: string) {
        const snapshot = kind === 'CONTRACT'
            ? await this.contracts.snapshotFor(orderId, companyId)
            : await this.poa.snapshotFor(orderId, companyId);

        return this.prisma.$transaction(async (tx) => {
            const last = await tx.orderDocument.findFirst({
                where: { orderId, kind },
                orderBy: { version: 'desc' },
                select: { version: true },
            });
            return tx.orderDocument.create({
                data: {
                    companyId,
                    orderId,
                    kind,
                    version: (last?.version ?? 0) + 1,
                    snapshot: snapshot as unknown as Prisma.InputJsonValue,
                    createdById: userId,
                },
                select: { id: true, kind: true, version: true, createdAt: true },
            });
        });
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
                createdBy: { select: { firstName: true, lastName: true } },
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
            select: { kind: true, snapshot: true },
        });
        if (!document) throw new NotFoundException('Документ не найден');

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
