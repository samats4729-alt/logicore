import { counterpartyIsExecutor, counterpartyIsPayer } from './settlement';

const US = 'us';
const THEM = 'them';
const STRANGER = 'stranger';

const order = (o: Partial<Parameters<typeof counterpartyIsExecutor>[0]> = {}) => ({
    customerCompanyId: null,
    forwarderId: null,
    partnerId: null,
    subForwarderId: null,
    ...o,
});

describe('Стороны расчётов по рейсу', () => {
    describe('контрагент — исполнитель (платим мы)', () => {
        it('он субподрядчик на нашем рейсе', () => {
            expect(counterpartyIsExecutor(
                order({ forwarderId: US, subForwarderId: THEM }), US, THEM,
            )).toBe(true);
        });

        it('он экспедитор, а заказчик — мы', () => {
            expect(counterpartyIsExecutor(
                order({ forwarderId: THEM, customerCompanyId: US }), US, THEM,
            )).toBe(true);
        });

        it('роль экспедитора берётся и из partnerId', () => {
            expect(counterpartyIsExecutor(
                order({ partnerId: US, subForwarderId: THEM }), US, THEM,
            )).toBe(true);
        });

        it('чужой рейс — нет: он субподрядчик, но везут не нам', () => {
            expect(counterpartyIsExecutor(
                order({ forwarderId: STRANGER, subForwarderId: THEM }), US, THEM,
            )).toBe(false);
        });

        it('чужой рейс — нет: он экспедитор, но заказчик посторонний', () => {
            expect(counterpartyIsExecutor(
                order({ forwarderId: THEM, customerCompanyId: STRANGER }), US, THEM,
            )).toBe(false);
        });

        it('сделка, где платит он, исполнителем его не делает', () => {
            expect(counterpartyIsExecutor(
                order({ forwarderId: US, customerCompanyId: THEM }), US, THEM,
            )).toBe(false);
        });
    });

    describe('контрагент — плательщик (платят нам)', () => {
        it('он заказчик, а везём мы', () => {
            expect(counterpartyIsPayer(
                order({ customerCompanyId: THEM, forwarderId: US }), US, THEM,
            )).toBe(true);
        });

        it('он экспедитор, а субподрядчик — мы', () => {
            expect(counterpartyIsPayer(
                order({ forwarderId: THEM, subForwarderId: US }), US, THEM,
            )).toBe(true);
        });

        it('чужой рейс — нет: он заказчик, но везёт посторонний', () => {
            expect(counterpartyIsPayer(
                order({ customerCompanyId: THEM, forwarderId: STRANGER }), US, THEM,
            )).toBe(false);
        });

        it('чужой рейс — нет: он экспедитор, но субподрядчик посторонний', () => {
            expect(counterpartyIsPayer(
                order({ forwarderId: THEM, subForwarderId: STRANGER }), US, THEM,
            )).toBe(false);
        });

        it('сделка, где платим мы, плательщиком его не делает', () => {
            expect(counterpartyIsPayer(
                order({ forwarderId: US, subForwarderId: THEM }), US, THEM,
            )).toBe(false);
        });
    });

    it('две стороны не путаются между собой на одном рейсе', () => {
        // Он субподрядчик: платим мы. Значит плательщиком он быть не может.
        const subcontract = order({ forwarderId: US, subForwarderId: THEM });
        expect(counterpartyIsExecutor(subcontract, US, THEM)).toBe(true);
        expect(counterpartyIsPayer(subcontract, US, THEM)).toBe(false);

        // Он заказчик: платит он. Значит исполнителем он быть не может.
        const sale = order({ customerCompanyId: THEM, forwarderId: US });
        expect(counterpartyIsPayer(sale, US, THEM)).toBe(true);
        expect(counterpartyIsExecutor(sale, US, THEM)).toBe(false);
    });
});
