import { PaymentDirection } from '@prisma/client';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { FinancialReportsService } from './financial-reports.service';

describe('FinancialReportsService — акт сверки', () => {
    it('включает операцию, выполненную вечером последнего дня периода', async () => {
        const prisma: any = {
            company: {
                findUnique: jest.fn(({ where }: any) => Promise.resolve({
                    id: where.id,
                    name: where.id === 'company-1' ? 'Наша компания' : 'Контрагент',
                    bin: where.id === 'company-1' ? '123456789012' : '987654321098',
                })),
            },
            order: { findMany: jest.fn().mockResolvedValue([]) },
            payment: {
                findMany: jest.fn().mockResolvedValue([{
                    id: 'payment-1',
                    counterpartyId: 'company-2',
                    orderId: null,
                    direction: PaymentDirection.IN,
                    amount: 100,
                    date: new Date('2026-07-31T18:00:00.000Z'),
                    order: null,
                }]),
            },
            counterpartyOpeningBalance: { findUnique: jest.fn().mockResolvedValue(null) },
        };
        const service = new FinancialReportsService(
            prisma,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
        );

        const result = await service.getReconciliationAct(
            'company-1',
            'company-2',
            { startDate: '2026-07-01', endDate: '2026-07-31' },
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toMatchObject({ debit: 0, credit: 100, balance: -100 });
        expect(result.period.end).toBe('2026-07-31T23:59:59.999Z');
    });
});
