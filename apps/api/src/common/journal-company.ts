import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Какая организация холдинга открыта в журнале.
 *
 * У аккаунта может быть несколько организаций, и журналы ведутся по одной
 * из них — как поле «Организация» в шапке журнала 1С. Название приходит из
 * браузера, поэтому подставить туда можно что угодно: без проверки это был
 * бы способ читать чужую бухгалтерию.
 *
 * Правило одно на все журналы. Разъедься оно — список документов показывал
 * бы одну организацию, а итоги над ним другую, и заметить это было бы
 * нельзя: обе цифры выглядят правдоподобно.
 */
export async function resolveJournalCompany(
    prisma: {
        userCompanyRelation: {
            findUnique: (args: any) => Promise<{ role: UserRole } | null>;
        };
    },
    params: {
        userId: string;
        activeCompanyId: string | null | undefined;
        requestedCompanyId?: string;
        allowedRoles: UserRole[];
    },
): Promise<string> {
    const { userId, activeCompanyId, requestedCompanyId, allowedRoles } = params;

    if (!requestedCompanyId || requestedCompanyId === activeCompanyId) {
        if (!activeCompanyId) {
            throw new ForbiddenException('Организация не выбрана');
        }
        return activeCompanyId;
    }

    const relation = await prisma.userCompanyRelation.findUnique({
        where: { userId_companyId: { userId, companyId: requestedCompanyId } },
        select: { role: true },
    });
    if (!relation) {
        throw new ForbiddenException('Вы не состоите в этой организации');
    }
    // Роль в холдинге своя у каждой организации: бухгалтер в одной может
    // быть водителем в другой.
    if (!allowedRoles.includes(relation.role)) {
        throw new ForbiddenException('В этой организации у вас нет доступа к бухгалтерии');
    }
    return requestedCompanyId;
}
