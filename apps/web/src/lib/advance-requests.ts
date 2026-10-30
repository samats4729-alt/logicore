/** Запросы водителя парка на топливо и аванс (задачи шефа, Q17). */

export type AdvanceKind = 'FUEL' | 'ADVANCE';
export type AdvanceStatus = 'REQUESTED' | 'CHECK' | 'REUPLOAD' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface AdvanceRequest {
    id: string;
    kind: AdvanceKind;
    amount: number;
    comment: string | null;
    status: AdvanceStatus;
    /** Что сказал парк: что проверяют, что перезагрузить, почему отказ. */
    parkNote: string | null;
    issuedAmount: number | null;
    decidedAt: string | null;
    createdAt: string;
    updatedAt: string;
    orderId: string;
    orderNumber: string;
    driver: { id: string; name: string; phone: string | null };
    /** Рейс ждущего запроса (только у парка): топливо и «на руки» отдельно, налоги по ГПХ. */
    trip?: AdvanceTrip | null;
}

/** Лимит одной части рейса: сколько всего, выдано, ждёт решения, можно ещё. */
export interface AdvancePart {
    cap: number;
    issued: number;
    pending: number;
    available: number;
}

export interface AdvanceTrip {
    /** Доля суммы на руки, которую можно выдать предоплатой, %. */
    pct: number;
    /** Ставка водителя — до вычетов: топливо и оплата за работу до ОПВ. */
    rate: number;
    onHand: number;
    /** Оплата водителю за работу — до ОПВ. */
    gross: number;
    fuel: AdvancePart;
    advance: AdvancePart;
    taxes: { opv: number; vosms: number; so: number; ipn: number };
}

export const ADVANCE_KIND: Record<AdvanceKind, string> = {
    FUEL: 'На топливо',
    ADVANCE: 'Предоплата',
};

export const ADVANCE_STATUS: Record<AdvanceStatus, { label: string; tone: 'muted' | 'warn' | 'neg' | 'ok' }> = {
    REQUESTED: { label: 'Ждёт решения', tone: 'warn' },
    CHECK: { label: 'На доп. проверке', tone: 'warn' },
    REUPLOAD: { label: 'Ждём документы', tone: 'warn' },
    APPROVED: { label: 'Выдано', tone: 'ok' },
    REJECTED: { label: 'Отказ', tone: 'neg' },
    CANCELLED: { label: 'Водитель отозвал', tone: 'muted' },
};
