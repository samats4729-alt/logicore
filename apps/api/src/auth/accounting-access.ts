import { UserRole } from '@prisma/client';

/**
 * Кому в этой компании можно решать бухгалтерские вопросы.
 *
 * НДС, ставки, сроки оплаты, проведение документов — работа бухгалтера.
 * Отдельной роли для этого не завели намеренно: в маленькой фирме бухгалтер и
 * менеджер — один человек, и заставлять его переключать учётные записи глупо.
 * Решает право «Бухгалтерия», которое руководитель выдаёт в «Сотрудниках» —
 * та самая галочка. У руководителя и экспедитора оно есть всегда: это их
 * собственная фирма.
 *
 * Строка права та же, что скрывает раздел в меню, — `accounting`. Один ответ
 * на вопрос «пускать ли», а не два разных в интерфейсе и на сервере.
 */

const FULL_ACCESS: string[] = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER];

export function canTouchAccounting(
    user: { role?: string | null; permissions?: string[] | null } | null | undefined,
): boolean {
    if (!user?.role) return false;
    if (FULL_ACCESS.includes(user.role)) return true;
    return (user.permissions || []).includes('accounting');
}

/** Поля заявки, которые может менять только бухгалтер. */
export const ACCOUNTING_ORDER_FIELDS = [
    'hasVat', 'vatRate', 'executorHasVat', 'executorVatRate',
    'customerPaymentDays', 'customerPaymentFrom',
    'carrierPaymentDays', 'carrierPaymentFrom',
    'customerPaymentDate', 'driverPaymentDate',
] as const;
