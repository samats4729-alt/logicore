import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { CompanyVerificationService } from '../services/company-verification.service';

export const REQUIRE_VERIFIED_COMPANY = 'requireVerifiedCompany';

/**
 * Действие доступно только подтверждённой организации.
 *
 * Вешается на конкретные ручки — создание заявок, счетов, актов. Читать и
 * настраивать кабинет неподтверждённая компания может: иначе она не сможет
 * даже приложить документы для проверки.
 */
export const RequireVerifiedCompany = () => SetMetadata(REQUIRE_VERIFIED_COMPANY, true);

@Injectable()
export class CompanyVerifiedGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly verification: CompanyVerificationService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_COMPANY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!required) return true;

        const request = context.switchToHttp().getRequest();
        const user = request.user;
        // Админ платформы работает поверх всех компаний — он и подтверждает.
        if (!user || user.role === UserRole.ADMIN) return true;
        if (!user.companyId) return true;

        await this.verification.assertVerified(user.companyId);
        return true;
    }
}
