import { сВключениемОтдела } from './effective-permissions';
import { canTouchAccounting } from './accounting-access';
import { MODULE_PERMISSIONS } from './module-permissions';

/**
 * Права отдела.
 *
 * Права были только личные, и «открыть финотделу согласование счетов»
 * означало обойти галочками всех поимённо. Нового человека при этом
 * вспоминали через неделю — когда он говорил, что кнопки нет.
 *
 * Теперь права есть и у отдела. Они складываются с личными: отдел задаёт
 * общее, человеку можно добавить сверху. Отнять личной галочкой то, что дал
 * отдел, нельзя — иначе на вопрос «есть ли у него право» было бы два
 * ответа, и оба верные.
 */

describe('Права отдела складываются с личными', () => {
    it('право отдела есть у человека, которому лично его не выдавали', () => {
        const права = сВключениемОтдела([], { permissions: ['invoice_approval'] });
        expect(права).toEqual(['invoice_approval']);
    });

    it('личные права остаются', () => {
        const права = сВключениемОтдела(['orders'], { permissions: ['invoice_approval'] });
        expect(права).toEqual(expect.arrayContaining(['orders', 'invoice_approval']));
    });

    it('одно и то же право не задваивается', () => {
        const права = сВключениемОтдела(['accounting'], { permissions: ['accounting'] });
        expect(права).toEqual(['accounting']);
    });

    it('без отдела остаются только личные', () => {
        expect(сВключениемОтдела(['orders'], null)).toEqual(['orders']);
        expect(сВключениемОтдела(['orders'], { permissions: null })).toEqual(['orders']);
    });

    it('пустой отдел ничего не даёт — в день обновления ни у кого ничего не меняется', () => {
        expect(сВключениемОтдела(['orders'], { permissions: [] })).toEqual(['orders']);
    });

    it('человек без прав вовсе — тоже работает', () => {
        expect(сВключениемОтдела(null, { permissions: ['reports'] })).toEqual(['reports']);
    });

    describe('право отдела работает так же, как личное', () => {
        it('«Бухгалтерия» от отдела открывает ставку в рейсе', () => {
            // Ровно ради этого всё и делается: проверки прав спрашивают один
            // список, и им всё равно, откуда право пришло.
            const человек = {
                role: 'LOGISTICIAN',
                permissions: сВключениемОтдела([], { permissions: ['accounting'] }),
            };
            expect(canTouchAccounting(человек)).toBe(true);
        });

        it('без права — по-прежнему нельзя', () => {
            const человек = {
                role: 'LOGISTICIAN',
                permissions: сВключениемОтдела(['orders'], { permissions: ['reports'] }),
            };
            expect(canTouchAccounting(человек)).toBe(false);
        });
    });

    it('отделу выдаются те же права, что и сотруднику — список один', () => {
        // Разойдись списки, и отделу можно было бы выдать право, которого не
        // существует, либо наоборот — не выдать нужное.
        expect([...MODULE_PERMISSIONS]).toEqual(expect.arrayContaining([
            'orders', 'accounting', 'reports', 'invoice_approval',
        ]));
    });
});
