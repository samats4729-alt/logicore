import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinancialReportsService } from './financial-reports.service';
import { FinanceCalculatorService } from './finance-calculator.service';
import { ВИД_ССЫЛКИ } from './shared-report-link.service';

/**
 * Постоянная ссылка заказчику: что он по ней видит.
 *
 * Заказчик приходит платить, а не сверяться: ему нужны наши счета — какой
 * оплачен, какой ждёт, какой просрочен, — и что в каждом из них. Отдельно
 * от ссылки перевозчика, потому что вопрос другой и данные другие.
 *
 * Два правила здесь важнее прочего. Первое: наша себестоимость и наша
 * продажа наружу не уезжают — между ними заработок экспедитора. Второе:
 * ссылка перевозчика по этому адресу не открывается, иначе заказчику
 * досталась бы чужая сверка.
 */

const КОМПАНИЯ = 'company-1';
const КЛИЕНТ = 'company-2';
const D = (v: string | number) => new Prisma.Decimal(v);

const счёт = (overrides: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    number: 'СЧ-2026-000001',
    documentDate: new Date('2026-09-01'),
    dueDate: new Date('2026-09-20'),
    currency: 'KZT',
    total: D(500000),
    amountPaid: D(0),
    balanceDue: D(500000),
    shareToken: 'doc-token',
    shareRevokedAt: null,
    lines: [{
        id: 'line-1',
        name: 'Перевозка груза Алматы — Астана',
        description: null,
        unit: 'усл',
        quantity: D(1),
        unitPrice: D(500000),
        total: D(500000),
        serviceDate: new Date('2026-09-01'),
        order: { id: 'o-1', orderNumber: 'ЗК-2601' },
    }],
    orders: [{ order: { id: 'o-1', orderNumber: 'ЗК-2601' } }],
    ...overrides,
});

function makeService(options: {
    kind?: string;
    счета?: any[];
    сделки?: any[];
} = {}) {
    const prisma: any = {
        accountingDocument: { findMany: jest.fn(async () => options.счета ?? [счёт()]) },
        orderPaymentProof: { findMany: jest.fn(async () => []) },
        order: { findMany: jest.fn(async () => []) },
        payment: { findMany: jest.fn(async () => []) },
        income: { findMany: jest.fn(async () => []) },
        expense: { findMany: jest.fn(async () => []) },
        counterpartyOpeningBalance: { findMany: jest.fn(async () => []) },
    };

    const shareLinks: any = {
        resolve: jest.fn(async () => ({
            id: 'link-1',
            companyId: КОМПАНИЯ,
            companyName: 'ТОО «ЛогиКор»',
            counterpartyId: КЛИЕНТ,
            counterpartyName: 'ТОО «Магнум»',
            ourRole: 'EXECUTOR',
            kind: options.kind ?? ВИД_ССЫЛКИ.ЗАКАЗЧИКУ,
            expiresAt: null,
            createdById: 'user-1',
        })),
        trackView: jest.fn(async () => undefined),
    };

    const service = new FinancialReportsService(
        prisma, {} as any, {} as any,
        new FinanceCalculatorService() as any,
        {} as any, {} as any, {} as any, shareLinks,
        { differencesForPeriod: async () => ({ gain: 0, loss: 0, net: 0, rows: [] }) } as any,
    );

    // Сделки собирает общий отчёт по контрагентам; здесь важно не как он
    // считается, а что уезжает наружу.
    jest.spyOn(service, 'getCounterpartyReport').mockResolvedValue({
        counterparties: [{
            counterparty: { id: КЛИЕНТ, name: 'ТОО «Магнум»' },
            ourRole: 'EXECUTOR',
            orders: options.сделки ?? [{
                id: 'o-1',
                orderNumber: 'ЗК-2601',
                amount: 500000,
                paymentState: 'UNPAID',
                customerPrice: 500000,
                driverCost: 380000,
                subForwarderPrice: 380000,
                subForwarderId: 'carrier-1',
                isCustomerPaid: false,
                customerPaidAt: null,
            }],
        }],
    } as any);

    return { service, prisma, shareLinks };
}

