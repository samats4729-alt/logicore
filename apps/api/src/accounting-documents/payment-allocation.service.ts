import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
    AccountingDocumentDirection,
    AccountingDocumentStatus,
    AccountingDocumentType,
    PaymentDirection,
    Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import {
    MissingRateError,
    Settlement,
    settleAllocation,
} from '../accounting/services/exchange-difference';
import { D, ZERO, roundMoney } from '../common/utils/money';

/**
 * Состояние оплаты документа. Выводится из сумм, а не хранится отдельным
 * полем: иначе статус и суммы рано или поздно разойдутся, и бухгалтер
 * получит два разных ответа на один вопрос.
 */
export type DocumentPaymentState = 'UNPAID' | 'PARTIAL' | 'PAID';

/**
 * Возврат в валюте платежа → сколько это в валюте счёта.
 *
 * Курс берётся из самого разнесения: в нём записано, сколько тенге ушло на
 * сколько валюты счёта. Это единственный курс, по которому долг закрывали, —
 * по нему же его и открываем обратно. Сегодняшний курс тут не годится: он
 * изменил бы уже посчитанную курсовую разницу задним числом.
 */
function convertByAllocationRate(
    refund: Prisma.Decimal,
    paymentRate: Prisma.Decimal | null,
    allocation: { amount: Prisma.Decimal; amountBase: Prisma.Decimal | null },
): Prisma.Decimal {
    const base = allocation.amountBase;
    if (!paymentRate || base === null || D(allocation.amount).lte(ZERO)) return refund;
    const perUnit = D(base).div(D(allocation.amount));
    if (perUnit.lte(ZERO)) return refund;
    return roundMoney(refund.times(D(paymentRate)).div(perUnit));
}

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
    constructor(
        private readonly prisma: PrismaService,
        private readonly currency: CurrencyService,
    ) {}

    /**
     * Предложение разнесения по FIFO: сначала гасятся счета с самым ранним
     * сроком оплаты — так же поступает бухгалтер вручную.
     *
     * Направление платежа определяет, какие счета гасить: поступление
     * закрывает наши исходящие счета, списание — входящие от поставщика.
     */
    async suggest(
        companyId: string,
        params: { counterpartyId: string; direction: PaymentDirection; amount: string; currency?: string },
    ) {
        const currency = (params.currency || 'KZT').toUpperCase();
        const documents = await this.openDocuments(companyId, params.counterpartyId, params.direction, currency);

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
                // Валюта счёта: долг по нему остаётся в своей валюте, и в
                // подсказке нельзя показывать долларовый остаток под знаком ₸.
                currency: document.currency,
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
            select: {
                id: true, amount: true, direction: true, counterpartyId: true,
                currency: true, exchangeRate: true, date: true,
            },
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
                select: {
                    id: true, total: true, amountPaid: true, counterpartyId: true, direction: true,
                    currency: true, exchangeRate: true,
                },
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

        // Курс валюты счёта на дату платежа нужен только когда платёж пришёл
        // в другой валюте: тенге, которыми гасят долларовый счёт, становятся
        // долларами по курсу дня оплаты, а не по курсу самого счёта.
        const byId = new Map(documents.map((document) => [document.id, document]));
        const settlements = new Map<string, Settlement>();
        for (const item of positive) {
            const document = byId.get(item.documentId)!;
            const onPaymentDate = document.currency === payment.currency
                ? null
                : await this.currency.rateOn(document.currency, payment.date, { companyId });
            try {
                settlements.set(item.documentId, settleAllocation({
                    part: item.amount,
                    paymentCurrency: payment.currency,
                    paymentRate: payment.exchangeRate,
                    documentCurrency: document.currency,
                    documentRate: document.exchangeRate,
                    documentCurrencyRateOnPaymentDate: onPaymentDate?.rate ?? null,
                }));
            } catch (error) {
                if (error instanceof MissingRateError) {
                    throw new BadRequestException(
                        `${error.message}. Загрузите курс в разделе «Финансы → Курсы валют»`,
                    );
                }
                throw error;
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
                const settlement = settlements.get(item.documentId)!;
                await tx.accountingPaymentAllocation.create({
                    data: {
                        documentId: item.documentId,
                        paymentId,
                        // В счёте гасится долг в его валюте, а не сумма
                        // платежа: 480 000 ₸ закрывают 1 000 USD долга.
                        amount: settlement.closed,
                        amountBase: settlement.amountBase,
                        exchangeDiff: settlement.exchangeDiff,
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

        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            select: { currency: true, exchangeRate: true },
        });
        const paymentCurrency = payment?.currency ?? 'KZT';

        return this.prisma.$transaction(async (tx) => {
            const allocations = await tx.accountingPaymentAllocation.findMany({
                where: { paymentId },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, documentId: true, amount: true,
                    amountBase: true, exchangeDiff: true,
                    document: { select: { currency: true } },
                },
            });

            const touched = new Set<string>();
            for (const allocation of allocations) {
                if (rest.lte(ZERO)) break;
                const current = roundMoney(D(allocation.amount));
                // Возврат приходит в валюте платежа, а разнесение записано в
                // валюте счёта. Когда они разные, переводим возврат курсом
                // самого разнесения: другого честного курса для этой пары нет,
                // а брать сегодняшний значило бы менять прошлое.
                const inDocumentCurrency = allocation.document.currency === paymentCurrency
                    ? rest
                    : convertByAllocationRate(rest, payment?.exchangeRate ?? null, allocation);
                const cut = Prisma.Decimal.min(current, inDocumentCurrency);
                const left = roundMoney(current.minus(cut));

                if (left.lte(ZERO)) {
                    await tx.accountingPaymentAllocation.delete({ where: { id: allocation.id } });
                } else {
                    // Пересчёт и курсовая разница уменьшаются в той же доле:
                    // вернули половину — половина разницы тоже отменяется.
                    const share = left.div(current);
                    await tx.accountingPaymentAllocation.update({
                        where: { id: allocation.id },
                        data: {
                            amount: left,
                            amountBase: allocation.amountBase === null
                                ? null
                                : roundMoney(D(allocation.amountBase).times(share)),
                            exchangeDiff: allocation.exchangeDiff === null
                                ? null
                                : roundMoney(D(allocation.exchangeDiff).times(share)),
                        },
                    });
                }
                touched.add(allocation.documentId);
                // Списываем ровно ту часть возврата, которая ушла на это
                // разнесение, — в валюте платежа.
                rest = roundMoney(rest.minus(
                    cut.equals(inDocumentCurrency) ? rest : rest.times(cut.div(inDocumentCurrency)),
                ));
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

    /**
     * Проведённые неоплаченные счета контрагента, FIFO по сроку оплаты.
     *
     * Только счета в валюте платежа: подсказка распределяет сумму платежа
     * по остаткам долга напрямую, а вычесть доллары из тенге нельзя.
     * Погасить счёт в другой валюте по-прежнему можно — вручную, там курс
     * дня оплаты учитывается явно.
     */
    private async openDocuments(
        companyId: string,
        counterpartyId: string,
        direction: PaymentDirection,
        currency: string,
    ) {
        return this.prisma.accountingDocument.findMany({
            where: {
                companyId,
                counterpartyId,
                currency,
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
                currency: true,
                total: true,
                amountPaid: true,
            },
            // Раньше срок — раньше гасим; без срока идём по дате документа.
            orderBy: [{ dueDate: 'asc' }, { documentDate: 'asc' }],
            take: 100,
        });
    }
}
