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
}

export const ADVANCE_KIND: Record<AdvanceKind, string> = {
    FUEL: 'На топливо',
    ADVANCE: 'Аванс',
};

export const ADVANCE_STATUS: Record<AdvanceStatus, { label: string; tone: 'muted' | 'warn' | 'neg' | 'ok' }> = {
    REQUESTED: { label: 'Ждёт решения', tone: 'warn' },
    CHECK: { label: 'На доп. проверке', tone: 'warn' },
    REUPLOAD: { label: 'Ждём документы', tone: 'warn' },
    APPROVED: { label: 'Выдано', tone: 'ok' },
    REJECTED: { label: 'Отказ', tone: 'neg' },
    CANCELLED: { label: 'Водитель отозвал', tone: 'muted' },
};
