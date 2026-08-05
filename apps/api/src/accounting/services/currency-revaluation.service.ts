import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
    AccountingDocumentDirection,
    AccountingDocumentStatus,
    AccountingDocumentType,
    PaymentDirection,
    Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PeriodClosingService } from './period-closing.service';
import { CurrencyService } from '../../currency/currency.service';
import {
    RevaluationKind,
    accountBaseBefore,
    debtBaseBefore,
    revalue,
} from '../../currency/currency-revaluation';
import { D, ZERO, roundMoney, toNum } from '../../common/utils/money';

const BASE_CURRENCY = 'KZT';

/** Строка предпросмотра: что и на сколько переоценится. */
export interface RevaluationPreviewLine {
    kind: RevaluationKind;
    accountId: string | null;
    documentId: string | null;
    /** Как строка называется на экране: «Валютный счёт в Halyk», «СЧ-2026-000002». */
    label: string;
    counterpartyName: string | null;
    currency: string;
    amount: number;
    rate: number;
    baseBefore: number;
    baseAfter: number;
    diff: number;
    outcome: 'GAIN' | 'LOSS' | 'NONE';
}

/**
 * Переоценка валютных остатков на конец месяца.
 *
 * Курсовая разница при оплате счёта считается в момент, когда пришли деньги.
 * Но пока счёт не оплачен, а доллары просто лежат на счёте, курс всё равно
 * движется. На отчётную дату остаток стоит уже других тенге, и эта разница
 * должна попасть в отчёт того месяца — иначе баланс на 31 число показывает
 * вчерашние тенге за сегодняшние доллары.
 *
 * Переоценка сохраняется снимком и больше не меняется. Считать её заново при
 * каждом показе нельзя: прошлый месяц менялся бы сам по себе при каждом
 * движении курса, и доверять отчёту стало бы нельзя.
 */
