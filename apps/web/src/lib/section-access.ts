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

/** Раздел → право, которое нужно для входа. Порядок важен: ищем первое совпадение. */
const SECTIONS: { prefix: string; permission: string; title: string }[] = [
    { prefix: '/company/accounting', permission: 'accounting', title: 'Бухгалтерия' },
    { prefix: '/company/orders', permission: 'orders', title: 'Заявки' },
    { prefix: '/company/tracking', permission: 'tracking', title: 'GPS-мониторинг' },
    { prefix: '/company/partners', permission: 'partners', title: 'Контрагенты' },
    { prefix: '/company/carriers', permission: 'partners', title: 'Перевозчики' },
    { prefix: '/company/drivers', permission: 'drivers', title: 'Водители' },
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
    if (!PERMISSION_MANAGED_ROLES.includes(user.role)) return { allowed: true };

    const section = SECTIONS.find((s) => pathname.startsWith(s.prefix));
    if (!section) return { allowed: true };

    const granted = user.permissions || [];
    if (granted.includes(section.permission)) return { allowed: true };

    return { allowed: false, title: section.title };
}
