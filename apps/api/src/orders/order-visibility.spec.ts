import { hideCustomerPrice, hideExecutorCost, isCustomerOnly, maskForCustomer } from './order-visibility';

/**
 * Кто какие деньги по рейсу видит.
 *
 * Проверяется одно правило, но оно дороже большинства остальных: разница
 * между ценой заказчика и оплатой перевозчика — заработок экспедитора.
 * Заказчик, увидевший его, приходит на следующие переговоры с готовым
 * требованием скидки.
 *
 * Живьём на стенде так и было: в карточке рейса себестоимость скрывалась,
 * а список заявок отдавал заказчику обе цены строкой — «клиент платит
 * 480 000, перевозчику 380 000».
 */
describe('Видимость денег по рейсу', () => {
    const CUSTOMER = 'заказчик';
    const FORWARDER = 'экспедитор';

    const order = (overrides: any = {}) => ({
        customerCompanyId: CUSTOMER,
        forwarderId: FORWARDER,
        subForwarderId: null,
        partnerId: null,
        customerPrice: 480000,
        driverCost: 380000,
        subForwarderPrice: 400000,
        isDriverPaid: true,
        driverPaidAt: new Date('2026-08-01'),
        isSubForwarderPaid: true,
        subForwarderPaidAt: new Date('2026-08-01'),
        partner: { id: 'p-1', name: 'ТОО «Перевозчик»' },
        ...overrides,
    });

    describe('кто здесь только заказчик', () => {
        it('заказчик, который сам не везёт', () => {
            expect(isCustomerOnly(order(), CUSTOMER)).toBe(true);
        });

        it('экспедитор — не заказчик', () => {
            expect(isCustomerOnly(order(), FORWARDER)).toBe(false);
        });

        it('компания и заказчик, и экспедитор по одному рейсу — не прячем', () => {
            // Так бывает: своя же компания оформила рейс и сама его везёт.
            // Спрятать от неё её себестоимость — спрятать рейс от того, кто
            // его и выполняет.
            expect(isCustomerOnly(order({ forwarderId: CUSTOMER }), CUSTOMER)).toBe(false);
        });

        it('заказчик, который заодно партнёр-перевозчик — не прячем', () => {
            expect(isCustomerOnly(order({ partnerId: CUSTOMER }), CUSTOMER)).toBe(false);
        });

        it('заказчик, который заодно суб-экспедитор — не прячем', () => {
            expect(isCustomerOnly(order({ subForwarderId: CUSTOMER }), CUSTOMER)).toBe(false);
        });

        it('без компании правило не срабатывает', () => {
            // Внутренние вызовы идут без компании — им скрывать нечего.
            expect(isCustomerOnly(order(), undefined)).toBe(false);
            expect(isCustomerOnly(order(), null)).toBe(false);
        });

        it('посторонняя компания заказчиком не считается', () => {
            expect(isCustomerOnly(order(), 'посторонняя')).toBe(false);
        });
    });

    describe('что именно прячется от заказчика', () => {
        it('оплата перевозчику', () => {
            expect(hideExecutorCost(order()).driverCost).toBeNull();
        });

        it('ставка суб-экспедитора', () => {
            const hidden = hideExecutorCost(order());
            expect(hidden.subForwarderPrice).toBeNull();
            expect(hidden.subForwarderId).toBeNull();
        });

        it('сам перевозчик — по нему видно, у кого узнавать цену', () => {
            expect(hideExecutorCost(order()).partner).toBeNull();
        });

        it('отметки об оплате перевозчику', () => {
            // «Перевозчику оплачено 1 августа» — это тоже сведения о том,
            // что между экспедитором и перевозчиком есть свои деньги.
            const hidden = hideExecutorCost(order());
            expect(hidden.isDriverPaid).toBe(false);
            expect(hidden.driverPaidAt).toBeNull();
            expect(hidden.isSubForwarderPaid).toBe(false);
            expect(hidden.subForwarderPaidAt).toBeNull();
        });

        it('своя цена остаётся — иначе заказчик не увидит, за что платит', () => {
            expect(hideExecutorCost(order()).customerPrice).toBe(480000);
        });
    });

    describe('правило целиком', () => {
        it('заказчику себестоимость не видна', () => {
            const masked = maskForCustomer(order(), CUSTOMER);

            expect(masked.driverCost).toBeNull();
            expect(masked.subForwarderPrice).toBeNull();
            expect(masked.customerPrice).toBe(480000);
        });

        it('экспедитор видит обе суммы — это его рейс', () => {
            const visible = maskForCustomer(order(), FORWARDER);

            expect(visible.driverCost).toBe(380000);
            expect(visible.customerPrice).toBe(480000);
        });

        it('без компании ничего не прячется', () => {
            expect(maskForCustomer(order(), undefined).driverCost).toBe(380000);
        });
    });

    describe('налоговая часть до проверки бухгалтером', () => {
        /**
         * Заявка появляется у контрагента сразу — он должен знать, что везёт.
         * А НДС и срок оплаты до проверки — это ещё не условия сделки, а
         * значения по умолчанию: «без НДС» и пустой срок. Показать их
         * контрагенту значит сказать неправду и потом переигрывать.
         */
        const withSettlements = (overrides: any = {}) => order({
            hasVat: false,
            vatRate: 0,
            executorHasVat: false,
            customerPaymentDays: 30,
            customerPaymentFrom: 'UNLOAD',
            customerPaymentDate: new Date('2026-09-30'),
            settlementsConfirmedAt: null,
            ...overrides,
        });

        it('заказчик не видит неподтверждённые НДС и сроки', () => {
            const masked: any = maskForCustomer(withSettlements(), CUSTOMER);

            expect(masked.hasVat).toBeNull();
            expect(masked.customerPaymentDays).toBeNull();
            expect(masked.customerPaymentDate).toBeNull();
        });

        it('вместо цифр остаётся признак «уточняются» — чтобы объяснить пустоту', () => {
            const masked: any = maskForCustomer(withSettlements(), CUSTOMER);

            expect(masked.settlementsPending).toBe(true);
        });

        it('условия с перевозчиком заказчику не видны и после проверки', () => {
            // Отсрочка и НДС перевозчика — часть нашей договорённости с ним.
            // По ним заказчику видно, как устроена наша сторона сделки, — это
            // та же чувствительность, что и сумма, которую мы платим.
            const masked: any = maskForCustomer(
                withSettlements({
                    settlementsConfirmedAt: new Date('2026-08-12'),
                    executorHasVat: true,
                    carrierPaymentDays: 15,
                    carrierPaymentFrom: 'ORIGINALS',
                }),
                CUSTOMER,
            );

            expect(masked.carrierPaymentDays).toBeNull();
            expect(masked.executorHasVat).toBeNull();
        });

        it('после проверки бухгалтером контрагент видит условия', () => {
            const masked: any = maskForCustomer(
                withSettlements({ settlementsConfirmedAt: new Date('2026-08-12') }),
                CUSTOMER,
            );

            expect(masked.hasVat).toBe(false);
            expect(masked.customerPaymentDays).toBe(30);
            expect(masked.settlementsPending).toBeUndefined();
        });

        it('перевозчик со своей стороны — то же правило', () => {
            const CARRIER = 'перевозчик';
            const masked: any = maskForCustomer(
                withSettlements({ subForwarderId: CARRIER }),
                CARRIER,
            );

            expect(masked.executorHasVat).toBeNull();
        });

        it('хозяин рейса видит свою кухню всегда — иначе бухгалтеру нечего проверять', () => {
            const visible: any = maskForCustomer(withSettlements(), FORWARDER);

            expect(visible.hasVat).toBe(false);
            expect(visible.customerPaymentDays).toBe(30);
        });
    });

    describe('что видит водитель', () => {
        it('цена заказчика скрыта', () => {
            // Водителю платит перевозчик или экспедитор. Сколько за тот же
            // рейс платит грузовладелец — не его сведения.
            expect(hideCustomerPrice(order()).customerPrice).toBeNull();
        });

        it('своя оплата остаётся', () => {
            expect(hideCustomerPrice(order()).driverCost).toBe(380000);
        });
    });
});