@Injectable()
export class CurrencyRevaluationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly currency: CurrencyService,
        private readonly periodClosing: PeriodClosingService,
    ) {}

    /** Что переоценится на эту дату, если нажать «Провести». Ничего не пишет. */
    async preview(companyId: string, date: Date) {
        const day = atMidnight(date);

        const [accounts, documents] = await Promise.all([
            this.accountLines(companyId, day),
            this.documentLines(companyId, day),
        ]);

        const lines = [...accounts.lines, ...documents.lines];
        const missingRates = [...new Set([...accounts.missing, ...documents.missing])].sort();

        let gain = ZERO;
        let loss = ZERO;
        for (const line of lines) {
            if (line.outcome === 'GAIN') gain = gain.plus(D(Math.abs(line.diff)));
            if (line.outcome === 'LOSS') loss = loss.plus(D(Math.abs(line.diff)));
        }

        const existing = await this.prisma.currencyRevaluation.findUnique({
            where: { companyId_date: { companyId, date: day } },
            select: { id: true, createdAt: true },
        });

        return {
            date: day,
            lines,
            gain: toNum(roundMoney(gain)),
            loss: toNum(roundMoney(loss)),
            net: toNum(roundMoney(gain.minus(loss))),
            // Валюты, для которых курса на эту дату нет. Их остатки не
            // переоцениваются вовсе: подставить вчерашний курс — значит
            // выдать чужую цифру за сегодняшнюю.
            missingRates,
            /** Переоценка на эту дату уже проведена — повторная задвоила бы разницу. */
            alreadyPosted: existing,
        };
    }

    /** Провести переоценку: посчитать и сохранить снимок. */
    async post(companyId: string, userId: string, date: Date, note?: string) {
        const day = atMidnight(date);
        await this.periodClosing.checkPeriodNotClosed(companyId, day);

        const existing = await this.prisma.currencyRevaluation.findUnique({
            where: { companyId_date: { companyId, date: day } },
            select: { id: true },
        });
        if (existing) {
            throw new BadRequestException(
                'Переоценка на эту дату уже проведена. Повторная посчитала бы ту же разницу второй раз — удалите прежнюю, если нужно пересчитать',
            );
        }

        const preview = await this.preview(companyId, day);
        if (!preview.lines.length) {
            throw new BadRequestException(
                'Переоценивать нечего: валютных остатков и валютных долгов на эту дату нет',
            );
        }

        return this.prisma.currencyRevaluation.create({
            data: {
                companyId,
                date: day,
                createdById: userId,
                note: note?.trim() || null,
                gain: D(preview.gain),
                loss: D(preview.loss),
                lines: {
                    create: preview.lines.map((line) => ({
                        kind: line.kind,
                        accountId: line.accountId,
                        documentId: line.documentId,
                        currency: line.currency,
                        amount: D(line.amount),
                        rate: D(line.rate),
                        baseBefore: D(line.baseBefore),
                        baseAfter: D(line.baseAfter),
                        diff: D(line.diff),
                    })),
                },
            },
            include: { lines: true },
        });
    }

    /** Проведённые переоценки компании, свежие сверху. */
    async list(companyId: string) {
        return this.prisma.currencyRevaluation.findMany({
            where: { companyId },
            orderBy: { date: 'desc' },
            take: 60,
            include: {
                createdBy: { select: { firstName: true, lastName: true } },
                _count: { select: { lines: true } },
            },
        });
    }

    async getById(companyId: string, id: string) {
        const revaluation = await this.prisma.currencyRevaluation.findFirst({
            where: { id, companyId },
            include: {
                createdBy: { select: { firstName: true, lastName: true } },
                lines: {
                    include: {
                        account: { select: { name: true } },
                        document: {
                            select: { number: true, counterparty: { select: { name: true } } },
                        },
                    },
                },
            },
        });
        if (!revaluation) throw new NotFoundException('Переоценка не найдена');
        return revaluation;
    }

    /**
     * Отменить переоценку.
     *
     * Удаление, а не сторно: переоценка — это расчёт, а не хозяйственная
     * операция с деньгами. Отменять её приходится, когда после проведения
     * поправили курс или задним числом добавили платёж. Закрытый период
     * защищает от правки задним числом того, что уже сдано.
     */
    async remove(companyId: string, id: string) {
        const revaluation = await this.prisma.currencyRevaluation.findFirst({
            where: { id, companyId },
            select: { id: true, date: true },
        });
        if (!revaluation) throw new NotFoundException('Переоценка не найдена');
        await this.periodClosing.checkPeriodNotClosed(companyId, revaluation.date);

        await this.prisma.currencyRevaluation.delete({ where: { id } });
        return { removed: true };
    }

    /**
     * Курсовые разницы от переоценок за период — для отчёта о прибылях.
     * Считаются по дате переоценки: разница относится к тому месяцу, на конец
     * которого её посчитали.
     */
    async differencesForPeriod(companyId: string, period: { start: Date | null; end: Date | null }) {
        const revaluations = await this.prisma.currencyRevaluation.findMany({
            where: {
                companyId,
                ...(period.start && period.end
                    ? { date: { gte: atMidnight(period.start), lte: atMidnight(period.end) } }
                    : {}),
            },
            select: { id: true, date: true, gain: true, loss: true },
            orderBy: { date: 'desc' },
        });

        const gain = revaluations.reduce((sum, r) => sum.plus(D(r.gain)), ZERO);
        const loss = revaluations.reduce((sum, r) => sum.plus(D(r.loss)), ZERO);

        return {
            gain: toNum(roundMoney(gain)),
            loss: toNum(roundMoney(loss)),
            net: toNum(roundMoney(gain.minus(loss))),
            rows: revaluations.map((r) => ({
                id: r.id,
                date: r.date,
                gain: toNum(r.gain),
                loss: toNum(r.loss),
            })),
        };
    }

    // ==================== сборка строк ====================

    /**
     * Остатки на валютных счетах и в валютных кассах.
     *
     * Остаток в валюте — начальный плюс движения до даты. Его учётная
     * стоимость — от последней переоценки плюс движения после неё, каждое по
     * своему курсу дня платежа.
     */
    private async accountLines(companyId: string, day: Date) {
        const accounts = await this.prisma.financeAccount.findMany({
            where: { companyId, isActive: true, currency: { not: BASE_CURRENCY } },
            select: {
                id: true, name: true, currency: true,
                openingBalance: true, openingDate: true,
            },
        });
        if (!accounts.length) return { lines: [], missing: [] as string[] };

        const lines: RevaluationPreviewLine[] = [];
        const missing: string[] = [];

        for (const account of accounts) {
            const rate = await this.currency.rateOn(account.currency, day, { companyId });
            if (!rate) {
                missing.push(account.currency);
                continue;
            }

            const previous = await this.prisma.currencyRevaluationLine.findFirst({
                where: { accountId: account.id, revaluation: { date: { lt: day } } },
                orderBy: { revaluation: { date: 'desc' } },
                select: { baseAfter: true, revaluation: { select: { date: true } } },
            });

            // Движения считаются с точки отсчёта: с прошлой переоценки, а
            // если её не было — с самого начала.
            const since = previous?.revaluation.date ?? null;
            const payments = await this.prisma.payment.findMany({
                where: {
                    companyId, accountId: account.id, isDeleted: false,
                    date: { ...(since ? { gt: since } : {}), lte: endOfDay(day) },
                },
                select: { direction: true, amount: true, amountBase: true },
            });

            const signed = (value: Prisma.Decimal, direction: PaymentDirection) =>
                direction === PaymentDirection.IN ? D(value) : D(value).negated();

            const movementsCurrency = payments.reduce(
                (sum, p) => sum.plus(signed(p.amount, p.direction)), ZERO,
            );
            const movementsBase = payments.reduce(
                (sum, p) => sum.plus(signed(D(p.amountBase ?? 0), p.direction)), ZERO,
            );

            // Остаток в валюте на дату: до первой переоценки — от начального
            // остатка, после — от остатка на её дату.
            const balanceBefore = previous
                ? await this.balanceAt(companyId, account.id, previous.revaluation.date)
                : D(account.openingBalance);
            const amount = roundMoney(balanceBefore.plus(movementsCurrency));

            const openingBase = previous
                ? null
                : await this.openingInBase(companyId, account.currency, account.openingBalance, account.openingDate);
            const baseBefore = accountBaseBefore({
                previousBase: previous ? D(previous.baseAfter) : null,
                openingBase,
                movementsBase,
            });
            if (baseBefore === null) {
                // Начальный остаток в валюте есть, а курса на дату его ввода
                // нет — стартовую тенговую стоимость взять неоткуда.
                missing.push(account.currency);
                continue;
            }

            const result = revalue({
                kind: 'ACCOUNT', currency: account.currency,
                amount, baseBefore, rate: rate.rate,
            });
            if (result.outcome === 'NONE') continue;

            lines.push({
                kind: 'ACCOUNT',
                accountId: account.id,
                documentId: null,
                label: account.name,
                counterpartyName: null,
                currency: account.currency,
                amount: toNum(amount),
                rate: toNum(rate.rate),
                baseBefore: toNum(baseBefore),
                baseAfter: toNum(result.baseAfter),
                diff: toNum(result.diff),
                outcome: result.outcome,
            });
        }

        return { lines, missing };
    }

    /**
     * Непогашенные валютные счета: долги клиентов и наши долги перевозчикам.
     *
     * Берутся только проведённые счета с остатком долга. Черновик долгом не
     * является, а оплаченный счёт переоценивать не в чем.
     */
    private async documentLines(companyId: string, day: Date) {
        const documents = await this.prisma.accountingDocument.findMany({
            where: {
                companyId,
                type: AccountingDocumentType.PAYMENT_INVOICE,
                status: AccountingDocumentStatus.POSTED,
                currency: { not: BASE_CURRENCY },
                balanceDue: { gt: 0 },
                documentDate: { lte: endOfDay(day) },
            },
            select: {
                id: true, number: true, currency: true, direction: true,
                balanceDue: true, exchangeRate: true,
                counterparty: { select: { name: true } },
            },
            take: 1000,
        });
        if (!documents.length) return { lines: [], missing: [] as string[] };

        const lines: RevaluationPreviewLine[] = [];
        const missing: string[] = [];
        const rates = new Map<string, Prisma.Decimal | null>();

        for (const document of documents) {
            if (!rates.has(document.currency)) {
                const found = await this.currency.rateOn(document.currency, day, { companyId });
                rates.set(document.currency, found ? found.rate : null);
            }
            const rate = rates.get(document.currency)!;
            if (!rate) {
                if (!missing.includes(document.currency)) missing.push(document.currency);
                continue;
            }

            const previous = await this.prisma.currencyRevaluationLine.findFirst({
                where: { documentId: document.id, revaluation: { date: { lt: day } } },
                orderBy: { revaluation: { date: 'desc' } },
                select: { rate: true },
            });

            const baseBefore = debtBaseBefore(
                document.balanceDue, document.exchangeRate, previous?.rate ?? null,
            );
            if (baseBefore === null) {
                if (!missing.includes(document.currency)) missing.push(document.currency);
                continue;
            }

            const kind: RevaluationKind =
                document.direction === AccountingDocumentDirection.OUTGOING ? 'RECEIVABLE' : 'PAYABLE';
            const result = revalue({
                kind, currency: document.currency,
                amount: document.balanceDue, baseBefore, rate,
            });
            if (result.outcome === 'NONE') continue;

            lines.push({
                kind,
                accountId: null,
                documentId: document.id,
                label: document.number,
                counterpartyName: document.counterparty?.name ?? null,
                currency: document.currency,
                amount: toNum(document.balanceDue),
                rate: toNum(rate),
                baseBefore: toNum(baseBefore),
                baseAfter: toNum(result.baseAfter),
                diff: toNum(result.diff),
                outcome: result.outcome,
            });
        }

        return { lines, missing };
    }

    /** Остаток счёта в валюте на дату: начальный плюс движения по этот день. */
    private async balanceAt(companyId: string, accountId: string, day: Date) {
        const account = await this.prisma.financeAccount.findUnique({
            where: { id: accountId },
            select: { openingBalance: true },
        });
        const payments = await this.prisma.payment.findMany({
            where: { companyId, accountId, isDeleted: false, date: { lte: endOfDay(day) } },
            select: { direction: true, amount: true },
        });
        return payments.reduce(
            (sum, p) => (p.direction === PaymentDirection.IN ? sum.plus(D(p.amount)) : sum.minus(D(p.amount))),
            D(account?.openingBalance ?? 0),
        );
    }

    /**
     * Начальный остаток валютного счёта в тенге — по курсу на дату его ввода.
     *
     * Это единственная сумма, у которой нет своего пересчёта: её вводят одним
     * числом при начале учёта. Курс берётся на ту же дату, что и сам остаток,
     * и потому не меняется со временем.
     */
    private async openingInBase(
        companyId: string,
        currency: string,
        openingBalance: Prisma.Decimal,
        openingDate: Date | null,
    ): Promise<Prisma.Decimal | null> {
        if (D(openingBalance).isZero()) return ZERO;
        const rate = await this.currency.rateOn(currency, openingDate ?? new Date(), { companyId });
        if (!rate) return null;
        return roundMoney(D(openingBalance).times(rate.rate));
    }
}

/** Дата без времени: курс объявляется на день. */
function atMidnight(date: Date | string) {
    const value = new Date(date);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Конец дня: движения последнего дня месяца входят в переоценку. */
function endOfDay(day: Date) {
    return new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);
}
