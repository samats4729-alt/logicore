import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Доступ к бирже по компаниям.
 *
 * Пока биржу проверяют, она открыта не всем: владелец платформы отмечает в
 * админке компании (`Company.exchangeAccess`). Биржу видят только они и
 * водители их парков. Общий выключатель `EXCHANGE_ENABLED` при этом
 * остаётся: без него биржи нет ни у кого.
 *
 * Сняли отметку — компания теряет биржу сразу, а её заявки пропадают с
 * ленты у остальных: смотреть их и откликаться больше некому.
 */
export const COMPANY_NO_ACCESS = 'Биржа пока открыта не всем компаниям — доступ включает администратор платформы';

export async function companyHasExchange(prisma: PrismaService, companyId: string | null | undefined): Promise<boolean> {
    if (!companyId) return false;
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { exchangeAccess: true } });
    return !!company?.exchangeAccess;
}

/**
 * Заявку выставила компания с доступом к бирже.
 *
 * «Выставила» — та же цепочка, что `managerOf`: перевозчик-экспедитор,
 * иначе экспедитор, иначе заказчик.
 */
export const PUBLISHER_HAS_ACCESS: Prisma.OrderWhereInput = {
    OR: [
        { subForwarder: { exchangeAccess: true } },
        { subForwarderId: null, forwarder: { exchangeAccess: true } },
        { subForwarderId: null, forwarderId: null, customerCompany: { exchangeAccess: true } },
    ],
};

/** Кабинет компании на бирже — только отмеченным компаниям. Ставить после JwtAuthGuard. */
@Injectable()
export class ExchangeCompanyAccessGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        if (!(await companyHasExchange(this.prisma, request.user?.companyId))) {
            throw new ForbiddenException(COMPANY_NO_ACCESS);
        }
        return true;
    }
}
