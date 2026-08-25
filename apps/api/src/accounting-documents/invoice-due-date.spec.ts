import { invoiceDueDate } from './invoice-due-date';

/**
 * Правило одно: срок оплаты счёта берётся из отсрочки, о которой
 * договорились в рейсе. Проверяется здесь то, на чём оно ломается молча —
 * несколько рейсов в одном счёте, ненаступившее событие отсчёта и рейсы без
 * условий вовсе.
 *
 * Молча — потому что неверная дата не выглядит поломкой: счёт печатается,
 * уходит контрагенту и живёт в платёжном календаре не тем днём.
 */

const день = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const дата = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const СЧЁТ = день('2026-08-20');

describe('Срок оплаты счёта', () => {
    describe('одна заявка', () => {
        it('«10 дней от даты счёта» отсчитывается от самого счёта', () => {
            const { dueDate } = invoiceDueDate(СЧЁТ, [{ days: 10, from: 'INVOICE' }]);
            expect(дата(dueDate)).toBe('2026-08-30');
        });

        it('«15 дней от выгрузки» отсчитывается от выгрузки, а не от счёта', () => {
            const { dueDate } = invoiceDueDate(СЧЁТ, [
                { days: 15, from: 'UNLOAD', unloadAt: день('2026-08-10') },
            ]);
            expect(дата(dueDate)).toBe('2026-08-25');
        });

        it('«30 дней от оригиналов» отсчитывается от дня, когда они дошли', () => {
            const { dueDate } = invoiceDueDate(СЧЁТ, [
                { days: 30, from: 'ORIGINALS', originalsAt: день('2026-08-14') },
            ]);
            expect(дата(dueDate)).toBe('2026-09-13');
        });

        it('«оплата по факту» — ноль дней, а не отсутствие срока', () => {
            const { dueDate } = invoiceDueDate(СЧЁТ, [
                { days: 0, from: 'UNLOAD', unloadAt: день('2026-08-10') },
            ]);
            expect(дата(dueDate)).toBe('2026-08-10');
        });

        it('час выгрузки на день оплаты не влияет', () => {
            // Выгрузка — момент времени, срок оплаты — день. Без приведения
            // к суткам «выгрузка в 14:00 плюс ноль дней» давала бы срок,
            // зависящий от часа, и два одинаковых рейса расходились бы.
            const { dueDate } = invoiceDueDate(СЧЁТ, [
                { days: 5, from: 'UNLOAD', unloadAt: new Date('2026-08-10T14:30:00.000Z') },
            ]);
            expect(дата(dueDate)).toBe('2026-08-15');
        });

        it('дата счёта строкой понимается так же, как датой', () => {
            const { dueDate } = invoiceDueDate('2026-08-20', [{ days: 10, from: 'INVOICE' }]);
            expect(дата(dueDate)).toBe('2026-08-30');
        });
    });

    describe('несколько заявок в одном счёте', () => {
        it('берётся самый поздний срок — раньше времени требовать нельзя', () => {
            // По одному рейсу договорились на 10 дней, по другому на 30.
            // Счёт один, и потребовать по нему деньги через 10 дней значит
            // нарушить договорённость по второму рейсу.
            const { dueDate } = invoiceDueDate(СЧЁТ, [
                { days: 10, from: 'INVOICE' },
                { days: 30, from: 'INVOICE' },
            ]);
            expect(дата(dueDate)).toBe('2026-09-19');
        });

        it('порядок заявок ничего не меняет', () => {
            const прямо = invoiceDueDate(СЧЁТ, [
                { days: 30, from: 'INVOICE' },
                { days: 10, from: 'INVOICE' },
            ]);
            expect(дата(прямо.dueDate)).toBe('2026-09-19');
        });

        it('разные точки отсчёта сравниваются по итоговой дате, а не по числу дней', () => {
            // 30 дней от давней выгрузки истекают РАНЬШЕ, чем 10 дней от
            // сегодняшнего счёта. Сравнивать надо даты, а не отсрочки.
            const { dueDate } = invoiceDueDate(СЧЁТ, [
                { days: 30, from: 'UNLOAD', unloadAt: день('2026-07-01') },
                { days: 10, from: 'INVOICE' },
            ]);
            expect(дата(dueDate)).toBe('2026-08-30');
        });
    });

    describe('когда посчитать нельзя', () => {
        it('без заявок срока нет и объяснять нечего', () => {
            expect(invoiceDueDate(СЧЁТ, [])).toEqual({ dueDate: null, dependsOn: null });
        });

        it('рейс без отсрочки оставляет графу пустой и говорит почему', () => {
            const итог = invoiceDueDate(СЧЁТ, [{ days: null, from: null }]);
            expect(итог.dueDate).toBeNull();
            expect(итог.dependsOn).toContain('не задана отсрочка');
        });

        it('точка отсчёта без числа дней — тоже неполные условия', () => {
            expect(invoiceDueDate(СЧЁТ, [{ days: null, from: 'UNLOAD' }]).dueDate).toBeNull();
        });

        it('непонятная точка отсчёта не выдаёт дату наугад', () => {
            expect(invoiceDueDate(СЧЁТ, [{ days: 10, from: 'КОГДА-НИБУДЬ' }]).dueDate).toBeNull();
        });

        it('оригиналы ещё не пришли — говорим, чего ждём', () => {
            const итог = invoiceDueDate(СЧЁТ, [{ days: 30, from: 'ORIGINALS', originalsAt: null }]);
            expect(итог.dueDate).toBeNull();
            expect(итог.dependsOn).toContain('оригиналы');
        });

        it('нет даты выгрузки — говорим и это', () => {
            const итог = invoiceDueDate(СЧЁТ, [{ days: 15, from: 'UNLOAD', unloadAt: null }]);
            expect(итог.dueDate).toBeNull();
            expect(итог.dependsOn).toContain('выгрузки');
        });

        it('один непосчитанный рейс оставляет без срока весь счёт', () => {
            // Иначе счёт потребовал бы оплату по сроку соседнего рейса —
            // раньше, чем договорились по этому.
            const итог = invoiceDueDate(СЧЁТ, [
                { days: 10, from: 'INVOICE' },
                { days: 30, from: 'ORIGINALS', originalsAt: null },
            ]);
            expect(итог.dueDate).toBeNull();
            expect(итог.dependsOn).toContain('оригиналы');
        });

        it('без даты счёта отсрочка «от даты счёта» не считается', () => {
            expect(invoiceDueDate(null, [{ days: 10, from: 'INVOICE' }]).dueDate).toBeNull();
        });

        it('отрицательная отсрочка не принимается — это опечатка, а не условие', () => {
            expect(invoiceDueDate(СЧЁТ, [{ days: -5, from: 'INVOICE' }]).dueDate).toBeNull();
        });
    });
});
