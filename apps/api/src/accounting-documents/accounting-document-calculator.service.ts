import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountingVatCalculation, AccountingVatTreatment, Prisma } from '@prisma/client';
import {
    AccountingDocumentLineDto,
    AccountingReconciliationLineDto,
} from './dto/accounting-document.dto';

const ZERO = new Prisma.Decimal(0);
const ONE_HUNDRED = new Prisma.Decimal(100);

@Injectable()
export class AccountingDocumentCalculatorService {
    private decimal(value: string | undefined, fallback = '0') {
        try {
            return new Prisma.Decimal(value ?? fallback);
        } catch {
            throw new BadRequestException('Некорректное числовое значение в документе');
        }
    }

    private money(value: Prisma.Decimal) {
        return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    }

    calculateLines(lines: AccountingDocumentLineDto[]) {
        if (!lines.length) {
            throw new BadRequestException('Документ должен содержать хотя бы одну строку');
        }

        let documentSubtotal = ZERO;
        let documentDiscount = ZERO;
        let documentVat = ZERO;
        let documentTotal = ZERO;

        const calculatedLines = lines.map((line, index) => {
            const quantity = this.decimal(line.quantity, '1');
            const unitPrice = this.decimal(line.unitPrice);
            const discountAmount = this.money(this.decimal(line.discountAmount));
            const vatTreatment = line.vatTreatment ?? AccountingVatTreatment.WITHOUT_VAT;
            const vatCalculation = line.vatCalculation ?? AccountingVatCalculation.INCLUDED;
            const vatRate = this.decimal(line.vatRate);

            if (quantity.lte(0)) {
                throw new BadRequestException(`Строка ${index + 1}: количество должно быть больше нуля`);
            }
            if (unitPrice.lt(0) || discountAmount.lt(0)) {
                throw new BadRequestException(`Строка ${index + 1}: цена и скидка не могут быть отрицательными`);
            }
            if (vatRate.lt(0) || vatRate.gt(100)) {
                throw new BadRequestException(`Строка ${index + 1}: ставка НДС должна быть от 0 до 100`);
            }
            if (vatTreatment === AccountingVatTreatment.STANDARD && vatRate.lte(0)) {
                throw new BadRequestException(`Строка ${index + 1}: для обычного НДС укажите ставку`);
            }
            if (vatTreatment !== AccountingVatTreatment.STANDARD && !vatRate.isZero()) {
                throw new BadRequestException(`Строка ${index + 1}: ставка допустима только для обычного НДС`);
            }

            const enteredAmount = this.money(quantity.mul(unitPrice));
            if (discountAmount.gt(enteredAmount)) {
                throw new BadRequestException(`Строка ${index + 1}: скидка больше стоимости строки`);
            }

            const afterDiscount = this.money(enteredAmount.minus(discountAmount));
            let subtotal = afterDiscount;
            let vatAmount = ZERO;
            let total = afterDiscount;

            if (vatTreatment === AccountingVatTreatment.STANDARD) {
                if (vatCalculation === AccountingVatCalculation.INCLUDED) {
                    vatAmount = this.money(afterDiscount.mul(vatRate).div(ONE_HUNDRED.plus(vatRate)));
                    subtotal = this.money(afterDiscount.minus(vatAmount));
                } else {
                    vatAmount = this.money(afterDiscount.mul(vatRate).div(ONE_HUNDRED));
                    total = this.money(afterDiscount.plus(vatAmount));
                }
            }

            documentSubtotal = documentSubtotal.plus(subtotal);
            documentDiscount = documentDiscount.plus(discountAmount);
            documentVat = documentVat.plus(vatAmount);
            documentTotal = documentTotal.plus(total);

            return {
                lineNumber: index + 1,
                serviceCode: line.serviceCode,
                name: line.name.trim(),
                description: line.description,
                serviceDate: line.serviceDate ? new Date(line.serviceDate) : undefined,
                reportDetails: line.reportDetails,
                quantity,
                unit: line.unit?.trim() || 'усл',
                unitCode: line.unitCode,
                unitPrice,
                subtotal,
                discountAmount,
                vatTreatment,
                vatCalculation,
                vatRate,
                vatAmount,
                total,
                orderId: line.orderId,
            };
        });

        return {
            lines: calculatedLines,
            subtotal: this.money(documentSubtotal),
            discountTotal: this.money(documentDiscount),
            vatTotal: this.money(documentVat),
            total: this.money(documentTotal),
        };
    }

    calculateReconciliation(
        openingBalanceValue: string | undefined,
        lines: AccountingReconciliationLineDto[],
    ) {
        const openingBalance = this.money(this.decimal(openingBalanceValue));
        let debitTurnover = ZERO;
        let creditTurnover = ZERO;
        let runningBalance = openingBalance;

        const calculatedLines = lines.map((line, index) => {
            const debit = this.money(this.decimal(line.debit));
            const credit = this.money(this.decimal(line.credit));
            if (debit.lt(0) || credit.lt(0)) {
                throw new BadRequestException(`Строка сверки ${index + 1}: суммы не могут быть отрицательными`);
            }
            if (debit.isZero() === credit.isZero()) {
                throw new BadRequestException(`Строка сверки ${index + 1}: заполните только дебет или только кредит`);
            }

            debitTurnover = debitTurnover.plus(debit);
            creditTurnover = creditTurnover.plus(credit);
            runningBalance = this.money(runningBalance.plus(debit).minus(credit));

            return {
                lineNumber: index + 1,
                transactionDate: new Date(line.transactionDate),
                sourceDocumentType: line.sourceDocumentType,
                sourceDocumentNumber: line.sourceDocumentNumber,
                description: line.description,
                debit,
                credit,
                runningBalance,
            };
        });

        return {
            lines: calculatedLines,
            openingBalance,
            debitTurnover: this.money(debitTurnover),
            creditTurnover: this.money(creditTurnover),
            closingBalance: this.money(runningBalance),
        };
    }
}
