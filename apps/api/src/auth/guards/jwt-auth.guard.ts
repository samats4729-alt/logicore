import { Injectable, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

export const ALLOW_WITHOUT_COMPANY_KEY = 'allow_without_company';

/**
 * Маршрут доступен пользователю, который ещё не в организации.
 * Ставится точечно: личный профиль, выход, подключение своей организации.
 */
export const AllowWithoutCompany = () => SetMetadata(ALLOW_WITHOUT_COMPANY_KEY, true);

/**
 * Без организации — только водителю. Водитель биржи приходит сам, через
 * приложение, и компании у него нет, а рейс он ведёт через те же адреса,
 * что и водитель компании: свои заявки, статус, геолокация, фото документов.
 * Всем остальным без организации туда нельзя: у пустой компании проверка
 * «участвует ли компания в заявке» отвечает неправильно.
 */
export const AllowDriverWithoutCompany = () => SetMetadata(ALLOW_WITHOUT_COMPANY_KEY, 'DRIVER');

/**
 * Кроме проверки токена гвард отвечает на второй вопрос: состоит ли этот
 * человек хоть в какой-нибудь организации.
 *
 * Зарегистрировавшийся получает роль `COMPANY_ADMIN` ещё до создания
 * организации, и `companyId` у него пустой. Дальше по коду пустая компания
 * означала «фильтровать не по чему» — то есть ровно то же, что у
 * платформенного администратора. Посторонний человек, зарегистрировавшись за
 * минуту, получал список чужих заявок вместе со ставками заказчика и
 * перевозчика. Список заявок был не единственным таким местом, поэтому
 * проверка стоит здесь, на входе, а не в каждом контроллере по отдельности.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private readonly reflector: Reflector) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const authenticated = (await super.canActivate(context)) as boolean;
        if (!authenticated) {
            return false;
        }

        const { user } = context.switchToHttp().getRequest();
        if (!user) {
            return false;
        }

        // Платформенный администратор работает поверх всех организаций,
        // своей у него нет.
        if (user.role === UserRole.ADMIN) {
            return true;
        }

        if (user.companyId) {
            return true;
        }

        const allowedWithoutCompany = this.reflector.getAllAndOverride<boolean | 'DRIVER'>(
            ALLOW_WITHOUT_COMPANY_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (allowedWithoutCompany === true) {
            return true;
        }
        if (allowedWithoutCompany === 'DRIVER' && user.role === UserRole.DRIVER) {
            return true;
        }

        throw new ForbiddenException(
            'Раздел откроется после подключения организации. Кабинет → Организация.',
        );
    }
}
