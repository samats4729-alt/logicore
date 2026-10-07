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
    // Блоки дашборда-конструктора (макет «shadcn Nova», 07.10.2026).
    'chart',
    'calendar',
    'upcoming',
    'attention',
    'inTransit',
    'debtors',
    'drivers',
    'byStatus',
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
    chart: 'Выручка и маржа по неделям',
    calendar: 'Календарь погрузок',
    upcoming: 'Ближайшие погрузки',
    attention: 'Требуют внимания',
    inTransit: 'Сейчас в пути',
    debtors: 'Должники',
    drivers: 'Водители сегодня',
    byStatus: 'Заявки по статусам',
};

/**
 * Блоки по заявкам: сервер показывает в них ровно те заявки, что человек
 * видит в журнале (менеджеру «только свои» — свои). Поэтому их открываем
 * всем, у кого есть раздел «Заявки», — чужого в них не окажется.
 */
const БЛОКИ_ЗАЯВОК: DashboardBlock[] = ['calendar', 'upcoming', 'attention', 'inTransit', 'byStatus'];

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
    const набор = new Set<DashboardBlock>(['events']);
    if (role === UserRole.ACCOUNTANT && permissions.includes('accounting')) {
        for (const блок of ['pendingWork', 'paymentCalendar', 'paymentProofs', 'incomingInvoices', 'debtors'] as const) набор.add(блок);
    }
    // Согласующий видит входящие счета с первого дня, какой бы ни была его
    // роль. Право выдают и менеджеру направления, и руководителю отдела;
    // держать их блок закрытым до отдельной настройки значит, что счёт
    // по-прежнему ждёт, пока человек сам догадается открыть «Входящие».
    if (permissions.includes('invoice_approval')) набор.add('incomingInvoices');
    if (permissions.includes('orders')) for (const блок of БЛОКИ_ЗАЯВОК) набор.add(блок);
    if (permissions.includes('drivers')) набор.add('drivers');
    // Порядок — как в общем списке: по нему строится и настройка в «Сотрудниках».
    return БЛОКИ_ДАШБОРДА.filter((блок) => набор.has(блок));
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
