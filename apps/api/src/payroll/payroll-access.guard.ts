import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Кто видит зарплаты сотрудников компании.
 *
 * Решает администратор компании (владелец, 25.10.2026): ему раздел открыт
 * всегда, остальным — только если он поставил галочку «Зарплата» в
 * «Сотрудниках» (лично или отделу). Должность сама доступа не даёт — раньше
 * раздел открывался экспедитору по одной роли.
 *
 * Свою зарплату (`/payroll/my…`) видит каждый — это не про чужие деньги.
 */
export function canViewPayroll(user: { role?: string; permissions?: string[] } | null | undefined): boolean {
    if (!user) return false;
    if (user.role === UserRole.COMPANY_ADMIN) return true;
    return (user.permissions ?? []).includes('payroll');
}

@Injectable()
export class PayrollViewGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const { user } = context.switchToHttp().getRequest();
        if (canViewPayroll(user)) return true;
        throw new ForbiddenException(
            'Зарплаты сотрудников открывает администратор компании: попросите его отметить вам «Зарплату» в разделе «Сотрудники»',
        );
    }
}

/**
 * Офисные роли, которым администратор может открыть «Зарплату». Список
 * ролей — первая дверь (перепись открытых адресов требует её у каждого),
 * галочка — вторая: роль из этого списка без неё раздел не видит.
 */
export const PAYROLL_VIEW_ROLES: UserRole[] = [
    UserRole.COMPANY_ADMIN,
    UserRole.FORWARDER,
    UserRole.LOGISTICIAN,
    UserRole.ACCOUNTANT,
    UserRole.WAREHOUSE_MANAGER,
];
