import { legalNameOf, preambleOf } from './company-legal-name';

/** Владелец, 31.10.2026: ИП «ERDEN» в договоре вышел «ТОО «ИП "ERDEN»». */
describe('Название стороны договора с формой', () => {
    it('ИП — индивидуальный предприниматель, кавычки целые', () => {
        expect(legalNameOf('ИП "ERDEN"')).toEqual({
            ip: true, clean: 'ERDEN',
            full: 'Индивидуальный предприниматель «ERDEN»', short: 'ИП «ERDEN»',
        });
    });

    it('ИП записан по-разному — узнаём всё', () => {
        for (const name of ['ИП ERDEN', 'ИП «ERDEN»', 'И.П. ERDEN', 'Индивидуальный предприниматель ERDEN', '«ИП ERDEN»', 'ип ERDEN']) {
            expect(legalNameOf(name).short).toBe('ИП «ERDEN»');
        }
    });

    it('ТОО — как было, без двойных кавычек', () => {
        expect(legalNameOf('ТОО «ЛогиКор Экспедиция»')).toMatchObject({
            ip: false, full: 'Товарищество с ограниченной ответственностью «ЛогиКор Экспедиция»', short: 'ТОО «ЛогиКор Экспедиция»',
        });
        expect(legalNameOf('Alfa Business Solutions').short).toBe('ТОО «Alfa Business Solutions»');
    });

    it('слово, начинающееся на «ИП», — не ИП', () => {
        expect(legalNameOf('Ипподром Сервис').ip).toBe(false);
        expect(legalNameOf('Ипподром Сервис').short).toBe('ТОО «Ипподром Сервис»');
    });
});

describe('Вступление договора — заготовка', () => {
    it('ИП и ТОО названы своей формой, «Стороны» — с пробелом после запятой', () => {
        const текст = preambleOf('ИП "ERDEN"', 'ТОО «Alfa Business Solutions»');
        expect(текст.startsWith('Индивидуальный предприниматель «ERDEN», именуемое в дальнейшем «Экспедитор»')).toBe(true);
        expect(текст).toContain('и Товарищество с ограниченной ответственностью «Alfa Business Solutions», именуемое в дальнейшем «Заказчик»');
        expect(текст).toContain('«Стороны», а по отдельности');
    });
});
