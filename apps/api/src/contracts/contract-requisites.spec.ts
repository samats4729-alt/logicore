import {
    companyRequisitesText,
    findRequisitesArticle,
    getDefaultContractTemplate,
    type ContractArticle,
} from './contract-template';

/**
 * Реквизиты сторон в договоре.
 *
 * До этого реквизиты вписывали в обычный пункт — одно поле на обе стороны, —
 * и в готовом договоре было не разобрать, где кончается экспедитор и
 * начинается заказчик. Теперь у статьи есть две колонки, и здесь
 * проверяется то, на чём такая пара ломается: что старые договоры без
 * колонок остались рабочими, а таблица не печатается дважды.
 */

describe('реквизиты сторон в договоре', () => {
    describe('поиск своей статьи с реквизитами', () => {
        it('в шаблоне по умолчанию своих реквизитов нет', () => {
            // Раздел 15 собирается из карточек компаний — в тексте его быть
            // не должно, иначе он напечатается дважды.
            expect(findRequisitesArticle(getDefaultContractTemplate())).toBeUndefined();
        });

        it('находит статью с заполненными колонками', () => {
            const статьи: ContractArticle[] = [
                { title: '1. Предмет', paragraphs: [{ number: '1.1.', text: 'текст' }] },
                {
                    title: '15. Реквизиты',
                    paragraphs: [],
                    requisites: { left: 'ТОО «Экспедитор»', right: 'ТОО «Заказчик»' },
                },
            ];

            expect(findRequisitesArticle(статьи)?.title).toBe('15. Реквизиты');
        });

        it('пустые колонки за реквизиты не считаются', () => {
            // Иначе добавленный и брошенный пустым блок отменил бы
            // автоматический раздел, и договор ушёл бы вовсе без реквизитов.
            const статьи: ContractArticle[] = [
                { title: '15. Реквизиты', paragraphs: [], requisites: { left: '   ', right: '' } },
            ];

            expect(findRequisitesArticle(статьи)).toBeUndefined();
        });

        it('одной заполненной колонки достаточно', () => {
            const статьи: ContractArticle[] = [
                { title: '15. Реквизиты', paragraphs: [], requisites: { left: 'ТОО «Экспедитор»', right: '' } },
            ];

            expect(findRequisitesArticle(статьи)).toBeDefined();
        });

        it('не спотыкается о статью без пунктов и без реквизитов', () => {
            expect(findRequisitesArticle([{ title: 'Пустая', paragraphs: [] }])).toBeUndefined();
        });
    });

    describe('заготовка реквизитов из карточки компании', () => {
        const КОМПАНИЯ = {
            name: 'ТОО «Ромашка»',
            address: 'г. Алматы, ул. Абая 1',
            actualAddress: null,
            bin: '123456789012',
            bankAccount: 'KZ1234567890',
            bankName: 'Народный банк',
            bankBic: 'HSBKKZKX',
            kbe: '17',
            phone: '+7 777 000 00 00',
            email: 'info@romashka.kz',
            directorName: 'Иванов И.И.',
        };

        it('собирает построчно, названием первой строкой', () => {
            const текст = companyRequisitesText(КОМПАНИЯ);
            const строки = текст.split('\n');

            expect(строки[0]).toBe('ТОО «Ромашка»');
            expect(текст).toContain('БИН/ИИН: 123456789012');
            expect(текст).toContain('Директор: Иванов И.И.');
        });

        it('пустые поля пропускает, а не печатает подписью без значения', () => {
            // «Факт. адрес:» без адреса выглядит как недоделка, а не как
            // пустое место в бланке.
            const текст = companyRequisitesText(КОМПАНИЯ);

            expect(текст).not.toContain('Факт. адрес');
        });

        it('у компании без реквизитов возвращает пустоту, а не строку из двоеточий', () => {
            expect(companyRequisitesText({})).toBe('');
        });

        it('порядок строк тот же, что в бумажном договоре', () => {
            const строки = companyRequisitesText(КОМПАНИЯ).split('\n');

            expect(строки.indexOf('Юр. адрес: г. Алматы, ул. Абая 1'))
                .toBeLessThan(строки.indexOf('БИН/ИИН: 123456789012'));
            expect(строки.indexOf('БИН/ИИН: 123456789012'))
                .toBeLessThan(строки.indexOf('Банк: Народный банк'));
        });
    });
});
