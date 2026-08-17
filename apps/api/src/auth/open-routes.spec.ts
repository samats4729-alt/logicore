import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';

/**
 * Перепись маршрутов без ограничения по ролям.
 *
 * `RolesGuard` устроен так, что маршрут без `@Roles` пропускает всех. Это
 * удобно и опасно одновременно: забытый декоратор не ломает ничего и не
 * виден ни в одном отчёте — он просто открывает дверь. Ровно такой формы
 * была дыра в правке своего профиля: маршрут принимал всё, что прислали,
 * и водитель делал себя администратором платформы.
 *
 * Поэтому каждый такой маршрут перечислен здесь поимённо и с причиной.
 * Появился новый — тест падает, и решение «оставить открытым» принимается
 * осознанно, а не задним числом. Исчез старый — тоже падает, чтобы список
 * не превращался в кладбище.
 *
 * Проверка идёт по исходникам, а не по запущенному приложению: так она
 * видит все 34 контроллера разом, не поднимая базу и не собирая модули.
 */

const SRC = join(__dirname, '..');
const HTTP_METHODS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All']);

/** Открыты всем без входа: ссылки контрагенту, вход, регистрация, служебное. */
const PUBLIC_ROUTES: Record<string, string> = {
    'PublicAccountingController.getSharedReport': 'акт сверки по ссылке — контрагент не заводит логин',
    'PublicAccountingDocumentController.createFromSharedReport': 'счёт из присланной сверки',
    'PublicAccountingDocumentController.getByToken': 'счёт по ссылке',
    'PublicAccountingDocumentController.getPdfByToken': 'печать счёта по ссылке',
    'AuthController.loginEmail': 'вход',
    'AuthController.loginDriver': 'вход водителя',
    'AuthController.forgotPassword': 'восстановление пароля',
    'AuthController.resetPassword': 'восстановление пароля',
    'AuthController.register': 'регистрация',
    'AuthController.registerCompany': 'регистрация компании',
    'AuthController.googleLogin': 'вход через Google',
    'AuthController.googleRegister': 'регистрация через Google',
    'AuthController.getInvitation': 'приглашение по ссылке — человека ещё нет в системе',
    'AuthController.registerInvitedUser': 'регистрация по приглашению',
    'AuthController.lookupCompany': 'подстановка реквизитов по БИН при регистрации',
    'DriverPublicController.get': 'рейс по ссылке для водителя без приложения',
    'DriverPublicController.advance': 'отметка статуса по ссылке',
    'DriverPublicController.problem': 'сообщение о проблеме по ссылке',
    'DriverPublicController.location': 'координаты по ссылке',
    'DriverPublicController.uploadTtn': 'фото накладной по ссылке',
    'MonitoringController.health': 'проверка живости для Railway',
    'MonitoringController.reportClientError': 'ошибки браузера — их шлёт и разлогиненная страница',
    'PublicPaymentProofController.submit': 'чек по ссылке от контрагента',
    'PublicAccountingDocumentController.withdrawFromSharedReport':
        'контрагент отзывает свой же счёт, пока его не приняли в работу',
    'PublicSharedReportDocumentController.upload':
        'накладная и счёт от контрагента по ссылке — учётной записи у него нет',
    'PublicSharedReportDocumentController.list': 'что контрагент уже прислал по этой ссылке',
    'PublicSharedReportDocumentController.read': 'открыть свой же присланный файл',
    'PublicBillingController.getTariff': 'цена тарифа для лендинга — её смотрят до регистрации',
};

