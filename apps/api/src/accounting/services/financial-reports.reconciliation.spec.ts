import { PaymentDirection, Prisma } from '@prisma/client';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { FinancialReportsService } from './financial-reports.service';
import { FinanceCalculatorService } from './finance-calculator.service';

const COMPANY = 'company-1';
const COUNTERPARTY = 'company-2';

const makeService = (prisma: any) => new FinancialReportsService(
    prisma,
    {} as any, // redis
    {} as any, // config
    new FinanceCalculatorService() as any,
    {} as any, // periodClosing
    {} as any, // payments
    {} as any, // settings

        {} as any, // shareLinks
        { differencesForPeriod: async () => ({ gain: 0, loss: 0, net: 0, rows: [] }) } as any,
    );

describe('FinancialReportsService — акт сверки', () => {
    it('включает операцию, выполненную вечером последнего дня периода', async () => {
        const prisma: any = {
            company: {
                findUnique: jest.fn(({ where }: any) => Promise.resolve({
                    id: where.id,
                    name: where.id === COMPANY ? 'Наша компания' : 'Контрагент',
                    bin: where.id === COMPANY ? '123456789012' : '987654321098',
                })),
            },
            order: { findMany: jest.fn().mockResolvedValue([]) },
            payment: {
                findMany: jest.fn().mockResolvedValue([{
                    id: 'payment-1',
                    counterpartyId: COUNTERPARTY,
                    orderId: null,
                    direction: PaymentDirection.IN,
                    amount: 100,
                    date: new Date('2026-07-31T18:00:00.000Z'),
                    order: null,
                }]),
            },
            counterpartyOpeningBalance: { findUnique: jest.fn().mockResolvedValue(null) },
            accountingDocument: { findMany: jest.fn().mockResolvedValue([]) },
        };
        const service = makeService(prisma);

        const result = await service.getReconciliationAct(
            COMPANY,
            COUNTERPARTY,
            { startDate: '2026-07-01', endDate: '2026-07-31' },
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toMatchObject({ debit: 0, credit: 100, balance: -100 });
        // Наружу период уезжает календарной датой: мгновение браузер
        // напечатал бы в своём поясе и показал соседние сутки.
        expect(result.period.end).toBe('2026-07-31');
    });

    // T-03: акт сверки в 1С показывает рядом с операцией сам рейс — номер
    // заявки, маршрут, водителя — и номера выставленных по нему счёта и акта.
    // Без этого строку не сверить, не открывая заявку.
    describe('колонки как в акте сверки 1С', () => {
        const reconciliationPrisma = () => ({
            company: {
                findUnique: jest.fn(({ where }: any) => Promise.resolve({
                    id: where.id, name: where.id, bin: '000000000000',
                })),
            },
            order: {
                findMany: jest.fn().mockResolvedValue([{
                    id: 'order-1',
                    orderNumber: 'AB00000123',
                    status: 'COMPLETED',
                    createdAt: new Date('2026-07-10'),
                    completedAt: new Date('2026-07-12'),
                    customerCompanyId: COUNTERPARTY,
                    forwarderId: COMPANY,
                    subForwarderId: null,
                    partnerId: null,
                    assignedDriverName: 'Амангельды Е.К.',
                    customerPrice: new Prisma.Decimal('250000'),
                    driverCost: new Prisma.Decimal('180000'),
                    subForwarderPrice: null,
                    vatRate: new Prisma.Decimal('0'),
                    hasVat: false,
                    executorVatRate: new Prisma.Decimal('0'),
                    executorHasVat: false,
                    isCustomerPaid: false,
                    isDriverPaid: false,
                    isSubForwarderPaid: false,
                    payments: [],
                    incomes: [],
                    expenses: [],
                    routePoints: [
                        { location: { city: 'Алматы', address: 'ул. Розыбакиева 1' } },
                        { location: { city: 'Астана', address: 'пр. Кабанбай батыра 5' } },
                    ],
                }]),
            },
            payment: { findMany: jest.fn().mockResolvedValue([]) },
            counterpartyOpeningBalance: { findUnique: jest.fn().mockResolvedValue(null) },
            accountingDocument: {
                findMany: jest.fn().mockResolvedValue([
                    { number: 'СЧ-2026-000001', type: 'PAYMENT_INVOICE', orders: [{ orderId: 'order-1' }] },
                    { number: 'АКТ-2026-000001', type: 'SERVICE_ACT', orders: [{ orderId: 'order-1' }] },
                ]),
            },
        });

        it('к строке начисления добавляет заявку, маршрут, водителя и номера документов', async () => {
            const prisma: any = reconciliationPrisma();
            const service = makeService(prisma);

            const result = await service.getReconciliationAct(COMPANY, COUNTERPARTY, {});

            expect(result.rows).toHaveLength(1);
            expect(result.rows[0]).toMatchObject({
                orderNumber: 'AB00000123',
                route: 'Алматы → Астана',
                driver: 'Амангельды Е.К.',
                invoiceNumber: 'СЧ-2026-000001',
                actNumber: 'АКТ-2026-000001',
                // «Увеличение долга» в терминах 1С.
                debit: 250000,
                credit: 0,
            });
        });

        it('не подтягивает номер отменённого документа', async () => {
            const prisma: any = reconciliationPrisma();
            const service = makeService(prisma);

            await service.getReconciliationAct(COMPANY, COUNTERPARTY, {});

            // Отменённый счёт расчётов не создаёт: сверка не должна ссылаться
            // на документ, которого для расчётов больше нет.
            const { where } = prisma.accountingDocument.findMany.mock.calls[0][0];
            expect(where.status).toEqual({ not: 'CANCELLED' });
        });

        it('добавление колонок не сдвинуло суммы и сальдо', async () => {
            const prisma: any = reconciliationPrisma();
            const service = makeService(prisma);

            const result = await service.getReconciliationAct(COMPANY, COUNTERPARTY, {});

            expect(result.openingBalance).toBe(0);
            expect(result.totals).toEqual({ debit: 250000, credit: 0 });
            expect(result.closingBalance).toBe(250000);
            expect(result.rows[0].balance).toBe(250000);
        });
    });

    /**
     * Требование владельца: «Один и тот же счёт, платёж, долг или статус не
     * должен отображаться по-разному в разных разделах». Долг контрагента
     * считают два независимых куска кода — акт сверки и страница
     * взаиморасчётов. На одних и тех же данных они обязаны сойтись.
     */
    it('итоговое сальдо сходится со страницей взаиморасчётов на тех же данных', async () => {
        const routePoints = [
            { pointType: 'PICKUP', sequence: 1, location: { city: 'Алматы', address: 'ул. Розыбакиева 1' } },
            { pointType: 'DELIVERY', sequence: 2, location: { city: 'Астана', address: 'пр. Кабанбай батыра 5' } },
        ];
        // Контрагенту начислено 250 000, он оплатил 90 000 — долг 160 000.
        const order = {
            id: 'order-1',
            orderNumber: 'AB00000123',
            status: 'COMPLETED',
            createdAt: new Date('2026-07-10'),
            completedAt: new Date('2026-07-12'),
            customerCompanyId: COUNTERPARTY,
            customerCompany: { id: COUNTERPARTY, name: 'Контрагент' },
            forwarderId: COMPANY,
            forwarder: { id: COMPANY, name: 'Наша компания' },
            subForwarderId: null,
            subForwarder: null,
            partnerId: null,
            partner: null,
            driver: null,
            assignedDriverName: 'Амангельды Е.К.',
            assignedDriverPlate: '123 ABC 02',
            cargoDescription: null,
            customerPrice: new Prisma.Decimal('250000'),
            driverCost: new Prisma.Decimal('180000'),
            subForwarderPrice: null,
            vatRate: new Prisma.Decimal('0'),
            hasVat: false,
            executorVatRate: new Prisma.Decimal('0'),
            executorHasVat: false,
            isCustomerPaid: false,
            isDriverPaid: false,
            isSubForwarderPaid: false,
            customerPaidAt: null,
            incomingInvoiceId: null,
            outgoingInvoiceId: null,
            routePoints,
            payments: [{ direction: PaymentDirection.IN, amount: new Prisma.Decimal('90000'), companyId: COMPANY }],
            incomes: [],
            expenses: [],
        };
        const payment = {
            id: 'payment-1',
            counterpartyId: COUNTERPARTY,
            orderId: 'order-1',
            direction: PaymentDirection.IN,
            amount: new Prisma.Decimal('90000'),
            date: new Date('2026-07-20'),
            companyId: COMPANY,
            order: {
                id: 'order-1',
                orderNumber: 'AB00000123',
                assignedDriverName: 'Амангельды Е.К.',
                routePoints,
            },
        };

        const prisma: any = {
            company: {
                findUnique: jest.fn(({ where }: any) => Promise.resolve({
                    id: where.id, name: where.id, bin: '000000000000',
                })),
                findMany: jest.fn().mockResolvedValue([]),
            },
            order: { findMany: jest.fn().mockResolvedValue([order]) },
            payment: { findMany: jest.fn().mockResolvedValue([payment]) },
            counterpartyOpeningBalance: {
                findUnique: jest.fn().mockResolvedValue(null),
                findMany: jest.fn().mockResolvedValue([]),
            },
            accountingDocument: { findMany: jest.fn().mockResolvedValue([]) },
        };
        const service = makeService(prisma);

        const reconciliation = await service.getReconciliationAct(COMPANY, COUNTERPARTY, {});
        const settlements: any = await service.getCounterpartyReport(COMPANY);

        const entry = settlements.counterparties.find(
            (c: any) => c.counterparty.id === COUNTERPARTY,
        );
        expect(entry).toBeDefined();
        expect(reconciliation.closingBalance).toBe(160000);
        expect(entry.balance).toBe(reconciliation.closingBalance);
    });

    /**
     * Период акта — те же сутки, что выбрал бухгалтер.
     *
     * Выбранное «01.07 — 17.08» печаталось как «30.06 — 18.08»: страница
     * отдавала местную полночь по UTC, сервер брал у неё UTC-сутки и уносил
     * начало на день назад, а конец растягивал до 23:59:59 по UTC, который
     * браузер печатал уже следующими сутками. Операции при этом отбирались
     * за тот же сдвинутый период — это была не подпись, а сам отбор.
     */
    describe('период не сдвигается', () => {
        const прайс = (даты: Date[]) => ({
            company: {
                findUnique: jest.fn(({ where }: any) => Promise.resolve({
                    id: where.id, name: where.id, bin: '000000000000',
                })),
            },
            order: { findMany: jest.fn().mockResolvedValue([]) },
            payment: {
                findMany: jest.fn().mockResolvedValue(даты.map((date, i) => ({
                    id: `payment-${i}`,
                    counterpartyId: COUNTERPARTY,
                    orderId: null,
                    direction: PaymentDirection.IN,
                    amount: 100,
                    date,
                    order: null,
                }))),
            },
            counterpartyOpeningBalance: { findUnique: jest.fn().mockResolvedValue(null) },
            accountingDocument: { findMany: jest.fn().mockResolvedValue([]) },
        });

        it('отдаёт ровно выбранные даты, а не соседние сутки', async () => {
            const service = makeService(прайс([]));
            const result = await service.getReconciliationAct(COMPANY, COUNTERPARTY, {
                startDate: '2026-07-01',
                endDate: '2026-08-17',
            });
            expect(result.period).toEqual({ start: '2026-07-01', end: '2026-08-17' });
        });

        it('первый день периода входит в акт, а канун — нет', async () => {
            const service = makeService(прайс([
                new Date('2026-06-30T23:59:59.999Z'), // канун
                new Date('2026-07-01T00:00:00.000Z'), // первый день
            ]));
            const result = await service.getReconciliationAct(COMPANY, COUNTERPARTY, {
                startDate: '2026-07-01',
                endDate: '2026-08-17',
            });
            // Канун ушёл в сальдо на начало, в строки попал только первый день
            expect(result.rows).toHaveLength(1);
            expect(result.openingBalance).toBe(-100);
        });

        it('последний день периода входит в акт, а следующий — нет', async () => {
            const service = makeService(прайс([
                new Date('2026-08-17T23:59:59.999Z'), // последний день
                new Date('2026-08-18T00:00:00.000Z'), // за периодом
            ]));
            const result = await service.getReconciliationAct(COMPANY, COUNTERPARTY, {
                startDate: '2026-07-01',
                endDate: '2026-08-17',
            });
            expect(result.rows).toHaveLength(1);
        });

        /**
         * Предпросмотр и официальный черновик обязаны считать одно и то же:
         * раньше первый слал мгновение, второй — календарную дату, и они
         * расходились на сутки.
         */
        it('готовая граница со временем больше не переносит начало на сутки назад', async () => {
            const service = makeService(прайс([new Date('2026-07-01T02:00:00.000Z')]));
            // Так период слала старая страница: местная полночь 01.07 в UTC+5
            const мгновением = await service.getReconciliationAct(COMPANY, COUNTERPARTY, {
                startDate: '2026-06-30T19:00:00.000Z',
                endDate: '2026-08-17T18:59:59.999Z',
            });
            const датой = await service.getReconciliationAct(COMPANY, COUNTERPARTY, {
                startDate: '2026-07-01',
                endDate: '2026-08-17',
            });
            expect(мгновением.rows).toHaveLength(1);
            expect(мгновением.rows.length).toBe(датой.rows.length);
            expect(мгновением.closingBalance).toBe(датой.closingBalance);
            // Показывается тот день, что и был выбран, а не предыдущий
            expect(мгновением.period.start).toBe('2026-06-30');
            expect(датой.period.start).toBe('2026-07-01');
        });

        it('несуществующий день отвергается, а не строит акт за чужой период', async () => {
            const service = makeService(прайс([]));
            await expect(service.getReconciliationAct(COMPANY, COUNTERPARTY, {
                startDate: '2026-13-45',
                endDate: '2026-08-17',
            })).rejects.toThrow('Некорректная дата начала периода');
        });
    });
});