describe('Ссылка заказчику на его счета', () => {
    it('ссылка перевозчика по этому адресу не открывается', async () => {
        // Иначе заказчик увидел бы сверку, собранную для другой стороны.
        const { service } = makeService({ kind: ВИД_ССЫЛКИ.ПЕРЕВОЗЧИКУ });

        await expect(service.getClientPortal('t')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('показывает счета со строками продукции', async () => {
        const { service } = makeService();

        const итог = await service.getClientPortal('t');

        expect(итог.invoices).toHaveLength(1);
        expect(итог.invoices[0].number).toBe('СЧ-2026-000001');
        expect(итог.invoices[0].lines[0].name).toContain('Перевозка груза');
        expect(итог.invoices[0].lines[0].orderNumber).toBe('ЗК-2601');
    });

    describe('состояние счёта одним словом', () => {
        it('долга нет — оплачен', async () => {
            const { service } = makeService({
                счета: [счёт({ amountPaid: D(500000), balanceDue: D(0) })],
            });
            const итог = await service.getClientPortal('t');
            expect(итог.invoices[0].paymentState).toBe('PAID');
        });

        it('часть денег пришла — оплачен частично', async () => {
            const { service } = makeService({
                счета: [счёт({ amountPaid: D(200000), balanceDue: D(300000), dueDate: new Date('2030-01-01') })],
            });
            const итог = await service.getClientPortal('t');
            expect(итог.invoices[0].paymentState).toBe('PARTIAL');
        });

        it('срок прошёл, долг остался — просрочен', async () => {
            const { service } = makeService({
                счета: [счёт({ dueDate: new Date('2020-01-01') })],
            });
            const итог = await service.getClientPortal('t');
            expect(итог.invoices[0].paymentState).toBe('OVERDUE');
        });

        it('срок не наступил — ждёт оплаты', async () => {
            const { service } = makeService({
                счета: [счёт({ dueDate: new Date('2030-01-01') })],
            });
            const итог = await service.getClientPortal('t');
            expect(итог.invoices[0].paymentState).toBe('AWAITING');
        });
    });

    it('итоги считаются по тем же счетам, что в списке', async () => {
        const { service } = makeService({
            счета: [
                счёт({ id: 'a', amountPaid: D(500000), balanceDue: D(0) }),
                счёт({ id: 'b', dueDate: new Date('2020-01-01') }),
            ],
        });

        const итог = await service.getClientPortal('t');

        expect(итог.totals.invoiced).toBe(1000000);
        expect(итог.totals.paid).toBe(500000);
        expect(итог.totals.awaiting).toBe(500000);
        expect(итог.totals.overdue).toBe(500000);
    });

    it('наша закупка и наша продажа наружу не уезжают', async () => {
        // Между ними лежит заработок экспедитора. На экране их не рисуют, но
        // в данных страницы они видны любому, кто в них заглянет.
        const { service } = makeService();

        const итог = await service.getClientPortal('t');

        for (const поле of ['driverCost', 'subForwarderPrice', 'subForwarderId', 'customerPrice']) {
            expect((итог.orders[0] as any)[поле]).toBeNull();
        }
    });

    it('черновики заказчику не показываются', async () => {
        // Черновик — ещё не выставленный счёт: он может и не дойти до
        // отправки, а заказчик уже увидел бы сумму.
        const { service, prisma } = makeService();

        await service.getClientPortal('t');

        expect(prisma.accountingDocument.findMany.mock.calls[0][0].where.status).toBe('POSTED');
    });

    it('просмотр засчитывается — видно, открывали ли ссылку', async () => {
        const { service, shareLinks } = makeService();

        await service.getClientPortal('t');

        expect(shareLinks.trackView).toHaveBeenCalledWith('link-1');
    });
});
