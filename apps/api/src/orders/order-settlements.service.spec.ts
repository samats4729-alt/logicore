import { OrderSettlementsService } from './order-settlements.service';

/**
 * Расчёты по рейсу: откуда берутся НДС и сроки и когда их проверяет человек.
 *
 * Смысл проверки — не в лишнем шаге, а в том, чтобы «без НДС» и «15 дней» не
 * попадали в подписанный документ по умолчанию. Поэтому здесь проверяется
 * ровно это: полные условия проходят сами, неполные ждут бухгалтера.
 */

const CARD_FULL_CUSTOMER = {
    id: 'cust-1', name: 'ТОО «Магнум»',
    isExternal: true, createdByCompanyId: 'we-1',
    vatPayer: true, vatRate: 16, invoiceTiming: 'AFTER_UNLOAD',
    customerPaymentDays: 30, customerPaymentFrom: 'UNLOAD',
    carrierPaymentDays: null, carrierPaymentFrom: null,
};

const CARD_FULL_CARRIER = {
    id: 'carr-1', name: 'ИП Сериков',
    isExternal: true, createdByCompanyId: 'we-1',
    vatPayer: false, vatRate: null, invoiceTiming: null,
    customerPaymentDays: null, customerPaymentFrom: null,
    carrierPaymentDays: 15, carrierPaymentFrom: 'ORIGINALS',
};

function build(cards: any[], order?: any) {
    const updates: any[] = [];
    const prisma: any = {
        company: { findMany: jest.fn().mockResolvedValue(cards) },
        user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Айгуль', lastName: 'Абаева' }) },
        order: {
            findUnique: jest.fn().mockResolvedValue(order ?? DEFAULT_ORDER),
            findFirst: jest.fn().mockResolvedValue(order ?? DEFAULT_ORDER),
            update: jest.fn(async (args: any) => { updates.push(args); return { id: 'o-1', ...args.data }; }),
        },
    };
    return { service: new OrderSettlementsService(prisma), prisma, updates };
}

const DEFAULT_ORDER = {
    id: 'o-1',
    customerCompanyId: 'cust-1',
    forwarderId: 'we-1',
    partnerId: null,
    subForwarderId: 'carr-1',
    hasVat: true, vatRate: 16, executorHasVat: false, executorVatRate: 0,
    customerPaymentDays: 30, customerPaymentFrom: 'UNLOAD',
    carrierPaymentDays: 15, carrierPaymentFrom: 'ORIGINALS',
    customerPaymentDate: new Date('2026-09-30T00:00:00Z'),
    driverPaymentDate: null,
    settlementsConfirmedAt: new Date('2026-08-12T10:00:00Z'),
    settlementsConfirmedById: null,
    routePoints: [
        { pointType: 'PICKUP', expectedDate: new Date('2026-08-29T00:00:00Z') },
        { pointType: 'DELIVERY', expectedDate: new Date('2026-08-31T00:00:00Z') },
    ],
};

