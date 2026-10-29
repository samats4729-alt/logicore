import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DriverCalculatorController } from './driver-calculator.controller';
import { ExchangeSettlementService } from './settlement.service';

/** Калькулятор водителя без ИП — только для парка (владелец, 29.10.2026). */
describe('Калькулятор водителя без ИП', () => {
    function build(isPark = true) {
        const prisma: any = {
            company: { findUnique: jest.fn().mockResolvedValue({ isPark }) },
            parkPayoutRates: { findUnique: jest.fn().mockResolvedValue(null) },
            platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        };
        const settlement = new ExchangeSettlementService(prisma);
        return { prisma, controller: new DriverCalculatorController(prisma, settlement) };
    }
    const req = { user: { companyId: 'c-1' } };

    it('пример шефа: 100 000, топливо 27 000, с вычетом, без НДС → на руки 65 700, заказчику 115 219,50', async () => {
        const { controller } = build();
        const r = await controller.driver(req, { amount: '100000', fuel: '27000', deduction: 'true', vat: 'false' });
        expect(r.calc.driverTotal).toBe(65700);
        expect(r.calc.customerPrice).toBe(115219.5);
        expect(r.ratesFrom).toBe('PARK');
    });

    it('от суммы «на руки» — та же сумма водителю', async () => {
        const { controller } = build();
        const r = await controller.driver(req, { from: 'onHand', amount: '65700', fuel: '27000', deduction: 'true', vat: 'false' });
        expect(r.calc.driverTotal).toBe(65700);
        expect(r.calc.customerPrice).toBe(115219.5);
    });

    it('топливо по километрам — по стандартной цене литра', async () => {
        const { controller } = build();
        const r = await controller.driver(req, { amount: '300000', km: '1000', vat: 'false' });
        expect(r.calc.fuel).toBe(1000 * r.fuelPerKm);
    });

    it('парк считает по своим ставкам', async () => {
        const { controller, prisma } = build(true);
        const r = await controller.driver(req, { amount: '100000', fuel: '0' });
        expect(r.ratesFrom).toBe('PARK');
        expect(prisma.parkPayoutRates.findUnique).toHaveBeenCalledWith({ where: { parkCompanyId: 'c-1' } });
    });

    it('компании без парка расчёт не отдаётся', async () => {
        const { controller } = build(false);
        await expect(controller.driver(req, { amount: '100000', fuel: '27000' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('администратор платформы считает по стандартным ставкам', async () => {
        const { controller } = build(false);
        const r = await controller.driver({ user: { companyId: 'c-own', role: 'ADMIN' } }, { amount: '100000', fuel: '27000', deduction: 'true', vat: 'false' });
        expect(r.ratesFrom).toBe('DEFAULT');
        expect(r.calc.driverTotal).toBe(65700);
    });

    it('сумма меньше топлива — понятный отказ', async () => {
        const { controller } = build();
        await expect(controller.driver(req, { amount: '10', fuel: '27000' })).rejects.toBeInstanceOf(BadRequestException);
    });
});
