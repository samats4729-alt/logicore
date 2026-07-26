import { BadRequestException } from '@nestjs/common';
import { PaymentDirection, Prisma } from '@prisma/client';
import { PaymentAllocationService, paymentStateOf } from './payment-allocation.service';

const COMPANY = 'company-1';
const COUNTERPARTY = 'company-2';
const USER = 'accountant-1';

const invoice = (id: string, total: string, paid = '0', overrides: Record<string, unknown> = {}) => ({
    id,
    number: `СЧ-2026-${id}`,
    documentDate: new Date('2026-07-01'),
    dueDate: new Date('2026-07-10'),
    total: new Prisma.Decimal(total),
    amountPaid: new Prisma.Decimal(paid),
    counterpartyId: COUNTERPARTY,
    direction: 'OUTGOING',
    ...overrides,
});

function makeService(documents: any[] = [], paymentOverrides: Record<string, unknown> = {}) {
    // Разнесения храним в памяти, чтобы пересчёт документов работал как в базе.
    const allocations: { documentId: string; paymentId: string; amount: Prisma.Decimal }[] = [];
    const updates: Record<string, { amountPaid: Prisma.Decimal; balanceDue: Prisma.Decimal }> = {};

    const tx: any = {
        accountingPaymentAllocation: {
            findMany: jest.fn(async ({ where }: any) =>
                allocations.filter((a) => a.paymentId === where.paymentId).map((a) => ({ documentId: a.documentId }))),
            deleteMany: jest.fn(async ({ where }: any) => {
                for (let i = allocations.length - 1; i >= 0; i--) {
                    if (allocations[i].paymentId === where.paymentId) allocations.splice(i, 1);
                }
                return { count: 0 };
            }),
            create: jest.fn(async ({ data }: any) => {
                allocations.push({ documentId: data.documentId, paymentId: data.paymentId, amount: data.amount });
                return data;
            }),
            aggregate: jest.fn(async ({ where }: any) => ({
                _sum: {
                    amount: allocations
                        .filter((a) => a.documentId === where.documentId)
                        .reduce((s, a) => s.plus(a.amount), new Prisma.Decimal(0)),
                },
            })),
        },
        accountingDocument: {
            findUnique: jest.fn(async ({ where }: any) => documents.find((d) => d.id === where.id) ?? null),
            update: jest.fn(async ({ where, data }: any) => {
                updates[where.id] = { amountPaid: data.amountPaid, balanceDue: data.balanceDue };
                return data;
            }),
        },
    };

    const prisma: any = {
        payment: {
            findFirst: jest.fn().mockResolvedValue({
                id: 'payment-1',
                amount: new Prisma.Decimal('100000'),
                direction: PaymentDirection.IN,
                counterpartyId: COUNTERPARTY,
                ...paymentOverrides,
            }),
        },
        accountingDocument: {
            findMany: jest.fn().mockResolvedValue(documents),
        },
        $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    return { service: new PaymentAllocationService(prisma), prisma, tx, updates, allocations };
}

describe('PaymentAllocationService', () => {
    describe('состояние оплаты выводится из сумм', () => {
        it.each([
            ['1000', '0', 'UNPAID'],
            ['1000', '400', 'PARTIAL'],
            ['1000', '1000', 'PAID'],
            ['1000', '1200', 'PAID'],
        ])('всего %s, оплачено %s -> %s', (total, paid, expected) => {
            expect(paymentStateOf(new Prisma.Decimal(total), new Prisma.Decimal(paid))).toBe(expected);
        });
    });

    describe('предложение разнесения', () => {
        it('гасит счета по сроку оплаты, начиная с самого раннего', async () => {
            const early = invoice('early', '60000', '0', { dueDate: new Date('2026-07-05') });
            const late = invoice('late', '80000', '0', { dueDate: new Date('2026-07-20') });
            const { service, prisma } = makeService();
            prisma.accountingDocument.findMany.mockResolvedValue([early, late]);

            const result = await service.suggest(COMPANY, {
                counterpartyId: COUNTERPARTY,
                direction: PaymentDirection.IN,
                amount: '100000',
            });

            // 100 000 закрывают ранний счёт целиком, на поздний ложится остаток.
            expect(result.documents[0].suggestedAmount.toFixed(2)).toBe('60000.00');
            expect(result.documents[1].suggestedAmount.toFixed(2)).toBe('40000.00');
            expect(result.unallocated.toFixed(2)).toBe('0.00');
            expect(prisma.accountingDocument.findMany.mock.calls[0][0].orderBy)
                .toEqual([{ dueDate: 'asc' }, { documentDate: 'asc' }]);
        });

        it('уже частично оплаченный счёт предлагает добить только на остаток', async () => {
            const { service, prisma } = makeService();
            prisma.accountingDocument.findMany.mockResolvedValue([invoice('a', '100000', '70000')]);

            const result = await service.suggest(COMPANY, {
                counterpartyId: COUNTERPARTY,
                direction: PaymentDirection.IN,
                amount: '100000',
            });

            expect(result.documents[0].balanceDue.toFixed(2)).toBe('30000.00');
            expect(result.documents[0].suggestedAmount.toFixed(2)).toBe('30000.00');
            // Излишек остаётся нераспределённым — это аванс, а не переплата счёта.
            expect(result.unallocated.toFixed(2)).toBe('70000.00');
        });
    });

    // Главный критерий задачи: один платёж закрывает два счёта частично,
    // и в обоих виден корректный остаток.
    describe('разнесение платежа', () => {
        it('один платёж закрывает два счёта частично — остатки видны в обоих', async () => {
            const first = invoice('a', '60000');
            const second = invoice('b', '80000');
            const { service, updates } = makeService([first, second]);

            await service.apply(COMPANY, USER, 'payment-1', [
                { documentId: 'a', amount: '60000' },
                { documentId: 'b', amount: '40000' },
            ]);

            expect(updates['a'].amountPaid.toFixed(2)).toBe('60000.00');
            expect(updates['a'].balanceDue.toFixed(2)).toBe('0.00');
            expect(updates['b'].amountPaid.toFixed(2)).toBe('40000.00');
            expect(updates['b'].balanceDue.toFixed(2)).toBe('40000.00');
            expect(paymentStateOf(second.total, updates['b'].amountPaid)).toBe('PARTIAL');
            expect(paymentStateOf(first.total, updates['a'].amountPaid)).toBe('PAID');
        });

        it('повторное разнесение заменяет прежнее, а не удваивает оплату', async () => {
            const document = invoice('a', '100000');
            const { service, updates } = makeService([document]);

            await service.apply(COMPANY, USER, 'payment-1', [{ documentId: 'a', amount: '40000' }]);
            await service.apply(COMPANY, USER, 'payment-1', [{ documentId: 'a', amount: '30000' }]);

            expect(updates['a'].amountPaid.toFixed(2)).toBe('30000.00');
            expect(updates['a'].balanceDue.toFixed(2)).toBe('70000.00');
        });

        it('не даёт разнести больше суммы платежа', async () => {
            const { service } = makeService([invoice('a', '200000')]);

            await expect(service.apply(COMPANY, USER, 'payment-1', [
                { documentId: 'a', amount: '150000' },
            ])).rejects.toThrow('больше, чем сумма платежа');
        });

        it('не даёт указать один счёт дважды', async () => {
            const { service } = makeService([invoice('a', '100000')]);

            await expect(service.apply(COMPANY, USER, 'payment-1', [
                { documentId: 'a', amount: '10000' },
                { documentId: 'a', amount: '20000' },
            ])).rejects.toBeInstanceOf(BadRequestException);
        });

        it('поступление не закрывает входящий счёт поставщика', async () => {
            const supplierInvoice = invoice('a', '50000', '0', { direction: 'INCOMING' });
            const { service } = makeService([supplierInvoice]);

            await expect(service.apply(COMPANY, USER, 'payment-1', [
                { documentId: 'a', amount: '50000' },
            ])).rejects.toThrow('только исходящие счета');
        });

        it('не разносит на счёт другого контрагента', async () => {
            const foreign = invoice('a', '50000', '0', { counterpartyId: 'company-3' });
            const { service } = makeService([foreign]);

            await expect(service.apply(COMPANY, USER, 'payment-1', [
                { documentId: 'a', amount: '50000' },
            ])).rejects.toThrow('другому контрагенту');
        });

        it('переплата не уводит остаток в минус', async () => {
            const document = invoice('a', '50000');
            const { service, updates } = makeService([document]);

            await service.apply(COMPANY, USER, 'payment-1', [{ documentId: 'a', amount: '60000' }]);

            expect(updates['a'].amountPaid.toFixed(2)).toBe('60000.00');
            expect(updates['a'].balanceDue.toFixed(2)).toBe('0.00');
        });
    });

    it('снятие разнесения возвращает счёт в неоплаченные', async () => {
        const document = invoice('a', '50000');
        const { service, updates } = makeService([document]);

        await service.apply(COMPANY, USER, 'payment-1', [{ documentId: 'a', amount: '50000' }]);
        expect(updates['a'].balanceDue.toFixed(2)).toBe('0.00');

        await service.release('payment-1');

        expect(updates['a'].amountPaid.toFixed(2)).toBe('0.00');
        expect(updates['a'].balanceDue.toFixed(2)).toBe('50000.00');
    });
});
