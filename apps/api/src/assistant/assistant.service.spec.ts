import * as fs from 'fs';
import * as path from 'path';
import { ROUTES, SELECTORS } from './assistant.service';

/**
 * Карта интерфейса для ИИ-гида задана строками в assistant.service.ts, а сам
 * интерфейс живёт в apps/web. Ничто их не связывает, поэтому карта тихо
 * расходится с приложением: на момент написания теста гид вёл пользователей
 * на несуществующую страницу /company/accounting и предлагал открыть меню
 * finance_group и transport_group, которых в навигации давно нет.
 *
 * Тест сверяет карту с реальными файлами веба. Он не проверяет формулировки —
 * только что каждый упомянутый адрес, пункт меню и якорь существуют.
 */

const WEB_SRC = path.resolve(__dirname, '../../../web/src');
const WEB_APP = path.join(WEB_SRC, 'app');
const COMPANY_LAYOUT = path.join(WEB_APP, 'company/layout.tsx');

/**
 * Экраны кабинета, которых в карте гида нет намеренно — с причиной.
 *
 * Проверка ниже идёт в обе стороны, и это главное в ней. Прежней хватало
 * только на то, чтобы гид не звал в несуществующий раздел; о новых разделах
 * он при этом мог не знать годами. Так и вышло: за время работы появились
 * запросы на расчёт, входящие документы, платёжный календарь, материалы и
 * полтора десятка справочников — гид не знал ни про один и на вопрос о них
 * отвечал общими словами.
 *
 * Теперь новый экран роняет тест, пока его либо не опишут в карте, либо не
 * впишут сюда с объяснением, почему вести туда человека не надо.
 */
const NOT_IN_MAP: Record<string, string> = {
    '/company/search': 'поиск живёт окном в шапке, отдельная страница ниоткуда не открывается',
    '/company/drivers': 'страница осталась от старой навигации; водители теперь вкладка в «Сотрудниках»',
    '/company/carriers': 'страница осталась от старой навигации; перевозчики ведутся в «Контрагентах»',
};

/** Существует ли страница Next.js по такому маршруту. */
function pageExists(route: string): boolean {
    const segments = route.replace(/^\//, '').split('/');
    return fs.existsSync(path.join(WEB_APP, ...segments, 'page.tsx'));
}

/** Все страницы кабинета, какие есть в приложении на самом деле. */
function cabinetPages(dir = path.join(WEB_APP, 'company'), acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) cabinetPages(full, acc);
        else if (entry.name === 'page.tsx') {
            acc.push('/' + path.relative(WEB_APP, dir).split(path.sep).join('/'));
        }
    }
    return acc;
}

/** Все файлы .tsx веба — для поиска якорей data-guide. */
function allWebSources(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) allWebSources(full, acc);
        else if (entry.name.endsWith('.tsx')) acc.push(full);
    }
    return acc;
}

