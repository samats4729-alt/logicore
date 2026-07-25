import 'reflect-metadata';
import { AccountingDocumentDirection, AccountingDocumentType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    CreateAccountingDocumentDto,
    GenerateReconciliationDraftDto,
} from './accounting-document.dto';

describe('CreateAccountingDocumentDto', () => {
    const valid = {
        type: AccountingDocumentType.PAYMENT_INVOICE,
        direction: AccountingDocumentDirection.OUTGOING,
        counterpartyId: 'company-2',
        documentDate: '2026-07-22',
        lines: [{ name: 'Транспортные услуги', unitPrice: '80000.00' }],
    };

    it('принимает точные суммы строковыми значениями', async () => {
        const dto = plainToInstance(CreateAccountingDocumentDto, valid);
        await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('отклоняет число с лишними знаками после запятой', async () => {
        const dto = plainToInstance(CreateAccountingDocumentDto, {
            ...valid,
            lines: [{ name: 'Услуга', unitPrice: '10.001' }],
        });
        const errors = await validate(dto);
        expect(errors.some((error) => error.property === 'lines')).toBe(true);
    });

    it('разрешает отрицательное начальное сальдо акта сверки', async () => {
        const dto = plainToInstance(CreateAccountingDocumentDto, {
            type: AccountingDocumentType.RECONCILIATION_ACT,
            direction: AccountingDocumentDirection.OUTGOING,
            counterpartyId: 'company-2',
            documentDate: '2026-07-31',
            reportPeriodFrom: '2026-07-01',
            reportPeriodTo: '2026-07-31',
            openingBalance: '-900.00',
            reconciliationLines: [],
        });
        await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('проверяет обязательные поля автоматического акта сверки', async () => {
        const validDto = plainToInstance(GenerateReconciliationDraftDto, {
            counterpartyId: 'company-2',
            reportPeriodFrom: '2026-07-01',
            reportPeriodTo: '2026-07-31',
        });
        await expect(validate(validDto)).resolves.toHaveLength(0);

        const invalidDto = plainToInstance(GenerateReconciliationDraftDto, {
            counterpartyId: '',
            reportPeriodFrom: 'не дата',
            reportPeriodTo: '2026-07-31',
        });
        const errors = await validate(invalidDto);
        expect(errors.map((error) => error.property)).toEqual(
            expect.arrayContaining(['counterpartyId', 'reportPeriodFrom']),
        );
    });
});
