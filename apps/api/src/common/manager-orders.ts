import { Prisma, UserRole } from '@prisma/client';

/**
 * «Свои заявки» менеджера — одно правило на весь кабинет.
 *
 * Настройка компании «менеджер видит только свои заявки» жила внутри списка
 * заявок и дальше не шла. Получалось наполовину: в «Заявках» менеджер видел
 * свои пять рейсов, а в журнале счетов, во взаиморасчётах и в итогах над ними
 * — деньги всей компании, включая чужие сделки и чужие ставки. Прятать рейс,
 * но показывать счёт по нему, — это не приватность, а её видимость.
 *
 * Поэтому правило вынесено сюда и применяется всюду, где деньги показываются
 * по сделкам. Разъедься копии — список показывал бы одно, а сумма над ним
 * другое, и обе цифры выглядели бы правдоподобно.
 */

/**
 * Заявка считается своей, если менеджер её ведёт — или если её пока не ведёт
 * никто.
 *
 * Последнее не оплошность: непринятые заявки видны всем менеджерам по
 * принципу «кто примет, тот и ведёт». Спрячь их — новая заявка не досталась
 * бы никому.
 */
export function ownOrdersWhere(companyId: string, userId: string): Prisma.OrderWhereInput {
    return {
        OR: [
            { responsibles: { some: { companyId, userId } } },
            { responsibles: { none: { companyId } } },
            { responsibleManagerId: userId },
            { customerId: userId },
        ],
    };
}

/** Роли, к которым приватность заявок вообще применяется. */
const УЧАСТВУЮТ: UserRole[] = [UserRole.LOGISTICIAN];

type CompanyReader = {
    company: {
        findUnique: (args: any) => Promise<{ managersSeeOwnOrdersOnly: boolean } | null>;
    };
};

/**
 * Чем сузить выборку этому человеку — или `null`, если сужать не надо.
 *
 * `null` возвращается двумя разными путями, и оба нормальны: человек не
 * менеджер (админ, бухгалтер, экспедитор видят компанию целиком) либо
 * настройка в компании выключена. Возвращать вместо этого «пустое условие»
 * нельзя: вызывающий должен видеть разницу между «не сужаем» и «сузили».
 */
export async function managerOrdersFilter(
    prisma: CompanyReader,
    params: { companyId: string; role: UserRole | string | null | undefined; userId: string | null | undefined },
): Promise<Prisma.OrderWhereInput | null> {
    const { companyId, role, userId } = params;
    if (!userId || !role || !УЧАСТВУЮТ.includes(role as UserRole)) return null;

    const owner = await prisma.company.findUnique({
        where: { id: companyId },
        select: { managersSeeOwnOrdersOnly: true },
    });
    // По умолчанию настройка включена: `false` ставят осознанно.
    if (owner?.managersSeeOwnOrdersOnly === false) return null;

    return ownOrdersWhere(companyId, userId);
}

/**
 * То же условие для документа бухгалтерии: у документа своих сторон нет,
 * он привязан к рейсам.
 *
 * Документ без единого рейса менеджеру не показывается. Это решение, а не
 * недосмотр: такой документ ни к одной его сделке не относится, и понять по
 * нему, свой он или чужой, невозможно — а журнал менеджера должен отвечать
 * на вопрос «что по моим рейсам».
 */
export function documentsOfOwnOrders(
    filter: Prisma.OrderWhereInput,
): Prisma.AccountingDocumentWhereInput {
    return { orders: { some: { order: filter } } };
}