describe('карта интерфейса ИИ-гида не разошлась с приложением', () => {
    const routes = Array.from(ROUTES.matchAll(/^- (\/[^\s—]+)/gm)).map((m) => m[1]);
    const menuKeys = Array.from(SELECTORS.matchAll(/data-menu-id\$='-([^']+)'/g)).map((m) => m[1]);
    const guideAnchors = Array.from(SELECTORS.matchAll(/data-guide='([^']+)'/g)).map((m) => m[1]);

    it('карта вообще разобралась (иначе тест бесполезен)', () => {
        expect(routes.length).toBeGreaterThan(10);
        expect(menuKeys.length).toBeGreaterThan(3);
        expect(guideAnchors.length).toBeGreaterThan(1);
    });

    it.each(routes)('страница %s существует', (route) => {
        expect(pageExists(route)).toBe(true);
    });

    it.each(menuKeys)('пункт меню %s есть в навигации кабинета', (key) => {
        const layout = fs.readFileSync(COMPANY_LAYOUT, 'utf8');
        expect(layout).toContain(`key: '${key}'`);
    });

    // Якоря живут и в страницах (app/), и в общих компонентах шапки
    // (components/), поэтому ищем по всему исходнику веба.
    //
    // Часть якорей не написана буквой, а собирается из ключа: вкладки получают
    // `tab-${ключ}` в одном общем компоненте, строки отметки об оригиналах —
    // `originals-${сторона}`. Искать такие простым поиском по строке нельзя,
    // поэтому для них проверяется и шаблон в компоненте, и что ключ, из
    // которого якорь собирается, действительно существует.
    const COMPUTED: Record<string, { file: string; pattern: string; keyOwner: string }> = {
        'tab-': {
            file: 'components/ui/PillTabs.tsx',
            pattern: 'data-guide={`tab-',
            keyOwner: 'app/company/orders/[id]/page.tsx',
        },
        'originals-': {
            file: 'components/orders/OrderOriginalsCard.tsx',
            pattern: 'data-guide={`originals-',
            keyOwner: 'components/orders/OrderOriginalsCard.tsx',
        },
    };

    it.each(guideAnchors)('якорь data-guide="%s" есть в разметке', (anchor) => {
        const prefix = Object.keys(COMPUTED).find((p) => anchor.startsWith(p));

        if (prefix) {
            const { file, pattern, keyOwner } = COMPUTED[prefix];
            expect(fs.readFileSync(path.join(WEB_SRC, file), 'utf8')).toContain(pattern);
            // Ключ, из которого собирается якорь, должен быть настоящим:
            // иначе гид уверенно подсветит вкладку, которой нет.
            const key = anchor.slice(prefix.length);
            expect(fs.readFileSync(path.join(WEB_SRC, keyOwner), 'utf8')).toContain(`'${key}'`);
            return;
        }

        const found = allWebSources(WEB_SRC).some((file) =>
            fs.readFileSync(file, 'utf8').includes(`data-guide="${anchor}"`),
        );
        expect(found).toBe(true);
    });

    // Гид обещает пользователю кликнуть по пункту меню, поэтому каждый
    // селектор из карты должен вести на реально существующий пункт, а не на
    // произвольную строку.
    it('в карте не осталось выпадающих меню, кроме «Мониторинга»', () => {
        const groups = menuKeys.filter((k) => k.endsWith('_group'));
        expect(groups).toEqual(['monitoring_group']);
    });

    it('гид знает про каждый экран кабинета', () => {
        // Страницы с [id] в адресе пропускаем: это карточки, куда переходят
        // из списка, а не пункты навигации.
        const pages = cabinetPages().filter((route) => !route.includes('['));
        const mapped = new Set(routes);
        const forgotten = pages.filter((route) => !mapped.has(route) && !NOT_IN_MAP[route]);

        expect(forgotten).toEqual([]);
    });

    it('у каждого исключения названа причина', () => {
        expect(Object.entries(NOT_IN_MAP).filter(([, why]) => !why.trim())).toEqual([]);
    });

    it('в исключениях нет исчезнувших страниц', () => {
        // Иначе список превращается в кладбище, и завтра непонятно, почему
        // раздела нет в карте — его убрали или про него забыли.
        const pages = new Set(cabinetPages());
        expect(Object.keys(NOT_IN_MAP).filter((route) => !pages.has(route))).toEqual([]);
    });

    it('меню в карте названо теми же словами, что на экране', () => {
        // Гид говорил «нажмите Финансы», когда кнопка называлась «Деньги».
        // Человек ищет её глазами и не находит.
        const layout = fs.readFileSync(COMPANY_LAYOUT, 'utf8');
        const labels: Record<string, string> = {
            '/company/orders': 'Заявки',
            '/company/requests': 'Запросы',
            '/company/finance': 'Деньги',
            '/company/reports': 'Отчёты',
            '/company/cabinet': 'Кабинет',
            '/company/tracking': 'Карта и GPS',
        };
        for (const [key, label] of Object.entries(labels)) {
            // Название всё ещё то же самое в разметке кабинета…
            expect(layout).toContain(`label: '${label}'`);
            // …и карта гида зовёт человека именно этим словом.
            expect(SELECTORS).toContain(`«${label}»`);
            expect(SELECTORS).toContain(`-${key}'`);
        }
    });
});
