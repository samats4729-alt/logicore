import { readFileSync } from 'fs';
import { join } from 'path';
import { canTouchAccounting, ACCOUNTING_ORDER_FIELDS } from '../auth/accounting-access';

/**
 * Кто правит ставку в рейсе.
 *
 * Правило разъехалось на две половины, и обе были неверны. Экран решал по
 * роли: менеджеру, которому руководитель выдал право «Бухгалтерия», поля
 * ставки горели серым, экспедитору — тоже, хотя сервер правку от обоих
 * принимал. Бухгалтеру, наоборот, экран поля открывал, а сервер отвечал
 * отказом: его роли не было в списке общей правки рейса, а ставка идёт
 * именно ею.
 *
 * Итог для человека: он видел ошибку в сумме, которую сам же и вписал, и
 * починить её не мог — без единого слова, почему.
 *
 * Теперь правило одно и на обеих сторонах: правит тот, у кого право
 * «Бухгалтерия». У руководителя, экспедитора и нашего администратора оно
 * есть всегда — это их компания.
 */

const РОЛИ_ОБЩЕЙ_ПРАВКИ = readFileSync(
    join(__dirname, 'orders.controller.ts'),
    'utf8',
);

describe('Правка ставки в рейсе', () => {
    describe('право решает, а не роль', () => {
        it('менеджеру с «Бухгалтерией» — можно', () => {
            expect(canTouchAccounting({ role: 'LOGISTICIAN', permissions: ['orders', 'accounting'] })).toBe(true);
        });

        it('менеджеру без неё — нельзя', () => {
            // Он ведёт маршрут, груз и сроки; ставка — не его ответственность.
            expect(canTouchAccounting({ role: 'LOGISTICIAN', permissions: ['orders'] })).toBe(false);
        });

        it('бухгалтеру — можно', () => {
            expect(canTouchAccounting({ role: 'ACCOUNTANT', permissions: ['accounting'] })).toBe(true);
        });

        it('руководителю, экспедитору и администратору — всегда', () => {
            // Права им не настраивают: компания их.
            for (const роль of ['COMPANY_ADMIN', 'FORWARDER', 'ADMIN']) {
                expect(canTouchAccounting({ role: роль, permissions: [] })).toBe(true);
            }
        });
    });

    describe('сервер принимает правку от тех же людей', () => {
        /**
         * Ставка идёт общей правкой рейса — `PUT /orders/:id`. Пропадёт из
         * списка бухгалтер, и на экране всё откроется, а сохранение ответит
         * отказом: ровно та поломка, ради которой этот тест и написан.
         */
        it('бухгалтер в списке ролей общей правки рейса', () => {
            const кусок = РОЛИ_ОБЩЕЙ_ПРАВКИ.slice(
                РОЛИ_ОБЩЕЙ_ПРАВКИ.indexOf("@Put(':id')"),
                РОЛИ_ОБЩЕЙ_ПРАВКИ.indexOf("async update("),
            );
            for (const роль of ['ACCOUNTANT', 'LOGISTICIAN', 'FORWARDER', 'COMPANY_ADMIN', 'ADMIN']) {
                expect(кусок).toContain(`UserRole.${роль}`);
            }
        });
    });

    describe('что этим путём по-прежнему не проходит', () => {
        it('НДС и сроки оплаты остаются отдельным правом', () => {
            // Они уезжают в договор с печатью, и менять их «заодно с рейсом»
            // нельзя: раньше «НДС» стоял в общей форме со снятой галочкой и
            // так и уходил контрагенту.
            expect([...ACCOUNTING_ORDER_FIELDS]).toEqual(expect.arrayContaining([
                'hasVat', 'vatRate', 'customerPaymentDays', 'carrierPaymentDays',
            ]));
        });

        it('сами ставки в этот список не входят — иначе их не поправить вовсе', () => {
            expect([...ACCOUNTING_ORDER_FIELDS]).not.toContain('customerPrice');
            expect([...ACCOUNTING_ORDER_FIELDS]).not.toContain('driverCost');
        });
    });
});
