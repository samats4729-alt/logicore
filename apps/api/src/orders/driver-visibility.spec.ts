import { maskForDriver } from './order-visibility';

/**
 * Что водителю видно в рейсе.
 *
 * Правило «водитель не видит цену заказчика» в проекте было, но работало
 * только в списке его рейсов. Карточка отдавала всё: и цену заказчика, и
 * ставку перевозчика — то есть заработок компании на этом рейсе целиком.
 * Сверх того, открыть можно было любой рейс фирмы, а не только свой:
 * общая проверка «рейс нашей компании» считала водителя таким же
 * сотрудником, как логиста.
 *
 * Проверено на стенде до починки: водитель открыл ЗК-2601, к которому не
 * назначен, и увидел 480 000 у заказчика и 390 000 у перевозчика.
 *
 * Водитель — самая слабая учётная запись из тех, у кого есть вход: он
 * часто наёмный и меняется чаще всех.
 */
describe('Видимость рейса для водителя', () => {
    const рейс = () => ({
        orderNumber: 'ЗК-2601',
        customerPrice: 480_000,
        driverCost: 120_000,
        subForwarderPrice: 390_000,
        subForwarderId: 'перевозчик',
        subForwarder: { name: 'ТОО «Алтын Жол»' },
        partner: { name: 'ТОО «Партнёр»' },
        partnerId: 'партнёр',
        isSubForwarderPaid: true,
        subForwarderPaidAt: new Date('2026-08-10'),
        hasVat: true,
        vatRate: 12,
        executorHasVat: true,
        executorVatRate: 12,
        customerPaymentDays: 30,
        customerPaymentFrom: 'ORIGINALS',
        carrierPaymentDays: 15,
        carrierPaymentFrom: 'UNLOADING',
    });

    it('цена заказчика водителю не видна', async () => {
        expect(maskForDriver(рейс()).customerPrice).toBeNull();
    });

    it('ставка перевозчика и он сам — тоже', async () => {
        // Разница между ней и оплатой водителя — чей-то заработок.
        const скрытый = maskForDriver(рейс());

        expect(скрытый.subForwarderPrice).toBeNull();
        expect(скрытый.subForwarderId).toBeNull();
        expect(скрытый.subForwarder).toBeNull();
        expect(скрытый.partner).toBeNull();
        expect(JSON.stringify(скрытый)).not.toContain('Алтын');
    });

    it('своя оплата остаётся: за неё он и работает', async () => {
        expect(maskForDriver(рейс()).driverCost).toBe(120_000);
    });

    it('условия расчётов сторон скрыты', async () => {
        // По отсрочке и НДС видно, как устроена сделка между компаниями.
        const скрытый = maskForDriver(рейс());

        expect(скрытый.vatRate).toBeNull();
        expect(скрытый.executorVatRate).toBeNull();
        expect(скрытый.customerPaymentDays).toBeNull();
        expect(скрытый.carrierPaymentDays).toBeNull();
    });

    it('отметка «перевозчику оплачено» не проговаривается', async () => {
        const скрытый = maskForDriver(рейс());

        expect(скрытый.isSubForwarderPaid).toBe(false);
        expect(скрытый.subForwarderPaidAt).toBeNull();
    });
});
