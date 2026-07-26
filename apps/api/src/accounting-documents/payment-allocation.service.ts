import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
    AccountingDocumentDirection,
    AccountingDocumentStatus,
    AccountingDocumentType,
    PaymentDirection,
    Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { D, ZERO, roundMoney } from '../common/utils/money';

/**
 * Состояние оплаты документа. Выводится из сумм, а не хранится отдельным
 * полем: иначе статус и суммы рано или поздно разойдутся, и бухгалтер
 * получит два разных ответа на один вопрос.
 */
export type DocumentPaymentState = 'UNPAID' | 'PARTIAL' | 'PAID';

export function paymentStateOf(total: Prisma.Decimal, amountPaid: Prisma.Decimal): DocumentPaymentState {
    if (D(amountPaid).lte(0)) return 'UNPAID';
    if (D(amountPaid).gte(D(total))) return 'PAID';
    return 'PARTIAL';
}

export interface AllocationInput {
    documentId: string;
    amount: string;
}

/**
 * Разнесение платежей по счетам.
 *
 * До этого платёж и счёт были связаны только косвенно — через заявку и флаг
 * «оплачено». Частичная оплата нигде не была видна, а «оплачен ли счёт»
 * в журнале, карточке и взаиморасчётах считалось разными путями.
 */
