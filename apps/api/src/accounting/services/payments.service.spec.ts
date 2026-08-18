import { PaymentDirection } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { FinanceCalculatorService } from './finance-calculator.service';

/**
 * Проверяем не арифметику (она покрыта finance-calculator), а транзакционность:
 * платёж, пересчёт флагов заявки и запись в журнал обязаны идти одним
 * транзакционным клиентом, а payroll-триггер — только после коммита.
 */
describe('PaymentsService atomicity', () => {
    const ORDER_ID = 'order-1';

    function buildHarness(options: { failChangeLog?: boolean } = {}) {
        const calls: string[] = [];

        // Транзакционный клиент: всё, что через него пишется, откатывается вместе.
        const tx = {
            payment: {
                create: jest.fn().mockImplementation(async () => {
                    calls.push('tx.payment.create');
                    return {
                        id: 'payment-1',
                        orderId: ORDER_ID,
                        direction: PaymentDirection.IN,
                        amount: 1000,
                        note: null,
                    };
                }),
                findMany: jest.fn().mockResolvedValue([{ amount: 1000 }]),
            },
            // Доли общих платежей: в этом сценарии их нет, но канонический
            // расчёт спрашивает про них всегда.
            paymentOrderShare: {
                findMany: jest.fn().mockResolvedValue([]),
                createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            order: {
                findUnique: jest.fn().mockResolvedValue({
                    id: ORDER_ID,
                    customerPrice: 1000,
                    driverCost: 0,
                    subForwarderId: null,
                    subForwarderPrice: null,
                    isCustomerPaid: false,
                    customerPaidAt: null,
                    driverPaidAt: null,
                    subForwarderPaidAt: null,
                    forwarderId: 'company-1',
                    partnerId: null,
                    customerCompanyId: 'customer-1',
                    outgoingInvoice: null,
                    incomingInvoice: null,
                    responsibleManager: { companyId: 'company-1' },
                }),
                update: jest.fn().mockImplementation(async () => {
                    calls.push('tx.order.update');
                    return {};
                }),
            },
            orderChangeLog: {
                create: jest.fn().mockImplementation(async () => {
                    calls.push('tx.orderChangeLog.create');
                    if (options.failChangeLog) throw new Error('changelog failed');
                    return {};
                }),
            },
        };

        const prisma = {
            $transaction: jest.fn().mockImplementation(async (cb: any) => {
                calls.push('tx.begin');
                const result = await cb(tx);
                calls.push('tx.commit');
                return result;
            }),
            order: {
                findUnique: jest.fn().mockResolvedValue(null),
                // Стороны рейса: по ним сервис сверяет направление платежа.
                // Здесь плательщик — заказчик, и поступление от него верно.
                findMany: jest.fn().mockResolvedValue([{
                    orderNumber: '1',
                    customerCompanyId: 'customer-1',
                    forwarderId: 'company-1',
                    partnerId: null,
                    subForwarderId: null,
                }]),
            },
            financeAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'acc-1', name: 'Расчетный счет', currency: 'KZT' }) },
            financeCategory: { findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }) },
            // Ловушка: если сервис случайно запишет мимо транзакции — тест упадёт.
            payment: {
                create: jest.fn().mockImplementation(() => {
                    throw new Error('payment.create ушёл мимо транзакции');
                }),
                findMany: jest.fn().mockImplementation(() => {
                    throw new Error('payment.findMany ушёл мимо транзакции');
                }),
            },
            orderChangeLog: {
                create: jest.fn().mockImplementation(() => {
                    throw new Error('orderChangeLog.create ушёл мимо транзакции');
                }),
            },
        };

        const payrollService = {
            processOrderTrigger: jest.fn().mockImplementation(async () => {
                calls.push('payroll.trigger');
            }),
        };

        const service = new PaymentsService(
            prisma as any,
            { checkPeriodNotClosed: jest.fn().mockResolvedValue(undefined) } as any,
            { ensureCompanyFinanceSettings: jest.fn().mockResolvedValue(undefined) } as any,
            payrollService as any,
            { release: jest.fn().mockResolvedValue({ documents: 0 }) } as any,
            // Тенговый платёж курса не спрашивает — заглушка на случай, если
            // однажды спросит.
            { toBase: jest.fn().mockResolvedValue(null) } as any,
            new FinanceCalculatorService(),
        );

        return { service, prisma, tx, payrollService, calls };
    }

    const payload = {
        orderId: ORDER_ID,
        counterpartyId: 'customer-1',
        direction: PaymentDirection.IN,
        amount: 1000,
        date: '2026-07-25',
    };

    it('writes the payment, the order flags and the change log through one transaction', async () => {
        const { service, tx, calls } = buildHarness();

        await service.createPayment('company-1', 'user-1', payload);

        expect(tx.payment.create).toHaveBeenCalledTimes(1);
        expect(tx.order.update).toHaveBeenCalledTimes(1);
        expect(tx.orderChangeLog.create).toHaveBeenCalledTimes(1);

        // Все три записи — между началом и коммитом одной транзакции.
        const begin = calls.indexOf('tx.begin');
        const commit = calls.indexOf('tx.commit');
        for (const write of ['tx.payment.create', 'tx.order.update', 'tx.orderChangeLog.create']) {
            expect(calls.indexOf(write)).toBeGreaterThan(begin);
            expect(calls.indexOf(write)).toBeLessThan(commit);
        }
    });

    it('fires the payroll trigger only after the transaction has committed', async () => {
        const { service, payrollService, calls } = buildHarness();

        await service.createPayment('company-1', 'user-1', payload);

        expect(payrollService.processOrderTrigger).toHaveBeenCalledWith(ORDER_ID, 'CUSTOMER_PAID');
        expect(calls.indexOf('payroll.trigger')).toBeGreaterThan(calls.indexOf('tx.commit'));
    });

    it('does not accrue payroll when the write fails', async () => {
        const { service, payrollService } = buildHarness({ failChangeLog: true });

        await expect(service.createPayment('company-1', 'user-1', payload)).rejects.toThrow(
            'changelog failed',
        );

        // Транзакция откатится, значит начислять зарплату по несостоявшейся
        // оплате нельзя — раньше платёж и флаг уже были записаны к этому моменту.
        expect(payrollService.processOrderTrigger).not.toHaveBeenCalled();
    });
});
