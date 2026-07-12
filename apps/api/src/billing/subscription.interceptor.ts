import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { BillingService } from './billing.service';

/**
 * Проверка подписки компании. Работает ПОСЛЕ гвардов (в req.user уже есть
 * пользователь). Пока биллинг выключен — единственная стоимость это один
 * кэшированный флаг, поведение платформы не меняется.
 *
 * Блокируются только офисные роли компаний. Водители и грузополучатели не
 * ограничиваются, чтобы не ломать рейсы в пути. Платформенный ADMIN — никогда.
 */
const ENFORCED_ROLES = new Set(['COMPANY_ADMIN', 'LOGISTICIAN', 'ACCOUNTANT', 'WAREHOUSE_MANAGER', 'FORWARDER']);

/** Что остаётся доступным без подписки: вход, статус биллинга, свой профиль, смена компании */
const ALLOWED_PREFIXES = [
    '/auth',
    '/billing',
    '/users/me',
    '/users/profile',
    '/users/password',
    '/company/my-companies',
    '/company/switch-company',
];

@Injectable()
export class SubscriptionInterceptor implements NestInterceptor {
    constructor(private billingService: BillingService) { }

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        if (context.getType() !== 'http') {
            return next.handle();
        }

        const req = context.switchToHttp().getRequest();
        const user = req.user;

        if (user?.companyId && ENFORCED_ROLES.has(user.role)) {
            const path: string = req.path || req.url || '';
            const isAllowedPath = ALLOWED_PREFIXES.some(p => path.startsWith(p));

            if (!isAllowedPath) {
                const allowed = await this.billingService.isCompanyAllowed(user.companyId);
                if (!allowed) {
                    throw new HttpException(
                        { message: 'Подписка не активна. Оплатите тариф, чтобы продолжить работу.', code: 'SUBSCRIPTION_REQUIRED' },
                        402,
                    );
                }
            }
        }

        return next.handle();
    }
}
