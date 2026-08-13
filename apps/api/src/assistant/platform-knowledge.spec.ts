import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
    DANGEROUS_ACTIONS,
    FULL_ACCESS_ROLES,
    PERMISSION_MANAGED_ROLES,
    PLATFORM_KNOWLEDGE,
    ROLE_ACCESS,
    describeUser,
} from './platform-knowledge';

/**
 * Знание гида о платформе не должно расходиться с самой платформой.
 *
 * У карты маршрутов такая проверка уже есть, и она однажды поймала гида,
 * который уверенно вёл людей на несуществующую страницу. Со знанием о
 * доступах цена ошибки выше: гид не просто заведёт не туда, а скажет
 * бухгалтеру «вам это открыто», бухгалтер упрётся в отказ и решит, что
 * сломалась платформа.
 *
 * Поэтому списки ролей здесь сверяются с настоящими правилами доступа в
 * `apps/web/src/lib/section-access.ts`, а названные опасные действия — с
 * тем, что сервер действительно умеет делать.
 */

const WEB_SRC = resolve(__dirname, '../../../web/src');
const SECTION_ACCESS = join(WEB_SRC, 'lib/section-access.ts');

/** Достать массив строк из объявления вида `const X = ['A', 'B'];`. */
function rolesFrom(source: string, name: string): string[] {
    const match = source.match(new RegExp(`const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`));
    if (!match) throw new Error(`не найдено объявление ${name}`);
    return Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

describe('Знание ИИ-гида о платформе', () => {
    const sectionAccess = readFileSync(SECTION_ACCESS, 'utf8');

    describe('доступы совпадают с настоящими', () => {
        it('роли с полным доступом — те же, что в правилах платформы', () => {
            expect([...FULL_ACCESS_ROLES].sort())
                .toEqual(rolesFrom(sectionAccess, 'FULL_ACCESS_ROLES').sort());
        });

        it('роли, которым разделы выдаются правами, — те же', () => {
            expect([...PERMISSION_MANAGED_ROLES].sort())
                .toEqual(rolesFrom(sectionAccess, 'PERMISSION_MANAGED_ROLES').sort());
        });

        it('разбор правил вообще сработал', () => {
            // Иначе пустые списки совпали бы с пустыми, и проверки выше
            // ничего бы не значили.
            expect(rolesFrom(sectionAccess, 'FULL_ACCESS_ROLES').length).toBeGreaterThan(1);
            expect(rolesFrom(sectionAccess, 'PERMISSION_MANAGED_ROLES').length).toBeGreaterThan(1);
        });

        it.each(['Сотрудники', 'Настройки компании', 'Журнал действий', 'Зарплата'])(
            'раздел «%s» назван закрытым по роли — и он действительно такой',
            (title) => {
                expect(ROLE_ACCESS).toContain(title);
                // В правилах платформы такой раздел закрыт пустым списком
                // ролей: право его не открывает.
                const line = sectionAccess.split('\n').find((row) => row.includes(`title: '${title}'`));
                expect(line).toBeDefined();
                expect(line).toContain('roles: []');
            },
        );

        it('«Автопарк» открыт логисту — так и написано', () => {
            const line = sectionAccess.split('\n').find((row) => row.includes("title: 'Автопарк'"));
            expect(line).toContain("roles: ['LOGISTICIAN']");
            expect(ROLE_ACCESS).toMatch(/Автопарк[^\n]*логист/);
        });
    });

    describe('кто спрашивает', () => {
        it('владельцу компании открыто всё', () => {
            expect(describeUser({ role: 'COMPANY_ADMIN' })).toContain('все разделы');
        });

        it('экспедитору тоже', () => {
            expect(describeUser({ role: 'FORWARDER' })).toContain('все разделы');
        });

        it('бухгалтеру перечисляются его разделы человеческими словами', () => {
            // «accounting» в ответе пользователю — это жаргон кода. Человек
            // ищет глазами то, что подписано в «Сотрудниках».
            const text = describeUser({ role: 'ACCOUNTANT', permissions: ['accounting', 'orders'] });

            expect(text).toContain('бухгалтер');
            expect(text).toContain('Бухгалтерия');
            expect(text).toContain('Заявки');
            expect(text).not.toContain('accounting');
        });

        it('бухгалтеру без прав сказано прямо, что разделов нет', () => {
            expect(describeUser({ role: 'ACCOUNTANT', permissions: [] }))
                .toContain('ни одного раздела не выдано');
        });

        it('гиду сказано, к кому идти за доступом', () => {
            // Иначе человек упирается в отказ и не знает, что делать дальше.
            expect(describeUser({ role: 'LOGISTICIAN', permissions: ['orders'] }))
                .toContain('Сотрудники');
        });

        it('водителя по кабинету не водят', () => {
            expect(describeUser({ role: 'DRIVER' })).toContain('Не веди его по разделам кабинета');
        });

        it('грузополучателя тоже', () => {
            expect(describeUser({ role: 'RECIPIENT' })).toContain('Не веди его по разделам кабинета');
        });

        it('без роли гид ничего не обещает', () => {
            expect(describeUser(undefined)).toContain('не обещай доступ');
            expect(describeUser({})).toContain('не обещай доступ');
        });

        it('незнакомая роль не выдаётся за полный доступ', () => {
            // Появится новая роль — гид не должен молча решить, что ей всё можно.
            expect(describeUser({ role: 'NEW_ROLE' })).not.toContain('все разделы');
        });
    });

    describe('опасные действия названы и объяснены', () => {
        it.each([
            ['Провести документ', /Провести документ.*учёт/],
            ['Отменить проведённый документ', /Отменить проведённый документ.*причин/],
            ['Отправить документ контрагенту', /Отправить документ контрагенту.*отозвать/],
            ['Отменить рейс', /Отменить рейс.*оплат/],
            ['Закрыть период', /Закрыть период.*не правятся/],
        ])('%s — с последствием, а не просто «нажмите»', (_name, pattern) => {
            expect(DANGEROUS_ACTIONS).toMatch(pattern);
        });

        it('гиду велено спросить подтверждение до опасного шага', () => {
            expect(PLATFORM_KNOWLEDGE).toMatch(/назови последствие.*спроси подтверждения/s);
        });
    });

    describe('границы того, что гид говорит', () => {
        it('запрещено называть суммы и номера по памяти', () => {
            // Данных у гида нет вовсе: любая названная цифра — выдумка,
            // а человек примет её за правду.
            expect(PLATFORM_KNOWLEDGE).toMatch(/Никогда не называй суммы/);
        });

        it('запрещено рассказывать о других компаниях', () => {
            expect(PLATFORM_KNOWLEDGE).toMatch(/о других компаниях/);
        });

        it('велено признавать незнание, а не выдумывать', () => {
            expect(PLATFORM_KNOWLEDGE).toMatch(/Выдуманный ответ дороже честного/);
        });

        it('запрещён жаргон разработчика', () => {
            expect(PLATFORM_KNOWLEDGE).toMatch(/эндпоинт/);
            expect(PLATFORM_KNOWLEDGE).toMatch(/простыми словами/);
        });
    });

    describe('знание собралось целиком', () => {
        it.each([
            'Что такое LogiCore',
            'Как идёт работа',
            'Что значат слова в интерфейсе',
            'Действия, у которых есть цена ошибки',
            'Кому какой раздел открыт',
            'Как себя вести',
        ])('в блоке есть раздел «%s»', (title) => {
            expect(PLATFORM_KNOWLEDGE).toContain(title);
        });

        it('блок не пустой и не обрезан', () => {
            expect(PLATFORM_KNOWLEDGE.length).toBeGreaterThan(3000);
        });
    });

    describe('гид умеет объяснить каждый крупный раздел', () => {
        /**
         * Знать дорогу и понимать раздел — разное. Карта маршрутов у гида
         * сверяется отдельным тестом, но она отвечает только на «куда нажать».
         * На «что это такое и зачем» отвечает знание, и оно отставало сильнее
         * карты: про запросы на расчёт, платёжный календарь, материалы и
         * первые шаги гид не мог сказать ничего и отделывался общими словами.
         *
         * Список — про разделы, у которых есть свой смысл, а не про справочники
         * вроде банков и форм оплаты: тем достаточно строки в карте.
         */
        it.each([
            ['Запросы на расчёт', /Запрос на расчёт\./],
            ['Калькулятор', /Калькулятор\./],
            ['Очередь на погрузку', /Очередь на погрузку\./],
            ['Платёжный календарь', /Платёжный календарь\./],
            ['Материалы', /Материалы\./],
            ['Нумерация документов', /Нумерация заявок и счетов\./],
            ['Первые шаги после регистрации', /Первые шаги\./],
            ['Тариф и подписка', /Тариф и подписка\./],
            ['Входящие документы', /Входящие документы\./],
            ['Взаиморасчёты и акт сверки', /Взаиморасчёты и акт сверки\./],
        ])('раздел «%s» объяснён по существу', (_name, pattern) => {
            expect(PLATFORM_KNOWLEDGE).toMatch(pattern);
        });
    });
});
