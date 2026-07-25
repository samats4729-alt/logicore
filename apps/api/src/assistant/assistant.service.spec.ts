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

/** Существует ли страница Next.js по такому маршруту. */
function pageExists(route: string): boolean {
    const segments = route.replace(/^\//, '').split('/');
    return fs.existsSync(path.join(WEB_APP, ...segments, 'page.tsx'));
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
    it.each(guideAnchors)('якорь data-guide="%s" есть в разметке', (anchor) => {
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
});
