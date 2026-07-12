import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

export const PERMISSIONS_KEY = 'module_permissions';

/**
 * Требование прав доступа к разделу: у пользователя должно быть
 * хотя бы одно из перечисленных прав (user.permissions).
 * Используются те же строки, которыми фронтенд скрывает пункты меню:
 * orders, documents, accounting, partners, tracking, drivers.
 */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Проверка применяется только к офисным ролям, у которых права настраиваются
 * в разделе «Сотрудники». Админ компании, экспедитор и платформенный админ
 * имеют полный доступ к разделам (как hasPerm на фронте), остальные роли
 * (водитель, грузополучатель, партнёр) правами не управляются и проходят
 * без проверки — их ограничивает RolesGuard.
 */
const PERMISSION_MANAGED_ROLES: UserRole[] = [
    UserRole.LOGISTICIAN,
    UserRole.ACCOUNTANT,
    UserRole.WAREHOUSE_MANAGER,
];

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!required || required.length === 0) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();
        if (!user) return false;

        if (!PERMISSION_MANAGED_ROLES.includes(user.role)) {
            return true;
        }

        const granted: string[] = user.permissions || [];
        if (required.some((permission) => granted.includes(permission))) {
            return true;
        }

        throw new ForbiddenException('Нет доступа к этому разделу');
    }
}
