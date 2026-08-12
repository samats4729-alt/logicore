/**
 * Кому что можно в кабинете.
 *
 * Правило одно и то же на экране и на сервере (`auth/accounting-access.ts`):
 * у руководителя и экспедитора доступ ко всем разделам собственной фирмы, у
 * остальных — по правам, которые руководитель выдаёт в «Сотрудниках».
 *
 * Раньше эта проверка была написана заново в трёх местах кабинета, и в
 * четвёртом её просто забывали.
 */

type Actor = { role?: string | null; permissions?: string[] | null } | null | undefined;

/** Роли, у которых права не настраиваются: это их компания. */
const FULL_ACCESS = ['ADMIN', 'COMPANY_ADMIN', 'FORWARDER'];

export function hasPermission(user: Actor, permission: string): boolean {
    if (!user?.role) return false;
    if (FULL_ACCESS.includes(user.role)) return true;
    return !!user.permissions?.includes(permission);
}

/**
 * Право «Бухгалтерия» — та самая галочка сотруднику.
 *
 * Ею открываются НДС, сроки оплаты, проведение документов и вкладка
 * «Финансы» в рейсе. Менеджеру без неё всего этого не видно: он ведёт
 * маршрут, груз и сроки, а налоги — не его работа и не его ответственность.
 */
export const canAccounting = (user: Actor): boolean => hasPermission(user, 'accounting');