describe('Расчёты по рейсу', () => {
    describe('условия для новой заявки', () => {
        it('НДС и сроки берутся из карточек сторон', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            const terms = await service.termsForNewOrder({
                ourCompanyId: 'we-1',
                customerCompanyId: 'cust-1',
                forwarderId: 'we-1',
                subForwarderId: 'carr-1',
                unloadAt: new Date('2026-08-31T00:00:00Z'),
            });

            expect(terms.hasVat).toBe(true);
            expect(terms.vatRate).toBe(16);
            expect(terms.executorHasVat).toBe(false);
            expect(terms.carrierPaymentDays).toBe(15);
            expect(terms.carrierPaymentFrom).toBe('ORIGINALS');
        });

        it('срок «от выгрузки» превращается в дату платежа', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            const terms = await service.termsForNewOrder({
                ourCompanyId: 'we-1',
                customerCompanyId: 'cust-1',
                forwarderId: 'we-1',
                subForwarderId: 'carr-1',
                unloadAt: new Date('2026-08-31T00:00:00Z'),
            });

            expect(terms.customerPaymentDate).toEqual(new Date('2026-09-30T00:00:00Z'));
        });

        it('срок «от оригиналов» даты пока не даёт: оригиналов ещё нет', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            const terms = await service.termsForNewOrder({
                ourCompanyId: 'we-1',
                customerCompanyId: 'cust-1',
                forwarderId: 'we-1',
                subForwarderId: 'carr-1',
                unloadAt: new Date('2026-08-31T00:00:00Z'),
            });

            expect(terms.driverPaymentDate).toBeNull();
        });

        it('в карточках всё заполнено — проверка проходит сама', async () => {
            // Иначе бухгалтер весь день жмёт кнопку на рейсах, где решать
            // нечего, и перестаёт читать то, что подтверждает.
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            const terms = await service.termsForNewOrder({
                ourCompanyId: 'we-1', customerCompanyId: 'cust-1',
                forwarderId: 'we-1', subForwarderId: 'carr-1',
            });

            expect(terms.settlementsConfirmedAt).toBeInstanceOf(Date);
        });

        it('в карточке перевозчика пусто — рейс ждёт бухгалтера', async () => {
            const { service } = build([
                CARD_FULL_CUSTOMER,
                { ...CARD_FULL_CARRIER, vatPayer: null, carrierPaymentDays: null, carrierPaymentFrom: null },
            ]);

            const terms = await service.termsForNewOrder({
                ourCompanyId: 'we-1', customerCompanyId: 'cust-1',
                forwarderId: 'we-1', subForwarderId: 'carr-1',
            });

            expect(terms.settlementsConfirmedAt).toBeNull();
        });

        it('«не выяснено» по НДС печатается не как «без НДС», а не печатается вовсе', async () => {
            // vatPayer = null означает, что вопрос не задавали. Ставить false
            // молча — ровно та ошибка, из-за которой всё это затевалось.
            const { service } = build([{ ...CARD_FULL_CARRIER, vatPayer: null }]);

            const terms = await service.termsForNewOrder({
                ourCompanyId: 'we-1', forwarderId: 'we-1', subForwarderId: 'carr-1',
            });

            expect(terms.settlementsConfirmedAt).toBeNull();
        });

        it('перевозчика ещё нет — это не мешает: его ищут после заведения рейса', async () => {
            const { service } = build([CARD_FULL_CUSTOMER]);

            const terms = await service.termsForNewOrder({
                ourCompanyId: 'we-1', customerCompanyId: 'cust-1', forwarderId: 'we-1',
            });

            expect(terms.settlementsConfirmedAt).toBeInstanceOf(Date);
        });
    });

    describe('состояние на экране', () => {
        it('видно обе стороны, ставки и дату платежа', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            const state = await service.stateOf('o-1', 'we-1');

            expect(state.confirmed).toBe(true);
            expect(state.customer.name).toBe('ТОО «Магнум»');
            expect(state.customer.vatPayer).toBe(true);
            expect(state.customer.dueDate).toEqual(new Date('2026-09-30T00:00:00Z'));
            expect(state.carrier.name).toBe('ИП Сериков');
            expect(state.carrier.days).toBe(15);
        });

        it('дата платежа перевозчику ждёт оригиналов — и сказано, чего именно', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            const state = await service.stateOf('o-1', 'we-1');

            expect(state.carrier.dueDate).toBeNull();
            expect(state.carrier.dueDependsOn).toBe('получения оригиналов накладных');
        });

        it('чего не хватает — написано карточкой и именем контрагента', async () => {
            const { service } = build(
                [CARD_FULL_CUSTOMER, { ...CARD_FULL_CARRIER, vatPayer: null, carrierPaymentDays: null }],
                { ...DEFAULT_ORDER, settlementsConfirmedAt: null },
            );

            const state = await service.stateOf('o-1', 'we-1');

            expect(state.missing).toEqual([
                'В карточке перевозчика «ИП Сериков» не заполнены условия расчётов',
            ]);
        });

        it('у проверенных расчётов списка нехватки нет — он спорил бы с отметкой', async () => {
            const { service } = build([
                CARD_FULL_CUSTOMER,
                { ...CARD_FULL_CARRIER, vatPayer: null, carrierPaymentDays: null },
            ]);

            const state = await service.stateOf('o-1', 'we-1');

            expect(state.confirmed).toBe(true);
            expect(state.missing).toEqual([]);
        });

        it('сторона работает на платформе — сказано, что условия задают по рейсу', async () => {
            // В чужой организации нашу договорённость хранить нельзя: у неё
            // свои договорённости с другими. Просить «заполните карточку» в
            // этом случае — отправлять человека туда, где поля не появятся.
            const { service } = build(
                [CARD_FULL_CUSTOMER, {
                    ...CARD_FULL_CARRIER,
                    isExternal: false, createdByCompanyId: null,
                    vatPayer: null, carrierPaymentDays: null,
                }],
                { ...DEFAULT_ORDER, settlementsConfirmedAt: null },
            );

            const state = await service.stateOf('o-1', 'we-1');

            expect(state.missing[0]).toContain('работает на платформе');
            expect(state.missing[0]).toContain('задайте здесь');
        });

        it('подтверждение человеком подписано именем', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER], {
                ...DEFAULT_ORDER, settlementsConfirmedById: 'u-9',
            });

            const state = await service.stateOf('o-1', 'we-1');

            expect(state.source).toBe('PERSON');
            expect(state.confirmedByName).toBe('Абаева Айгуль');
        });

        it('подтверждение по карточкам именем не подписывается', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            const state = await service.stateOf('o-1', 'we-1');

            expect(state.source).toBe('CARDS');
            expect(state.confirmedByName).toBeNull();
        });

        it('заявки до включения проверки помечены отдельно, а не чужим именем', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER], {
                ...DEFAULT_ORDER,
                customerPaymentDays: null, carrierPaymentDays: null,
                settlementsConfirmedById: null,
            });

            const state = await service.stateOf('o-1', 'we-1');

            expect(state.source).toBe('LEGACY');
        });
    });

    describe('кому расчёты вообще видны', () => {
        /**
         * В расчётах видны обе стороны сразу. Заказчику незачем знать, на
         * каких условиях мы работаем с перевозчиком: из ставки и отсрочки
         * складывается наш заработок — то самое, что скрывают в карточке
         * рейса. Раньше отбор шёл по «участник рейса», и заказчик получал
         * условия перевозчика вместе со своими.
         */
        it('заказчику расчёты по чужому рейсу не отдаются', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            await expect(service.stateOf('o-1', 'cust-1'))
                .rejects.toThrow(/видит компания, которая его ведёт/);
        });

        it('перевозчику — тоже', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            await expect(service.stateOf('o-1', 'carr-1'))
                .rejects.toThrow(/видит компания, которая его ведёт/);
        });

        it('подтвердить чужой рейс нельзя', async () => {
            const { service, updates } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            await expect(service.confirm('o-1', 'cust-1', 'u-9')).rejects.toThrow();
            expect(updates).toHaveLength(0);
        });

        it('хозяин рейса проходит', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            await expect(service.stateOf('o-1', 'we-1')).resolves.toBeDefined();
        });
    });

    describe('правка бухгалтером', () => {
        it('правка и есть проверка: второй кнопки не нужно', async () => {
            const { service, updates } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            await service.patchTerms('o-1', 'we-1', 'u-9', { executorHasVat: true, executorVatRate: 16 });

            expect(updates[0].data.executorHasVat).toBe(true);
            expect(updates[0].data.settlementsConfirmedById).toBe('u-9');
            expect(updates[0].data.settlementsConfirmedAt).toBeInstanceOf(Date);
        });

        it('срок пересчитывает дату платежа', async () => {
            const { service, updates } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            await service.patchTerms('o-1', 'we-1', 'u-9', {
                customerPaymentDays: 10, customerPaymentFrom: 'UNLOAD',
            });

            expect(updates[0].data.customerPaymentDate).toEqual(new Date('2026-09-10T00:00:00Z'));
        });

        it('дни без точки отсчёта не сохраняются', async () => {
            const { service, updates } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            await expect(service.patchTerms('o-1', 'we-1', 'u-9', { carrierPaymentDays: 20 }))
                .rejects.toThrow(/от какого дня/);
            expect(updates).toHaveLength(0);
        });

        it('ставка НДС вне здравого диапазона не проходит', async () => {
            const { service } = build([CARD_FULL_CUSTOMER, CARD_FULL_CARRIER]);

            await expect(service.patchTerms('o-1', 'we-1', 'u-9', { vatRate: 300 }))
                .rejects.toThrow(/от 0 до 100/);
        });
    });
});
