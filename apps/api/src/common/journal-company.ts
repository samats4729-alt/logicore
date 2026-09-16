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
/**
 * Кто смотрит журнал.
 *
 * Роль здесь — та, что действует в открытой организации, а не общая из
 * карточки пользователя: в другой организации холдинга она может быть иной.
 * Нужна затем же, зачем и `companyId`, — чтобы список, итоги над ним и
 * печатная форма отбирались одинаково.
 */
export interface JournalViewer {
    userId: string;
    role: UserRole | string | null | undefined;
}

export interface JournalCompany {
    companyId: string;
    /**
     * Роль в ЭТОЙ организации, если её пришлось смотреть отдельно.
     *
     * `null` означает «организация та же, что в сессии» — тогда роль уже
     * лежит в `req.user.role`, её кладёт туда `findUserById` по связи с
     * активной компанией. Лишний запрос ради того же ответа не нужен, а
     * подставлять общую роль из карточки пользователя нельзя: в другой
     * организации холдинга она другая.
     */
    role: UserRole | null;
}

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
): Promise<JournalCompany> {
    const { userId, activeCompanyId, requestedCompanyId, allowedRoles } = params;

    if (!requestedCompanyId || requestedCompanyId === activeCompanyId) {
        if (!activeCompanyId) {
            throw new ForbiddenException('Организация не выбрана');
        }
        return { companyId: activeCompanyId, role: null };
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
    return { companyId: requestedCompanyId, role: relation.role };
}
