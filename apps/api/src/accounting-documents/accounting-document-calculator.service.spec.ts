import { BadRequestException } from '@nestjs/common';
import { AccountingVatCalculation, AccountingVatTreatment } from '@prisma/client';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';

describe('AccountingDocumentCalculatorService', () => {
    const calculator = new AccountingDocumentCalculatorService();

    it('выделяет НДС 16% из цены 20 000 как в примере счёта', () => {
        const result = calculator.calculateLines([{
            name: 'Экспедиторские услуги',
            unitPrice: '20000.00',
            vatTreatment: AccountingVatTreatment.STANDARD,
            vatCalculation: AccountingVatCalculation.INCLUDED,
            vatRate: '16',
        }]);

        expect(result.subtotal.toFixed(2)).toBe('17241.38');
        expect(result.vatTotal.toFixed(2)).toBe('2758.62');
        expect(result.total.toFixed(2)).toBe('20000.00');
    });

    it('начисляет НДС сверху, когда цена указана без налога', () => {
        const result = calculator.calculateLines([{
            name: 'Услуга',
            unitPrice: '20000',
            vatTreatment: AccountingVatTreatment.STANDARD,
            vatCalculation: AccountingVatCalculation.EXCLUDED,
            vatRate: '16',
        }]);

        expect(result.subtotal.toFixed(2)).toBe('20000.00');
        expect(result.vatTotal.toFixed(2)).toBe('3200.00');
        expect(result.total.toFixed(2)).toBe('23200.00');
    });

    it('не смешивает ставку 0% и режим «без НДС»', () => {
        expect(() => calculator.calculateLines([{
            name: 'Услуга без НДС',
            unitPrice: '1000',
            vatTreatment: AccountingVatTreatment.WITHOUT_VAT,
            vatRate: '16',
        }])).toThrow(BadRequestException);
    });

    it('считает отрицательное начальное сальдо и обороты акта сверки', () => {
        const result = calculator.calculateReconciliation('-900.00', [
            { transactionDate: '2026-07-01', debit: '1200.00' },
            { transactionDate: '2026-07-10', credit: '500.00' },
        ]);

        expect(result.openingBalance.toFixed(2)).toBe('-900.00');
        expect(result.debitTurnover.toFixed(2)).toBe('1200.00');
        expect(result.creditTurnover.toFixed(2)).toBe('500.00');
        expect(result.closingBalance.toFixed(2)).toBe('-200.00');
        expect(result.lines.map((line) => line.runningBalance.toFixed(2))).toEqual(['300.00', '-200.00']);
    });

    it('не допускает одновременный дебет и кредит в одной строке сверки', () => {
        expect(() => calculator.calculateReconciliation('0', [{
            transactionDate: '2026-07-01',
            debit: '100',
            credit: '100',
        }])).toThrow('заполните только дебет или только кредит');
    });
});