/** Требуют входа, но роль не ограничена — с указанием, почему так и должно быть. */
const ANY_LOGGED_IN_ROUTES: Record<string, string> = {
    // Своё — по определению доступно каждому вошедшему.
    'AuthController.logout': 'выход',
    'AuthController.getMe': 'кто я',
    'UsersController.uploadMyAvatar': 'своё фото',
    'UsersController.getMyAvatar': 'своё фото',
    'UsersController.getUserAvatar': 'фото коллеги — доступ проверяется в getAvatarPathFor',
    'UsersController.updateProfile': 'свой профиль — форма UpdateProfileDto, только личные поля',
    'UsersController.updatePassword': 'свой пароль — со сверкой текущего',
    'PayrollController.getMySummary': 'своя зарплата',
    'PayrollController.getMyReport': 'своя зарплата',
    'CompanyController.getMyCompanies': 'список своих юрлиц',
    'CompanyController.addMyCompany': 'своё юрлицо',
    'CompanyController.switchCompany': 'переключение между своими юрлицами',
    'CompanyController.deleteMyCompany': 'своё юрлицо',
    'MyCompanyController.getMine': 'своя компания',
    'MyCompanyController.create': 'своя компания',
    'MyCompanyController.uploadDocument': 'документы своей компании на проверку',
    'MyCompanyController.submit': 'заявка на проверку своей компании',
    'BillingController.getStatus': 'состояние подписки — нужно даже заблокированному',
    'BillingController.getPlans': 'тарифы — нужно даже заблокированному',
    'AuditController.getStatus': 'включён ли журнал действий',
    'AssistantController.chat': 'помощник — отвечает в границах роли спросившего',
    'AssistantController.supportChat': 'обращение в поддержку',
    'AssistantController.createTicket': 'обращение в поддержку',
    'AssistantController.publishedUpdates': 'что нового в платформе',
    'AssistantController.myTickets': 'свои обращения в поддержку — отбор по компании внутри',
    'AssistantController.myAnswers': 'ответы поддержки своей компании — отбор по компании внутри',

    // Справочники: одинаковы для всех и не содержат ничего про компанию.
    'CargoTypesController.findAll': 'справочник видов груза',
    'CitiesController.getCountries': 'справочник стран',
    'CitiesController.getRegions': 'справочник областей',
    'CitiesController.findAll': 'справочник городов',
    'GeoController.suggest': 'подсказка адреса',
    'GeoController.reverse': 'адрес по координатам',
    'LocationsController.findAll': 'адреса и склады своей компании — отбор по компании внутри',
    'LocationsController.findOne': 'адрес своей компании — отбор по компании внутри',
    'LocationsController.missingCoordinates': 'свои адреса без координат — отбор по компании внутри',

    // Вместо роли спрашивается право раздела: @RequirePermissions на классе.
    'DocumentsController.uploadFile': 'права раздела «Документы»',
    'DocumentsController.create': 'права раздела «Документы»',
    'DocumentsController.list': 'права раздела «Документы»',
    'DocumentsController.findByOrder': 'права раздела «Документы»',
    'DocumentsController.findOne': 'права раздела «Документы»',
    'DocumentsController.downloadFile': 'права раздела «Документы»',
    'DocumentsController.remove': 'права раздела «Документы»; внутри — только автор файла или руководитель',

    // Доступ проверяется внутри, по самой заявке.
    'OrdersController.history': 'историю видит тот, кто видит рейс — через findById',
};

interface Route {
    key: string;
    hasRoles: boolean;
    hasJwt: boolean;
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
            const classGuards = (ts.getDecorators(node) || []).map((d) => d.getText()).join(' ');

            for (const member of node.members) {
                if (!ts.isMethodDeclaration(member)) continue;
                const methodDecorators = decoratorNames(member);
                if (!methodDecorators.some((name) => HTTP_METHODS.has(name))) continue;
                const methodGuards = (ts.getDecorators(member) || []).map((d) => d.getText()).join(' ');

                routes.push({
                    key: `${node.name!.text}.${member.name.getText()}`,
                    hasRoles: methodDecorators.includes('Roles') || classDecorators.includes('Roles'),
                    hasJwt: `${classGuards} ${methodGuards}`.includes('JwtAuthGuard'),
                });
            }
        });
    }
    return routes;
}

describe('Маршруты без ограничения по ролям', () => {
    const routes = collectRoutes();
    const open = routes.filter((route) => !route.hasRoles);
    const known = { ...PUBLIC_ROUTES, ...ANY_LOGGED_IN_ROUTES };

    it('перепись собралась — контроллеры найдены и разобраны', () => {
        // Если разбор сломается, список окажется пустым и все проверки ниже
        // станут зелёными, ничего не проверяя.
        expect(routes.length).toBeGreaterThan(300);
        expect(new Set(routes.map((r) => r.key.split('.')[0])).size).toBeGreaterThanOrEqual(30);
    });

    it('новых открытых маршрутов не появилось', () => {
        const unexpected = open.filter((route) => !known[route.key]);
        expect(unexpected.map((route) => route.key)).toEqual([]);
    });

    it('в переписи нет исчезнувших маршрутов', () => {
        const live = new Set(open.map((route) => route.key));
        expect(Object.keys(known).filter((key) => !live.has(key))).toEqual([]);
    });

    it('у каждого открытого маршрута записана причина', () => {
        // Пустая причина превращает перепись в список без смысла: через год
        // никто не вспомнит, открыт маршрут намеренно или по недосмотру.
        expect(Object.keys(known).filter((key) => !known[key].trim())).toEqual([]);
    });

    it('без входа доступны только те, что названы публичными', () => {
        // Маршрут без `@Roles` и без проверки токена — это дверь без замка.
        // Такие перечислены отдельно и по одному.
        const withoutLogin = open.filter((route) => !route.hasJwt).map((route) => route.key);
        expect(withoutLogin.sort()).toEqual(Object.keys(PUBLIC_ROUTES).sort());
    });

    it('маршрутов с ролями по-прежнему подавляющее большинство', () => {
        // Грубая, но полезная мера: если доля открытых поползёт вверх,
        // значит декоратор доступа стали забывать систематически.
        expect(open.length / routes.length).toBeLessThan(0.2);
    });
});
