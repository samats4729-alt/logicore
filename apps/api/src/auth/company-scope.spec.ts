import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

/**
 * Перепись маршрутов, открытых человеку без организации.
 *
 * `JwtAuthGuard` не пускает в разделы того, кто зарегистрировался, но
 * организацию ещё не подключил. Причина простая: роль `COMPANY_ADMIN`
 * выдаётся сразу при регистрации, а `companyId` остаётся пустым, и пустая
 * компания дальше по коду означала «отбирать не по чему» — то есть ровно то
 * же, что у платформенного администратора. Посторонний человек получал
 * список чужих заявок со ставками заказчика и перевозчика.
 *
 * Исключения ставятся декоратором `@AllowWithoutCompany()` и перечислены
 * здесь поимённо с причиной: появилось новое — тест падает, и решение
 * открыть маршрут принимается осознанно. Пропало старое — тоже падает,
 * чтобы перепись не расходилась с кодом.
 */

const SRC = join(__dirname, '..');
const HTTP_METHODS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All']);

/** Открыты до подключения организации — с причиной по каждому. */
const ALLOWED_WITHOUT_COMPANY: Record<string, string> = {
    // Своё, личное — не про организацию.
    'AuthController.logout': 'выход',
    'AuthController.getMe': 'кто я — этим живёт весь фронтенд',
    'UsersController.uploadMyAvatar': 'своё фото',
    'UsersController.getMyAvatar': 'своё фото',
    'UsersController.updateProfile': 'свой профиль',
    'UsersController.updatePassword': 'свой пароль',

    // Ради чего человек без организации сюда и заходит.
    'MyCompanyController.getMine': 'своя организация и состояние проверки',
    'MyCompanyController.create': 'создание своей организации',
    'MyCompanyController.uploadDocument': 'документы своей организации на проверку',
    'MyCompanyController.submit': 'отправка организации на проверку',

    // Помощь нужна прежде всего тому, у кого подключение не получилось.
    'AssistantController.chat': 'ИИ-гид',
    'AssistantController.supportChat': 'обращение в поддержку',
    'AssistantController.createTicket': 'обращение в поддержку',
    'AssistantController.publishedUpdates': 'что нового — запрашивает обёртка кабинета',
};

/**
 * Маршруты, которые не должны открыться никогда: именно через них утекали
 * чужие заявки, ставки, адреса и сотрудники.
 */
const MUST_STAY_CLOSED = [
    'OrdersController.findAll',
    'OrdersController.findOne',
    'LocationsController.findAll',
    'UsersController.findDrivers',
    'CompanyController.getCompanyOrders',
    'PartnersController.getMyPartners',
];

interface Route {
    key: string;
    allowedWithoutCompany: boolean;
}

function controllerFiles(): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(SRC)) {
        const dir = join(SRC, entry);
        if (!statSync(dir).isDirectory()) continue;
        for (const file of readdirSync(dir)) {
            if (file.endsWith('.controller.ts')) files.push(join(dir, file));
        }
    }
    return files.sort();
}

function decoratorNames(node: ts.Node): string[] {
    const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
    return decorators.map((d) => {
        const expression = ts.isCallExpression(d.expression) ? d.expression.expression : d.expression;
        return expression.getText();
    });
}

function collectRoutes(): Route[] {
    const routes: Route[] = [];
    for (const file of controllerFiles()) {
        const source = ts.createSourceFile(
            file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
        );
        source.forEachChild((node) => {
            if (!ts.isClassDeclaration(node) || !node.name) return;
            const classDecorators = decoratorNames(node);
            if (!classDecorators.includes('Controller')) return;

            for (const member of node.members) {
                if (!ts.isMethodDeclaration(member)) continue;
                const methodDecorators = decoratorNames(member);
                if (!methodDecorators.some((name) => HTTP_METHODS.has(name))) continue;

                routes.push({
                    key: `${node.name!.text}.${member.name.getText()}`,
                    allowedWithoutCompany:
                        methodDecorators.includes('AllowWithoutCompany')
                        || classDecorators.includes('AllowWithoutCompany'),
                });
            }
        });
    }
    return routes;
}

describe('Маршруты, открытые без организации', () => {
    const routes = collectRoutes();
    const open = routes.filter((route) => route.allowedWithoutCompany);

    it('перепись собралась — контроллеры найдены и разобраны', () => {
        // Если разбор сломается, список окажется пустым и проверки ниже
        // станут зелёными, ничего не проверив.
        expect(routes.length).toBeGreaterThan(300);
        expect(open.length).toBeGreaterThan(0);
    });

    it('новых маршрутов без организации не появилось', () => {
        const unexpected = open.filter((route) => !ALLOWED_WITHOUT_COMPANY[route.key]);
        expect(unexpected.map((route) => route.key).sort()).toEqual([]);
    });

    it('в переписи нет исчезнувших маршрутов', () => {
        const live = new Set(open.map((route) => route.key));
        expect(Object.keys(ALLOWED_WITHOUT_COMPANY).filter((key) => !live.has(key))).toEqual([]);
    });

    it('у каждого исключения записана причина', () => {
        expect(
            Object.keys(ALLOWED_WITHOUT_COMPANY).filter((key) => !ALLOWED_WITHOUT_COMPANY[key].trim()),
        ).toEqual([]);
    });

    it('рабочие разделы закрыты', () => {
        const live = new Set(routes.map((route) => route.key));
        // Сначала убеждаемся, что маршруты вообще существуют: переименовали —
        // проверка ниже стала бы бессмысленной, но зелёной.
        expect(MUST_STAY_CLOSED.filter((key) => !live.has(key))).toEqual([]);

        const openKeys = new Set(open.map((route) => route.key));
        expect(MUST_STAY_CLOSED.filter((key) => openKeys.has(key))).toEqual([]);
    });
});
