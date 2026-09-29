import { PaymentDirection } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { FinanceCalculatorService } from './finance-calculator.service';
import { D } from '../../common/utils/money';

/**
 * Процент «за оплату» и отмена оплаты.
 *
 * Схема «начислять, когда заказчик оплатил» срабатывала на оплату, но не
 * на её отмену: платёж удалили или вернули, заявка снова в долгах, а
 * процент менеджеру остался. Здесь проверяется, что после удаления и
 * возврата зарплата получает сигнал — и только после записи в базу.
 */
describe('Отмена оплаты — сигнал зарплате', () => {
    const COMPANY = 'мы';

    const build = (payment: Record<string, unknown>) => {
        const calls: string[] = [];
        const tx: any = {
            payment: {
                update: jest.fn(async ({ data }: any) => ({ ...payment, ...data })),
                findMany: jest.fn().mockResolvedValue([]),
            },
            paymentOrderShare: { findMany: jest.fn().mockResolvedValue([]) },
            order: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'р-1',
                    customerPrice: D(100_000),
                    customerPriceBase: D(100_000),
                    currency: 'KZT',
                    driverCost: null,
                    subForwarderId: null,
                    subForwarderPrice: null,
                    // Была оплачена — после удаления платежа перестанет.
                    isCustomerPaid: true,
                    forwarderId: COMPANY,
                    partnerId: null,
                    customerCompanyId: 'заказчик',
                    responsibleManager: { companyId: COMPANY },
                }),
                update: jest.fn().mockResolvedValue({}),
            },
            orderChangeLog: { create: jest.fn().mockResolvedValue({}) },
        };
        const prisma: any = {
            payment: { findFirst: jest.fn().mockResolvedValue(payment) },
            $transaction: jest.fn(async (fn: any) => {
                calls.push('tx.begin');
                const result = await fn(tx);
                calls.push('tx.commit');
                return result;
            }),
        };
        const payroll = {
            processOrderTrigger: jest.fn(),
            revokeUnpaidPercent: jest.fn(async (orderId: string) => { calls.push(`revoke:${orderId}`); }),
        };
        const service = new PaymentsService(
            prisma,
            { checkPeriodNotClosed: jest.fn() } as any,
            { ensureCompanyFinanceSettings: jest.fn() } as any,
            payroll as any,
            { release: jest.fn(), reduce: jest.fn() } as any,
            { rateOn: jest.fn().mockResolvedValue(null) } as any,
            new FinanceCalculatorService(),
        );
        return { service, payroll, calls };
    };

    it('удалили платёж по заявке — зарплата проверяет, не снять ли процент', async () => {
        const { service, payroll, calls } = build({
            id: 'п-1', companyId: COMPANY, orderId: 'р-1', direction: PaymentDirection.IN,
            amount: D(100_000), date: new Date('2026-09-10'), note: null, refunds: [], orderShares: [],
        });

        await service.deletePayment(COMPANY, 'п-1', 'пользователь');

        expect(payroll.revokeUnpaidPercent).toHaveBeenCalledWith('р-1');
        expect(payroll.processOrderTrigger).not.toHaveBeenCalled();
        // Только после записи: откат удаления не должен снимать процент.
        expect(calls.indexOf('revoke:р-1')).toBeGreaterThan(calls.indexOf('tx.commit'));
    });

    it('удалили общий платёж — сигнал по каждой заявке, которую он закрывал', async () => {
        const { service, payroll } = build({
            id: 'п-2', companyId: COMPANY, orderId: null, direction: PaymentDirection.IN,
            amount: D(300_000), date: new Date('2026-09-10'), note: null, refunds: [],
            orderShares: [{ orderId: 'р-1' }, { orderId: 'р-2' }],
        });

        await service.deletePayment(COMPANY, 'п-2', 'пользователь');

        expect(payroll.revokeUnpaidPercent).toHaveBeenCalledWith('р-1');
        expect(payroll.revokeUnpaidPercent).toHaveBeenCalledWith('р-2');
    });
});