@Injectable()
export class PaymentAllocationService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Предложение разнесения по FIFO: сначала гасятся счета с самым ранним
     * сроком оплаты — так же поступает бухгалтер вручную.
     *
     * Направление платежа определяет, какие счета гасить: поступление
     * закрывает наши исходящие счета, списание — входящие от поставщика.
     */
    async suggest(
        companyId: string,
        params: { counterpartyId: string; direction: PaymentDirection; amount: string },
    ) {
        const documents = await this.openDocuments(companyId, params.counterpartyId, params.direction);

        let rest = roundMoney(D(params.amount));
        if (rest.lte(0)) throw new BadRequestException('Сумма платежа должна быть больше нуля');

        const suggestions = documents.map((document) => {
            const due = roundMoney(D(document.total).minus(D(document.amountPaid)));
            const take = rest.gt(0) ? Prisma.Decimal.min(due, rest) : ZERO;
            rest = roundMoney(rest.minus(take));
            return {
                documentId: document.id,
                number: document.number,
                documentDate: document.documentDate,
                dueDate: document.dueDate,
                total: document.total,
                amountPaid: document.amountPaid,
                balanceDue: due,
                suggestedAmount: roundMoney(take),
            };
        });

        return {
            documents: suggestions,
            // Остаток, который не лёг ни на один счёт: аванс или переплата.
            unallocated: rest,
        };
    }

    /**
     * Разнести платёж по счетам.
     *
     * Заменяет прежнее разнесение этого платежа целиком: править по одной
     * строке значило бы держать в голове, что уже разнесено.
     */
    async apply(companyId: string, userId: string, paymentId: string, allocations: AllocationInput[]) {
        const payment = await this.prisma.payment.findFirst({
            where: { id: paymentId, companyId, isDeleted: false },
            select: { id: true, amount: true, direction: true, counterpartyId: true },
        });
        if (!payment) throw new NotFoundException('Платёж не найден');

        const positive = allocations.filter((item) => D(item.amount).gt(0));
        const uniqueIds = new Set(positive.map((item) => item.documentId));
        if (uniqueIds.size !== positive.length) {
            throw new BadRequestException('Один и тот же счёт указан дважды');
        }

        const total = positive.reduce((sum, item) => sum.plus(D(item.amount)), ZERO);
        if (roundMoney(total).gt(roundMoney(D(payment.amount)))) {
            throw new BadRequestException('Разнесено больше, чем сумма платежа');
        }

        const documents = positive.length
            ? await this.prisma.accountingDocument.findMany({
                where: {
                    id: { in: [...uniqueIds] },
                    companyId,
                    status: AccountingDocumentStatus.POSTED,
                },
                select: { id: true, total: true, amountPaid: true, counterpartyId: true, direction: true },
            })
            : [];
        if (documents.length !== uniqueIds.size) {
            throw new BadRequestException('Разносить можно только на проведённые счета своей организации');
        }

        const expectedDirection = payment.direction === PaymentDirection.IN
            ? AccountingDocumentDirection.OUTGOING
            : AccountingDocumentDirection.INCOMING;
        for (const document of documents) {
            if (document.direction !== expectedDirection) {
                throw new BadRequestException(
                    payment.direction === PaymentDirection.IN
                        ? 'Поступление закрывает только исходящие счета'
                        : 'Списание закрывает только входящие счета',
                );
            }
            if (payment.counterpartyId && document.counterpartyId !== payment.counterpartyId) {
                throw new BadRequestException('Счёт относится к другому контрагенту');
            }
        }

        return this.prisma.$transaction(async (tx) => {
            // Прежнее разнесение снимаем и пересчитываем затронутые счета,
            // иначе повторный вызов удвоил бы оплату.
            const previous = await tx.accountingPaymentAllocation.findMany({
                where: { paymentId },
                select: { documentId: true },
            });
            await tx.accountingPaymentAllocation.deleteMany({ where: { paymentId } });

            for (const item of positive) {
                await tx.accountingPaymentAllocation.create({
                    data: {
                        documentId: item.documentId,
                        paymentId,
                        amount: roundMoney(D(item.amount)),
                        createdById: userId,
                    },
                });
            }

            const touched = new Set([
                ...previous.map((row) => row.documentId),
                ...positive.map((item) => item.documentId),
            ]);
            for (const documentId of touched) {
                await this.recalculate(tx, documentId);
            }

            return { allocated: roundMoney(total), documents: touched.size };
        });
    }

    /** Снять разнесение платежа — при его удалении или сторнировании. */
    async release(paymentId: string) {
        return this.prisma.$transaction(async (tx) => {
            const previous = await tx.accountingPaymentAllocation.findMany({
                where: { paymentId },
                select: { documentId: true },
            });
            if (!previous.length) return { documents: 0 };

            await tx.accountingPaymentAllocation.deleteMany({ where: { paymentId } });
            for (const row of previous) {
                await this.recalculate(tx, row.documentId);
            }
            return { documents: previous.length };
        });
    }

    /**
     * Уменьшить разнесения платежа на сумму возврата (T-20).
     *
     * Гасим с самых поздних разнесений: возврат откатывает последнее, что
     * этим платежом закрыли, — так же, как бухгалтер отменяет проводку с
     * конца. Возврат больше разнесённого просто обнуляет разнесения:
     * лишняя часть возврата к счетам не относится, она уменьшает общую
     * оплату контрагента.
     */
    async reduce(paymentId: string, amount: Prisma.Decimal) {
        let rest = roundMoney(D(amount));
        if (rest.lte(ZERO)) return { documents: 0 };

        return this.prisma.$transaction(async (tx) => {
            const allocations = await tx.accountingPaymentAllocation.findMany({
                where: { paymentId },
                orderBy: { createdAt: 'desc' },
                select: { id: true, documentId: true, amount: true },
            });

            const touched = new Set<string>();
            for (const allocation of allocations) {
                if (rest.lte(ZERO)) break;
                const current = roundMoney(D(allocation.amount));
                const cut = Prisma.Decimal.min(current, rest);
                const left = roundMoney(current.minus(cut));

                if (left.lte(ZERO)) {
                    await tx.accountingPaymentAllocation.delete({ where: { id: allocation.id } });
                } else {
                    await tx.accountingPaymentAllocation.update({
                        where: { id: allocation.id },
                        data: { amount: left },
                    });
                }
                touched.add(allocation.documentId);
                rest = roundMoney(rest.minus(cut));
            }

            for (const documentId of touched) {
                await this.recalculate(tx, documentId);
            }
            return { documents: touched.size };
        });
    }

    /**
     * Пересчитать оплату документа по его разнесениям.
     *
     * Единственное место, где меняются amountPaid и balanceDue, — поэтому
     * суммы не могут разойтись с разнесениями.
     */
    private async recalculate(tx: Prisma.TransactionClient, documentId: string) {
        const document = await tx.accountingDocument.findUnique({
            where: { id: documentId },
            select: { total: true },
        });
        if (!document) return;

        const sum = await tx.accountingPaymentAllocation.aggregate({
            where: { documentId },
            _sum: { amount: true },
        });
        const paid = roundMoney(D(sum._sum.amount ?? 0));
        await tx.accountingDocument.update({
            where: { id: documentId },
            data: {
                amountPaid: paid,
                // Переплата не уводит остаток в минус: «долг» не бывает
                // отрицательным, излишек виден как оплачено > суммы.
                balanceDue: Prisma.Decimal.max(ZERO, roundMoney(D(document.total).minus(paid))),
            },
        });
    }

    /** Проведённые неоплаченные счета контрагента, FIFO по сроку оплаты. */
    private async openDocuments(
        companyId: string,
        counterpartyId: string,
        direction: PaymentDirection,
    ) {
        return this.prisma.accountingDocument.findMany({
            where: {
                companyId,
                counterpartyId,
                type: AccountingDocumentType.PAYMENT_INVOICE,
                status: AccountingDocumentStatus.POSTED,
                direction: direction === PaymentDirection.IN
                    ? AccountingDocumentDirection.OUTGOING
                    : AccountingDocumentDirection.INCOMING,
                balanceDue: { gt: 0 },
            },
            select: {
                id: true,
                number: true,
                documentDate: true,
                dueDate: true,
                total: true,
                amountPaid: true,
            },
            // Раньше срок — раньше гасим; без срока идём по дате документа.
            orderBy: [{ dueDate: 'asc' }, { documentDate: 'asc' }],
            take: 100,
        });
    }
}
