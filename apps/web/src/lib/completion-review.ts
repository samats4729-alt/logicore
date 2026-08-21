/**
 * Рейс закрыл водитель, и фото накладной ещё никто не смотрел.
 *
 * Водитель нажимает «выгрузился» и прикладывает накладную, стоя на
 * выгрузке. Нечитаемое фото можно переснять ровно пока он там: уехал —
 * возвращать некого. Поэтому такой рейс помечен в журнале, пока менеджер
 * не подтвердит, что накладную видно.
 *
 * Правило одно на журнал и на карточку: разойдись они — в списке горела бы
 * метка, которую в самой заявке снять нечем.
 */

export interface CompletionReviewFields {
    driverCompletedAt?: string | Date | null;
    completionReviewedAt?: string | Date | null;
}

/** Ждёт ли этот рейс проверки накладной. */
export function needsCompletionReview(order?: CompletionReviewFields | null): boolean {
    return !!order?.driverCompletedAt && !order?.completionReviewedAt;
}

/** Сколько рейсов в списке ждут проверки. */
export function countAwaitingReview(orders: CompletionReviewFields[]): number {
    return orders.reduce((сумма, o) => (needsCompletionReview(o) ? сумма + 1 : сумма), 0);
}
