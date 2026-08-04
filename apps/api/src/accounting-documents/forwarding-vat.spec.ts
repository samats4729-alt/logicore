import { Prisma } from '@prisma/client';
import { ForwardingSplitError, splitForwardingAmount } from './forwarding-vat';

/**
 * НДС с вознаграждения экспедитора.
 *
 * Проверяется главное: итог счёта не меняется, а налогом облагается только
 * вознаграждение. Если ошибиться в любую сторону, цена ошибки — реальные
 * деньги: на одном рейсе разница в НДС доходит до семидесяти тысяч тенге.
 */
describe('НДС с вознаграждения экспедитора', () => {
    const D = (v: string | number) => new Prisma.Decimal(v);
    const num = (v: Prisma.Decimal) => Number(v);

    describe('обычный рейс', () => {
        it('счёт делится на возмещение и вознаграждение', () => {
            // Клиенту 670 000, перевозчику 537 348.
            const split = splitForwardingAmount({
                customerAmount: D('670000'), carrierCost: D('537348'), vatRate: D('16'),
            });

            expect(num(split.passThrough)).toBe(537348);
            expect(num(split.remuneration)).toBe(132652);
        });

        it('НДС берётся только с вознаграждения, а не со всей суммы', () => {
            const split = splitForwardingAmount({
                customerAmount: D('670000'), carrierCost: D('537348'), vatRate: D('16'),
            });

            // 132 652 × 16 / 116 = 18 296,83
            expect(num(split.vat)).toBeCloseTo(18296.83, 2);
            // Для сравнения: со всей суммы вышло бы 92 413,79 — впятеро больше.
            expect(num(split.vat)).toBeLessThan(20000);
        });

        it('итог счёта не меняется — клиент платит ту же сумму', () => {
            // Схема меняет налог, а не цену. Если итог поедет, клиент получит
            // счёт не на ту сумму, о которой договорились.
            const split = splitForwardingAmount({
                customerAmount: D('670000'), carrierCost: D('537348'), vatRate: D('16'),
            });

            expect(num(split.total)).toBe(670000);
        });

        it('НДС сидит внутри вознаграждения, а не сверху него', () => {
            const split = splitForwardingAmount({
                customerAmount: D('670000'), carrierCost: D('537348'), vatRate: D('16'),
            });

            expect(num(split.vat)).toBeLessThan(num(split.remuneration));
        });
    });

    describe('без перевозчика', () => {
        it('везём сами — вознаграждением становится вся сумма', () => {
            // Расходов на стороннего перевозчика нет, возмещать нечего:
            // весь оборот наш и весь облагается.
            const split = splitForwardingAmount({
                customerAmount: D('500000'), carrierCost: null, vatRate: D('16'),
            });

            expect(num(split.passThrough)).toBe(0);
            expect(num(split.remuneration)).toBe(500000);
            expect(num(split.vat)).toBeCloseTo(68965.52, 2);
        });
    });

    describe('когда делить нельзя', () => {
        it('ставка перевозчика равна сумме клиента — отказ, а не нулевое вознаграждение', () => {
            // Молча выставить ноль значило бы спрятать либо ошибку в ставках,
            // либо рейс в убыток. Решать должен человек.
            expect(() => splitForwardingAmount({
                customerAmount: D('500000'), carrierCost: D('500000'), vatRate: D('16'),
            })).toThrow(ForwardingSplitError);
        });

        it('перевозчик дороже клиента — тоже отказ', () => {
            expect(() => splitForwardingAmount({
                customerAmount: D('500000'), carrierCost: D('600000'), vatRate: D('16'),
            })).toThrow(ForwardingSplitError);
        });

        it('в отказе названы обе суммы, чтобы было видно, где ошибка', () => {
            expect(() => splitForwardingAmount({
                customerAmount: D('500000'), carrierCost: D('600000'), vatRate: D('16'),
            })).toThrow(/600000\.00.*500000\.00/);
        });

        it('пустая сумма по рейсу — делить нечего', () => {
            expect(() => splitForwardingAmount({
                customerAmount: D('0'), carrierCost: D('0'), vatRate: D('16'),
            })).toThrow(/не заполнена/);
        });

        it('отрицательная ставка перевозчика не принимается', () => {
            expect(() => splitForwardingAmount({
                customerAmount: D('500000'), carrierCost: D('-100'), vatRate: D('16'),
            })).toThrow(/отрицательной/);
        });
    });

    describe('ставка НДС', () => {
        it('компания без НДС — вознаграждение есть, налога нет', () => {
            const split = splitForwardingAmount({
                customerAmount: D('670000'), carrierCost: D('537348'), vatRate: D('0'),
            });

            expect(num(split.remuneration)).toBe(132652);
            expect(num(split.vat)).toBe(0);
        });

        it('старая ставка 12% считается по своей формуле', () => {
            // Документы прошлых лет обязаны оставаться со своей ставкой.
            const split = splitForwardingAmount({
                customerAmount: D('670000'), carrierCost: D('537348'), vatRate: D('12'),
            });

            // 132 652 × 12 / 112 = 14 212,71
            expect(num(split.vat)).toBeCloseTo(14212.71, 2);
        });
    });

    describe('копейки', () => {
        it('части в сумме дают ровно итог', () => {
            const split = splitForwardingAmount({
                customerAmount: D('333333.33'), carrierCost: D('111111.11'), vatRate: D('16'),
            });

            expect(num(split.passThrough) + num(split.remuneration)).toBeCloseTo(333333.33, 2);
            expect(num(split.total)).toBeCloseTo(333333.33, 2);
        });
    });
});
