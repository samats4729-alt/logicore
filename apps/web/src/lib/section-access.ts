/**
 * Кому какой раздел кабинета доступен.
 *
 * Меню и раньше пряталo то, чего человеку нельзя. Но прямая ссылка открывала
 * страницу всё равно: она грузилась, запросы получали отказ, и завскладом
 * видел пустой экран без единого объяснения. Ссылками делятся в переписке,
 * их сохраняют в закладки — этот путь не редкий.
 *
 * Правило здесь ровно то же, что у меню, и повторяет `@RequirePermissions`
 * на стороне сервера. Сервер остаётся главным: здесь мы только показываем
 * человеку понятную причину вместо пустоты.
 */

/** Роли, которым права выдаются поимённо. Остальным раздел открыт. */
const PERMISSION_MANAGED_ROLES = ['LOGISTICIAN', 'ACCOUNTANT', 'WAREHOUSE_MANAGER', 'MANAGER'];

/** Роли, которые ходят везде: свой раздел им никто не закрывает. */
const FULL_ACCESS_ROLES = ['COMPANY_ADMIN', 'FORWARDER', 'ADMIN'];

/**
 * Раздел → чем он закрыт. Порядок важен: ищем первое совпадение.
 *
 * `permission` — право из «Сотрудников» (те же строки, что у меню и у
 * `@RequirePermissions` на сервере). `roles` — список ролей, если раздел
 * закрыт самой ролью, а не правом: на сервере это `@Roles`, и никакое
 * право такой отказ не снимает. Раньше здесь были только права, поэтому
 * «Договоры», «Автопарк», «Сотрудники», «Журнал действий» и «Зарплата»
 * по прямой ссылке открывались бухгалтеру и завскладу и молча показывали
 * пустой экран.
 */
const SECTIONS: { prefix: string; permission?: string; roles?: string[]; title: string }[] = [
    { prefix: '/company/accounting', permission: 'accounting', title: 'Бухгалтерия' },
    { prefix: '/company/orders', permission: 'orders', title: 'Заявки' },
    { prefix: '/company/tracking', permission: 'tracking', title: 'GPS-мониторинг' },
    { prefix: '/company/partners', permission: 'partners', title: 'Контрагенты' },
    { prefix: '/company/carriers', permission: 'partners', title: 'Перевозчики' },
    { prefix: '/company/drivers', permission: 'drivers', title: 'Водители' },
    { prefix: '/company/contracts', permission: 'partners', roles: ['LOGISTICIAN'], title: 'Договоры' },
    { prefix: '/company/vehicles', roles: ['LOGISTICIAN'], title: 'Автопарк' },
    { prefix: '/company/users', roles: [], title: 'Сотрудники' },
    { prefix: '/company/settings', roles: [], title: 'Настройки компании' },
    { prefix: '/company/audit', roles: [], title: 'Журнал действий' },
    { prefix: '/company/payroll', roles: [], title: 'Зарплата' },
];

export interface SectionCheck {
    allowed: boolean;
    /** Название раздела — чтобы сказать, куда именно нельзя. */
    title?: string;
}

export function checkSectionAccess(
    pathname: string,
    user: { role?: string; permissions?: string[] } | null | undefined,
): SectionCheck {
    if (!user?.role) return { allowed: true };

    // Владелец компании и экспедитор ходят везде — как в меню.
    if (FULL_ACCESS_ROLES.includes(user.role)) return { allowed: true };

    const section = SECTIONS.find((s) => pathname.startsWith(s.prefix));
    if (!section) return { allowed: true };

    // Роль решает первой: право её отказ не перебивает — так же на сервере.
    if (section.roles && !section.roles.includes(user.role)) {
        return { allowed: false, title: section.title };
    }

    // Права настраиваются только у офисных ролей; остальных держит роль.
    if (!section.permission || !PERMISSION_MANAGED_ROLES.includes(user.role)) {
        return { allowed: true };
    }

    const granted = user.permissions || [];
    if (granted.includes(section.permission)) return { allowed: true };

    return { allowed: false, title: section.title };
}
