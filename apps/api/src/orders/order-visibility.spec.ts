import { asExecutorSees, hideCustomerPrice, hideExecutorCost, historyCommentFor, isCustomerOnly, maskForCustomer, maskForDriver, neutralHistoryComment } from './order-visibility';

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

describe('Исполнитель не видит сделку экспедитора с заказчиком (задачи шефа, P10)', () => {
    const рейс = () => ({
        customerCompanyId: 'заказчик', forwarderId: 'экспедитор', partnerId: 'парк', subForwarderId: null,
        customerPrice: 520000, customerPriceBase: 520000, isCustomerPaid: true, customerPaidAt: new Date(),
        customerPaymentDays: 15, hasVat: true, vatRate: 16,
        driverCost: 430000, settlementsConfirmedAt: new Date(),
    });

    it('парк-перевозчик: своя ставка видна, цена заказчика — нет', () => {
        const order = maskForCustomer(рейс() as any, 'парк');
        expect(order.driverCost).toBe(430000);
        expect(order.customerPrice).toBeNull();
        expect(order.customerPriceBase).toBeNull();
        expect(order.isCustomerPaid).toBe(false);
        expect(order.customerPaymentDays).toBeNull();
    });

    it('экспедитор видит обе стороны', () => {
        const order = maskForCustomer(рейс() as any, 'экспедитор');
        expect(order).toMatchObject({ customerPrice: 520000, driverCost: 430000 });
    });

    it('парк сам и экспедитор этой заявки — видит всё: это его сделка', () => {
        const order = maskForCustomer({ ...рейс(), forwarderId: 'парк' } as any, 'парк');
        expect(order.customerPrice).toBe(520000);
    });
});

describe('История заявки и рейс парка глазами каждой стороны (владелец, 25.10.2026)', () => {
    const ВЫБОР = 'С биржи выбран водитель Рулев Нурлан (через парк ТОО «Парк (Проверка)») за 555 555 ₸ — водителю на руки 333 333 ₸ с топливом';
    const рейс = (extra: any = {}) => ({
        customerCompanyId: 'заказчик', forwarderId: 'экспедитор', partnerId: 'парк', subForwarderId: null,
        customerPrice: 777777, driverCost: 555555, hasVat: true, vatRate: 16, executorHasVat: false, executorVatRate: 0,
        isDriverPaid: true, isCustomerPaid: false, settlementsConfirmedAt: new Date(),
        forwarder: { id: 'экспедитор', name: 'ТОО «ЛогиКор»' }, partner: { id: 'парк', name: 'ТОО «Парк»' },
        customerCompany: { id: 'заказчик', name: 'ТОО «Магнум»' },
        statusHistory: [{ comment: ВЫБОР }],
        ...extra,
    });

    it('заказчик: в истории ни ставки, ни парка, ни суммы водителю', () => {
        const order = maskForCustomer(рейс() as any, 'заказчик');
        expect(order.statusHistory[0].comment).toBe('С биржи выбран водитель Рулев Нурлан');
    });

    it('экспедитор: своя ставка видна, сумма водителю на руки — нет', () => {
        const comment = historyCommentFor(ВЫБОР, рейс(), { companyId: 'экспедитор' });
        expect(comment).toBe('С биржи выбран водитель Рулев Нурлан (через парк ТОО «Парк (Проверка)») за 555 555 ₸');
    });

    it('парк: его расчёт с водителем — его сведения', () => {
        expect(historyCommentFor(ВЫБОР, рейс(), { companyId: 'парк' })).toBe(ВЫБОР);
    });

    it('водитель: без сумм', () => {
        expect(historyCommentFor(ВЫБОР, рейс(), { driver: true })).toBe('С биржи выбран водитель Рулев Нурлан');
        expect(neutralHistoryComment('С биржи выбран перевозчик ТОО «Алтын» за 350 000 ₸')).toBe('С биржи выбран перевозчик');
        expect(neutralHistoryComment('Заявка переназначена на партнера ИП Сериков')).toBe('Заявка передана перевозчику');
    });

    it('водитель парка не видит ставку парка: это не его оплата', () => {
        const order = maskForDriver(рейс() as any);
        expect(order.driverCost).toBeNull();
        expect(order.customerPrice).toBeNull();
    });

    it('водитель без перевозчика видит свою оплату, как раньше', () => {
        const order = maskForDriver(рейс({ partnerId: null }) as any);
        expect(order.driverCost).toBe(555555);
    });

    it('парк в бухгалтерии: выручка — его ставка, заказчик — экспедитор', () => {
        const seen = asExecutorSees(рейс(), 'парк');
        expect(seen).toMatchObject({
            customerPrice: 555555, customerCompanyId: 'экспедитор', forwarderId: 'парк', partnerId: null,
            hasVat: false, isCustomerPaid: true, driverCost: null,
        });
        expect(seen.customerCompany).toEqual({ id: 'экспедитор', name: 'ТОО «ЛогиКор»' });
        expect(JSON.stringify(seen)).not.toContain('777777');
    });

    it('экспедитору и заказчику заявка — как есть', () => {
        const order = рейс();
        expect(asExecutorSees(order, 'экспедитор')).toBe(order);
        expect(asExecutorSees(order, 'заказчик')).toBe(order);
        // Парк, который сам ведёт рейс без экспедитора, — хозяин, а не исполнитель.
        const own = рейс({ forwarderId: null });
        expect(asExecutorSees(own, 'парк')).toBe(own);
    });

    it('без экспедитора в выборке не подставляет на его место чужого заказчика', () => {
        const { forwarder: _f, ...withoutForwarder } = рейс();
        expect(asExecutorSees(withoutForwarder, 'парк').customerCompany).toBeNull();
    });
});
