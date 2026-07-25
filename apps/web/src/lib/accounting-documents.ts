import { api } from '@/lib/api';

/**
 * Типизированный доступ к бухгалтерским документам (счета, акты, акты сверки).
 *
 * Один модуль на все страницы раздела: журнал, карточка и создание берут
 * типы и запросы отсюда, чтобы контракт с API был описан в одном месте.
 */

export type AccountingDocumentType = 'PAYMENT_INVOICE' | 'SERVICE_ACT' | 'RECONCILIATION_ACT';
export type AccountingDocumentDirection = 'OUTGOING' | 'INCOMING';
export type AccountingDocumentStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

/** Термины журнала документов 1С — бухгалтер переходит оттуда. */
export const ACCOUNTING_DOCUMENT_STATUS_LABELS: Record<AccountingDocumentStatus, string> = {
    DRAFT: 'Черновик',
    POSTED: 'Проведён',
    CANCELLED: 'Отменён',
};

export interface AccountingDocumentParty {
    id: string;
    name: string | null;
    bin: string | null;
}

export interface AccountingDocumentOrderRef {
    order: { id: string; orderNumber: string };
}

export interface AccountingDocumentListItem {
    id: string;
    type: AccountingDocumentType;
    direction: AccountingDocumentDirection;
    status: AccountingDocumentStatus;
    number: string;
    documentDate: string;
    dueDate: string | null;
    currency: string;
    total: number;
    amountPaid: number;
    balanceDue: number;
    shareToken: string;
    shareRevokedAt: string | null;
    counterparty: AccountingDocumentParty | null;
    orders?: AccountingDocumentOrderRef[];
    _count?: { lines: number; orders: number; paymentAllocations: number };
}

export interface AccountingDocumentLine {
    id: string;
    lineNumber: number;
    serviceCode: string | null;
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    vatRate: number;
    vatAmount: number;
    subtotal: number;
    total: number;
    orderId: string | null;
}

export interface AccountingDocumentDetails extends AccountingDocumentListItem {
    subtotal: number;
    vatTotal: number;
    note: string | null;
    paymentTerms: string | null;
    bankAccountId: string | null;
    operationDate: string | null;
    postedAt: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    issuerSnapshot: Record<string, unknown>;
    recipientSnapshot: Record<string, unknown>;
    lines: AccountingDocumentLine[];
    createdBy?: { id: string; firstName: string | null; lastName: string | null };
    postedBy?: { id: string; firstName: string | null; lastName: string | null } | null;
}

export interface AccountingDocumentListResult {
    data: AccountingDocumentListItem[];
    total: number;
    page: number;
    limit: number;
    /** Итоги по всей выборке фильтров, не по текущей странице. */
    totals: { amount: number; paid: number; due: number };
}

export interface AccountingDocumentListParams {
    type?: AccountingDocumentType;
    direction?: AccountingDocumentDirection;
    status?: AccountingDocumentStatus;
    counterpartyId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}

export async function fetchAccountingDocuments(
    params: AccountingDocumentListParams,
): Promise<AccountingDocumentListResult> {
    const res = await api.get('/accounting-documents', { params });
    return res.data;
}

export async function fetchAccountingDocument(id: string): Promise<AccountingDocumentDetails> {
    const res = await api.get(`/accounting-documents/${id}`);
    return res.data;
}

export interface CreateAccountingDocumentLineInput {
    name: string;
    description?: string;
    quantity?: string;
    unit?: string;
    unitPrice: string;
    vatRate?: string;
    orderId?: string;
}

export interface CreateAccountingDocumentInput {
    type: AccountingDocumentType;
    direction: AccountingDocumentDirection;
    counterpartyId: string;
    documentDate: string;
    dueDate?: string;
    bankAccountId?: string;
    contractId?: string;
    paymentTerms?: string;
    note?: string;
    lines?: CreateAccountingDocumentLineInput[];
    orderIds?: string[];
}

export async function createAccountingDocument(
    input: CreateAccountingDocumentInput,
): Promise<AccountingDocumentDetails> {
    const res = await api.post('/accounting-documents', input);
    return res.data;
}

export async function postAccountingDocument(id: string): Promise<AccountingDocumentDetails> {
    const res = await api.post(`/accounting-documents/${id}/post`);
    return res.data;
}

export async function cancelAccountingDocument(id: string, reason: string): Promise<AccountingDocumentDetails> {
    const res = await api.post(`/accounting-documents/${id}/cancel`, { reason });
    return res.data;
}

export async function deleteAccountingDocumentDraft(id: string): Promise<void> {
    await api.delete(`/accounting-documents/${id}`);
}

export async function revokeAccountingDocumentShare(id: string): Promise<void> {
    await api.post(`/accounting-documents/${id}/share/revoke`);
}

export async function regenerateAccountingDocumentShare(id: string): Promise<{ shareToken: string }> {
    const res = await api.post(`/accounting-documents/${id}/share/regenerate`);
    return res.data;
}

/** Печатная форма открывается в новой вкладке — как «Печать» в 1С. */
export function openAccountingDocumentPdf(id: string) {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    window.open(`${base}/accounting-documents/${id}/pdf`, '_blank', 'noopener');
}
