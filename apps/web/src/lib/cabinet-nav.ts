/**
 * Какой пункт меню кабинета считается текущим.
 *
 * Правило одно на два меню: пилюли наверху на компьютере и список в ящике
 * на телефоне. Пока оно жило внутри разметки шапки, телефон обходился
 * сравнением «путь равен ключу» — и подсветка гасла на любой внутренней
 * странице: открыл рейс из журнала, а «Заявки» уже не выделены.
 *
 * Хаб-страницы подсвечиваются и на своих подстраницах. Списки не
 * пересекаются: путь, попавший в два, подсветил бы разом две пилюли.
 */

const CABINET_ROUTES = [
    '/company/cabinet', '/company/users', '/company/settings', '/company/audit',
    '/company/partners', '/company/contracts', '/company/locations',
    '/company/vehicles', '/company/documents', '/company/profile',
    '/company/accounting/settings', '/company/accounting/payment-conditions',
    '/company/accounting/payment-forms', '/company/accounting/ownership-types',
    '/company/accounting/banks', '/company/accounting/currencies',
    '/company/accounting/revaluation', '/company/accounting/document-numbering',
    '/company/accounting/order-numbering',
    '/company/inventory/nomenclature', '/company/inventory/warehouses',
];

const FINANCE_ROUTES = [
    '/company/finance', '/company/accounting/invoices', '/company/accounting/acts',
    '/company/accounting/transport-documents', '/company/accounting/incoming',
    '/company/accounting/calendar', '/company/accounting/planned',
    '/company/accounting/cash-in', '/company/accounting/cash-out',
    '/company/accounting/operations', '/company/accounting/balances',
    '/company/accounting/counterparty-report', '/company/accounting/reconciliation-act',
    '/company/accounting/opening-balances', '/company/accounting/act-of-work',
    '/company/inventory/balances', '/company/inventory/receipts',
    '/company/inventory/transfers', '/company/inventory/writeoffs',
    '/company/payroll', '/company/my-salary',
];

const REPORTS_ROUTES = [
    '/company/reports', '/company/accounting/pnl', '/company/accounting/carrier-profit',
    '/company/accounting/registry', '/company/accounting/cashflow',
    '/company/accounting/expenses-by-category',
];

const REQUESTS_ROUTES = ['/company/requests', '/company/calculator'];

export const HUB_ROUTES: Record<string, string[]> = {
    '/company/cabinet': CABINET_ROUTES,
    '/company/finance': FINANCE_ROUTES,
    '/company/reports': REPORTS_ROUTES,
    '/company/requests': REQUESTS_ROUTES,
};

/** Адреса внутри выпадающего пункта («Мониторинг»). */
export function childKeysOf(item: any): string[] {
    return (item?.children || [])
        .flatMap((c: any) => (c?.type === 'group' && Array.isArray(c.children)) ? c.children : [c])
        .filter((c: any) => c?.key && String(c.key).startsWith('/'))
        .map((c: any) => String(c.key));
}

const within = (routes: string[], pathname: string) =>
    routes.some((k) => pathname === k || pathname.startsWith(k + '/'));

export function isNavItemActive(item: any, pathname: string): boolean {
    const key = String(item?.key ?? '');
    // «Дашборд» живёт ровно по своему адресу: он корень кабинета, и любая
    // внутренняя страница начинается с него.
    if (key === '/company') return pathname === '/company';
    if (HUB_ROUTES[key]) return within(HUB_ROUTES[key], pathname);
    if (key.startsWith('/')) return pathname === key || pathname.startsWith(key + '/');
    return within(childKeysOf(item), pathname);
}
