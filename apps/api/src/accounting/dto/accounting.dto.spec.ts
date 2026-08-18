import 'reflect-metadata';
import { PaymentDirection } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    CreateManualEntryDto,
    CreatePaymentDto,
    UpdateOrderFinanceDto,
} from './accounting.dto';

describe('accounting DTO validation', () => {
    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects invalid payment amount %s',
        async (amount) => {
            const dto = plainToInstance(CreatePaymentDto, {
                direction: PaymentDirection.IN,
                amount,
                date: '2026-07-25',
            });

            expect(await validate(dto)).not.toHaveLength(0);
        },
    );

    it('accepts a valid payment', async () => {
        const dto = plainToInstance(CreatePaymentDto, {
            direction: PaymentDirection.OUT,
            amount: 1250.5,
            date: '2026-07-25',
        });

        expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects an invalid manual expense date', async () => {
        const dto = plainToInstance(CreateManualEntryDto, {
            date: 'not-a-date',
            category: 'Fuel',
            description: 'Refuel',
            amount: 100,
        });

        expect(await validate(dto)).not.toHaveLength(0);
    });

    it('rejects negative order finance values and VAT above 100%', async () => {
        const dto = plainToInstance(UpdateOrderFinanceDto, {
            customerPrice: -1,
            vatRate: 101,
        });

        expect(await validate(dto)).toHaveLength(2);
    });
});
