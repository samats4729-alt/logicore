import { UserRole } from '@prisma/client';

/**
 * Что человек видит на дашборде.
 *
 * Раньше это решала одна роль: полный дашборд — администратору компании и
 * экспедитору, всем остальным личная сводка и лента событий. В одной компании
 * так не выходит: финансовому отделу нужна активность и календарь, старшему
 * менеджеру — сводка по всем заявкам, рядовому — только свои. Роль на такие
 * вопросы не отвечает, а заводить под каждый случай новую роль значит плодить
 * их без конца.
 *
 * Поэтому набор блоков задаётся сотруднику. Пока руководитель его не трогал,
 * работает прежнее правило по роли — в день обновления ни у кого ничего не
 * меняется.
 */

export const БЛОКИ_ДАШБОРДА = [
    'activity',
    'pendingWork',
    'paymentCalendar',
    'paymentProofs',
    'incomingInvoices',
    'earnings',
    'events',
] as const;

export type DashboardBlock = (typeof БЛОКИ_ДАШБОРДА)[number];

/** Подписи — теми же словами, что на самом дашборде. */
export const НАЗВАНИЯ_БЛОКОВ: Record<DashboardBlock, string> = {
    activity: 'Активность',
    pendingWork: 'Требует оформления',
    paymentCalendar: 'Платёжный календарь',
    paymentProofs: 'Чеки от контрагентов',
    incomingInvoices: 'Входящие счета',
    earnings: 'Заработок сотрудников',
    events: 'Последние события',
};

/** Роли, которые видят компанию целиком. */
const ПОЛНЫЙ_ДОСТУП: UserRole[] = [UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.ADMIN];

/**
 * Набор блоков по роли — то, что человек видел до появления настройки.
 *
 * Бухгалтеру денежные блоки открыты только вместе с правом «Бухгалтерия»:
 * без него сервер на эти данные отвечает отказом, и блок показал бы пустоту
 * вместо работы.
 */
export function блокиПоРоли(
    role: UserRole | string | null | undefined,
    permissions: string[] = [],
): DashboardBlock[] {
    if (ПОЛНЫЙ_ДОСТУП.includes(role as UserRole)) {
        return [...БЛОКИ_ДАШБОРДА];
    }
    if (role === UserRole.ACCOUNTANT && permissions.includes('accounting')) {
        return ['pendingWork', 'paymentCalendar', 'paymentProofs', 'incomingInvoices', 'events'];
    }
    // Согласующий видит входящие счета с первого дня, какой бы ни была его
    // роль. Право выдают и менеджеру направления, и руководителю отдела;
    // держать их блок закрытым до отдельной настройки значит, что счёт
    // по-прежнему ждёт, пока человек сам догадается открыть «Входящие».
    if (permissions.includes('invoice_approval')) {
        return ['incomingInvoices', 'events'];
    }
    return ['events'];
}

/**
 * Что показывать этому человеку.
 *
 * Заданный руководителем набор сильнее роли — в том числе пустой: «не
 * показывать ничего» это осмысленный ответ, и превращать его в «тогда по
 * роли» значит не дать руководителю закрыть дашборд вовсе.
 */
export function видимыеБлоки(человек: {
    role?: UserRole | string | null;
    permissions?: string[] | null;
    dashboardCustom?: boolean | null;
    dashboardBlocks?: string[] | null;
}): DashboardBlock[] {
    if (человек.dashboardCustom) {
        const заданные = человек.dashboardBlocks ?? [];
        return БЛОКИ_ДАШБОРДА.filter((блок) => заданные.includes(блок));
    }
    return блокиПоРоли(человек.role, человек.permissions ?? []);
}
