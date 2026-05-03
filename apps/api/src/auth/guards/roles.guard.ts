import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) =>
    (target: any, key?: string, descriptor?: any) => {
        Reflect.defineMetadata(ROLES_KEY, roles, descriptor?.value ?? target);
        return descriptor ?? target;
    };

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        // TODO: Временно отключена проверка ролей — вернуть позже
        return true;

        // const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        //     context.getHandler(),
        //     context.getClass(),
        // ]);

        // if (!requiredRoles) {
        //     return true;
        // }

        // const { user } = context.switchToHttp().getRequest();
        // return requiredRoles.some((role) => user.role === role);
    }
}
