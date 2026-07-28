import { buildSupportTicketMessage } from './support-ticket-message';

/**
 * Смысл этих проверок — сообщение должно быть самодостаточным.
 * Владелец пересылает его разработчику как есть, и если в тексте не хватает
 * компании, человека или заявки, придётся идти в админку — ровно то, от чего
 * уходили.
 */
describe('Сообщение об обращении для телеграма', () => {
    const базовое = {
        id: 'tкт_1',
        title: 'Не сохраняется расход по заявке',
        category: 'finance',
        severity: 'high',
        companyName: 'ТОО «Магнум Дистрибуция»',
        userName: 'Ахметова Гульнара',
        userEmail: 'buh@magnum.kz',
        description: 'Выбираю статью ГСМ, поле «Заявка» пустое, сохранить нельзя.',
        orders: ['ЗК-2604', 'ЗК-2605'],
        details: {
            where: 'Финансы → Расходы',
            process: 'Открыла расходы, нажала «Добавить расход».',
            expected: 'В списке будут мои заявки.',
            actual: 'Список пустой.',
        },
    };

    it('содержит всё, что нужно для починки', () => {
        const text = buildSupportTicketMessage(базовое);

        expect(text).toContain('Не сохраняется расход по заявке');
        expect(text).toContain('ТОО «Магнум Дистрибуция»');
        expect(text).toContain('Ахметова Гульнара');
        expect(text).toContain('buh@magnum.kz');
        expect(text).toContain('ЗК-2604, ЗК-2605');
        expect(text).toContain('Финансы → Расходы');
        expect(text).toContain('Список пустой.');
        expect(text).toContain('tкт_1');
    });

    it('переводит категорию и срочность на человеческий', () => {
        const text = buildSupportTicketMessage(базовое);
        expect(text).toContain('Финансы');
        expect(text).toContain('срочность высокая');
        expect(text).not.toContain('finance');
        expect(text).not.toContain('high');
    });

    it('не разваливается, когда подробностей нет', () => {
        const text = buildSupportTicketMessage({
            id: 'tкт_2',
            title: 'Кнопка не нажимается',
            category: 'other',
            severity: 'low',
            companyName: 'ИП Сериков',
            userName: 'Сериков С.',
            description: 'Не нажимается.',
        });

        expect(text).toContain('Кнопка не нажимается');
        expect(text).toContain('tкт_2');
        expect(text).not.toContain('Где:');
        expect(text).not.toContain('Заявки:');
        // Пустых скобок от отсутствующей почты быть не должно.
        expect(text).not.toContain('()');
    });

    it('не содержит разметки: её сломал бы текст самого человека', () => {
        const text = buildSupportTicketMessage({
            ...базовое,
            description: 'Сумма *не* та, и _поле_ пустое [см. скрин]',
        });

        expect(text).toContain('Сумма *не* та, и _поле_ пустое [см. скрин]');
    });
});
