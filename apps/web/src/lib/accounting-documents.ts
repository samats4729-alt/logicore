import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { DOCUMENT_STATUS_LABELS } from '@/lib/vocabulary';

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
/** Подписи берутся из общего словаря — см. `lib/vocabulary`. */
export const ACCOUNTING_DOCUMENT_STATUS_LABELS: Record<AccountingDocumentStatus, string> =
    DOCUMENT_STATUS_LABELS as Record<AccountingDocumentStatus, string>;

export interface AccountingDocumentParty {
    id: string;
    name: string | null;
    bin: string | null;
}

export interface AccountingDocumentRoutePoint {
    pointType: string;
    sequence: number;
    location: { city: string | null; address: string } | null;
}

/**
 * Заявка-основание документа. В журнале приходит только номер, в карточке —
 * ещё маршрут, водитель и авто: в 1С под «Документом-основанием» второй
 * строкой печатается расшифровка, и бухгалтеру она нужна, чтобы не открывать
 * заявку ради проверки.
 */
export interface AccountingDocumentOrderRef {
    order: {
        id: string;
        orderNumber: string;
        status?: string;
        cargoDescription?: string | null;
        assignedDriverName?: string | null;
        assignedDriverPlate?: string | null;
        routePoints?: AccountingDocumentRoutePoint[];
    };
}

/** «Алматы → Астана» по точкам маршрута заявки. */
export function orderRouteLabel(order: AccountingDocumentOrderRef['order']): string | null {
    const points = order.routePoints || [];
    if (!points.length) return null;
    const place = (point: AccountingDocumentRoutePoint) =>
        point.location?.city || point.location?.address || null;
    const from = place(points[0]);
    const to = place(points[points.length - 1]);
    if (!from && !to) return null;
    return points.length === 1 ? from : `${from || '—'} → ${to || '—'}`;
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

export type AccountingVatTreatment = 'STANDARD' | 'WITHOUT_VAT' | 'EXEMPT' | 'ZERO_RATE';
export type AccountingVatCalculation = 'INCLUDED' | 'ADDED';

export interface AccountingDocumentLine {
    id: string;
    lineNumber: number;
    serviceCode: string | null;
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    discountAmount: number;
    vatTreatment: AccountingVatTreatment;
    vatCalculation: AccountingVatCalculation;
    vatRate: number;
    vatAmount: number;
    subtotal: number;
    total: number;
    orderId: string | null;
}

export interface AccountingDocumentDetails extends AccountingDocumentListItem {
    /**
     * Курс, зафиксированный в документе, и итог в учётной валюте.
     *
     * Пусто у тенговых документов: тенге к тенге всегда один, и курс там не
     * нужен. У валютного пусто означает, что курса на дату документа нет —
     * такой счёт не проводится.
     */
    exchangeRate?: number | null;
    exchangeRateDate?: string | null;
    totalBase?: number | null;
    subtotal: number;
    vatTotal: number;
    discountTotal: number;
    note: string | null;
    paymentTerms: string | null;
    externalNumber: string | null;
    externalDate: string | null;
    bankAccountId: string | null;
    operationDate: string | null;
    postedAt: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    company: AccountingDocumentParty | null;
    issuerSnapshot: Record<string, any>;
    recipientSnapshot: Record<string, any>;
    lines: AccountingDocumentLine[];
    createdBy?: { id: string; firstName: string | null; lastName: string | null };
    postedBy?: { id: string; firstName: string | null; lastName: string | null } | null;
    cancelledBy?: { id: string; firstName: string | null; lastName: string | null } | null;
    /** Чем закрыт счёт: платежи и курсовая разница по каждому из них. */
    paymentAllocations?: DocumentPaymentAllocation[];
}

/**
 * Оплата счёта одним платежом.
 *
 * `amount` — сколько долга закрыто, в валюте счёта. `amountBase` — сколько на
 * это ушло тенге. `exchangeDiff` — разница между этими тенге и теми, что были
 * записаны в счёте при проведении: счёт выставили по одному курсу, деньги
 * пришли по другому.
 */
export interface DocumentPaymentAllocation {
    id: string;
    amount: number;
    amountBase: number | null;
    exchangeDiff: number | null;
    createdAt: string;
    payment: {
        id: string;
        date: string;
        amount: number;
        currency: string;
        exchangeRate: number | null;
        method: string;
        note: string | null;
    };
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
    /** Организация журнала. Пусто — активная компания сессии. */
    companyId?: string;
    type?: AccountingDocumentType;
    direction?: AccountingDocumentDirection;
    status?: AccountingDocumentStatus;
    counterpartyId?: string;
    /** Документы конкретной заявки — цепочка документов рейса. */
    orderId?: string;
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
    serviceCode?: string;
    name: string;
    description?: string;
    quantity?: string;
    unit?: string;
    unitPrice: string;
    discountAmount?: string;
    /**
     * НДС описывается тремя полями, а не одной ставкой: API отклоняет ставку
     * без `vatTreatment: 'STANDARD'` и наоборот — обычный НДС без ставки.
     */
    vatTreatment?: AccountingVatTreatment;
    vatCalculation?: AccountingVatCalculation;
    vatRate?: string;
    orderId?: string;
}

export interface CreateAccountingDocumentInput {
    type: AccountingDocumentType;
    direction: AccountingDocumentDirection;
    counterpartyId: string;
    documentDate: string;
    /** Валюта документа, три буквы по ISO. По умолчанию тенге. */
    currency?: string;
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

/** Виды документов, которые выставляются по рейсу и образуют его цепочку. */
export type OrderChainDocumentType = Extract<
    AccountingDocumentType,
    'PAYMENT_INVOICE' | 'SERVICE_ACT'
>;

/** Заявка как основание документа: из неё собирается строка черновика. */
export interface OrderDocumentBasis {
    orderId: string;
    counterpartyId: string;
    /** Сумма к выставлению — цена заказчика по заявке. */
    amount: number;
    hasVat?: boolean;
    vatRate?: number | string | null;
    serviceName?: string;
}

export interface OrderDocumentResult {
    document: AccountingDocumentListItem | AccountingDocumentDetails;
    /** false — документ по рейсу уже был, открываем его. */
    created: boolean;
}

/**
 * «Ввод на основании» из карточки рейса: открыть уже выставленный документ
 * этого вида или создать черновик со строкой из заявки.
 *
 * Второй документ того же вида по одному рейсу не создаётся — иначе
 * контрагент получит два счёта за одну перевозку. Отменённый документ
 * основанием не считается: после отмены счёт выставляют заново.
 */
export async function findOrCreateOrderDocument(
    type: OrderChainDocumentType,
    basis: OrderDocumentBasis,
): Promise<OrderDocumentResult> {
    const existing = await fetchAccountingDocuments({ type, orderId: basis.orderId, limit: 20 });
    const active = existing.data.find((document) => document.status !== 'CANCELLED');
    if (active) return { document: active, created: false };

    // НДС описывается тремя полями сразу — см. CreateAccountingDocumentLineInput.
    const vat = basis.hasVat && Number(basis.vatRate) > 0
        ? {
            vatTreatment: 'STANDARD' as const,
            vatCalculation: 'INCLUDED' as const,
            vatRate: String(basis.vatRate),
        }
        : {};

    const document = await createAccountingDocument({
        type,
        direction: 'OUTGOING',
        counterpartyId: basis.counterpartyId,
        documentDate: dayjs().format('YYYY-MM-DD'),
        lines: [{
            name: basis.serviceName || 'Транспортные услуги',
            quantity: '1',
            unit: 'усл',
            unitPrice: basis.amount.toFixed(2),
            ...vat,
            orderId: basis.orderId,
        }],
    });
    return { document, created: true };
}

/**
 * «Создать акт на основании счёта» — вход из документа в документ.
 *
 * Строки и рейсы переносятся из счёта: акт закрывает ровно то, что
 * выставлено, и бухгалтеру не приходится набирать услуги второй раз.
 * Если акт по рейсу счёта уже есть, открываем его — иначе по одной
 * перевозке уедут два акта.
 */
export async function createServiceActFromInvoice(
    invoice: AccountingDocumentDetails,
): Promise<OrderDocumentResult> {
    const counterpartyId = invoice.counterparty?.id;
    if (!counterpartyId) throw new Error('У счёта не указан контрагент');

    const orderIds = Array.from(new Set((invoice.orders ?? []).map((link) => link.order.id)));
    for (const orderId of orderIds) {
        const existing = await fetchAccountingDocuments({
            type: 'SERVICE_ACT',
            orderId,
            limit: 20,
        });
        const active = existing.data.find((document) => document.status !== 'CANCELLED');
        if (active) return { document: active, created: false };
    }

    const document = await createAccountingDocument({
        type: 'SERVICE_ACT',
        direction: invoice.direction,
        counterpartyId,
        documentDate: dayjs().format('YYYY-MM-DD'),
        note: `Основание: счёт № ${invoice.number}`,
        lines: invoice.lines.map((line) => ({
            ...(line.serviceCode ? { serviceCode: line.serviceCode } : {}),
            name: line.name,
            ...(line.description ? { description: line.description } : {}),
            quantity: String(line.quantity ?? 1),
            unit: line.unit?.trim() || 'усл',
            unitPrice: (line.unitPrice ?? 0).toFixed(2),
            // Набор полей НДС повторяет карточку документа: API отклоняет
            // ставку без STANDARD и STANDARD без ставки.
            ...(line.vatTreatment === 'STANDARD' && Number(line.vatRate) > 0
                ? {
                    vatTreatment: 'STANDARD' as const,
                    vatCalculation: line.vatCalculation,
                    vatRate: String(line.vatRate),
                }
                : {}),
            ...(line.orderId ? { orderId: line.orderId } : {}),
        })),
        orderIds,
    });
    return { document, created: true };
}

/**
 * Разделы веба с карточкой документа. Акта сверки здесь нет: он живёт на
 * своей странице `accounting/reconciliation-act` и с рейсом не связан.
 */
export const ACCOUNTING_DOCUMENT_ROUTES: Record<OrderChainDocumentType, string> = {
    PAYMENT_INVOICE: '/company/accounting/invoices',
    SERVICE_ACT: '/company/accounting/acts',
};

export function accountingDocumentHref(document: {
    id: string;
    type: OrderChainDocumentType;
}): string {
    return `${ACCOUNTING_DOCUMENT_ROUTES[document.type]}/${document.id}`;
}

/**
 * Правка черновика («Записать» в карточке). Передаются только изменённые
 * поля; массив `lines` заменяет строки документа целиком.
 */
export interface UpdateAccountingDocumentInput {
    documentDate?: string;
    dueDate?: string | null;
    operationDate?: string | null;
    bankAccountId?: string | null;
    externalNumber?: string | null;
    externalDate?: string | null;
    paymentTerms?: string | null;
    note?: string | null;
    lines?: CreateAccountingDocumentLineInput[];
    orderIds?: string[];
}

export async function updateAccountingDocument(
    id: string,
    input: UpdateAccountingDocumentInput,
): Promise<AccountingDocumentDetails> {
    const res = await api.patch(`/accounting-documents/${id}`, input);
    return res.data;
}

/**
 * Заявка, на которую счёт ещё не выставлен — строка окна «Подобрать по
 * заявкам». Сумма и ставка НДС уже посчитаны сервером под направление
 * документа: заказчику идёт его цена, поставщику — стоимость исполнителя.
 */
export interface BillableOrder {
    id: string;
    orderNumber: string;
    status: string;
    createdAt: string;
    cargoDescription: string | null;
    currency: string;
    amount: number;
    hasVat: boolean;
    vatRate: number;
    /**
     * Сколько по рейсу уходит перевозчику и включена ли у компании
     * экспедиторская схема НДС. Нужны, чтобы разделить счёт клиенту на
     * возмещение расходов и вознаграждение.
     */
    carrierCost?: number;
    forwardingVat?: boolean;
    assignedDriverName: string | null;
    assignedDriverPlate: string | null;
    routePoints: AccountingDocumentRoutePoint[];
}

export async function fetchBillableOrders(params: {
    /** Счёт (по умолчанию) или акт — у них разные списки занятых заявок. */
    type?: AccountingDocumentType;
    direction: AccountingDocumentDirection;
    counterpartyId: string;
    includeInProgress?: boolean;
}): Promise<BillableOrder[]> {
    const res = await api.get('/accounting-documents/billable-orders', { params });
    return res.data;
}

/** «Алматы → Астана» по точкам маршрута заявки подбора. */
export function routePointsLabel(points: AccountingDocumentRoutePoint[] | undefined): string | null {
    return orderRouteLabel({ id: '', orderNumber: '', routePoints: points });
}

export interface CompanyBankAccount {
    id: string;
    name: string;
    kind: 'CASH' | 'BANK';
    isDefault: boolean;
    isActive: boolean;
    iban: string | null;
    bankName: string | null;
    bankBic: string | null;
    kbe: string | null;
}

/**
 * Расчётные счета организации для выбора в шапке документа. Кассы отброшены:
 * в счёте на оплату печатаются банковские реквизиты, платить в кассу
 * контрагент по этому документу не может.
 */
export async function fetchCompanyBankAccounts(): Promise<CompanyBankAccount[]> {
    const res = await api.get('/accounting/finance-accounts');
    return (res.data || []).filter((account: CompanyBankAccount) => account.kind === 'BANK');
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

/**
 * Печатная форма открывается в новой вкладке — как «Печать» в 1С.
 *
 * `withStamp` — флажок «Подпись и печать». По умолчанию форма чистая, под
 * живую подпись; печать ставится только своей стороне и только на
 * исходящий документ.
 */
export function openAccountingDocumentPdf(id: string, withStamp = false) {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const query = withStamp ? '?withStamp=true' : '';
    window.open(`${base}/accounting-documents/${id}/pdf${query}`, '_blank', 'noopener');
}

export interface AccountingRegistryParams {
    companyId?: string;
    type?: AccountingDocumentType;
    direction?: AccountingDocumentDirection;
    status?: AccountingDocumentStatus;
    counterpartyId?: string;
    from?: string;
    to?: string;
    /** Отмеченные строки журнала — печать выбранных. */
    ids?: string[];
}

/**
 * «Печать → Реестр документов»: журнал за период на бумаге.
 *
 * Фильтры передаются те же, что показаны на экране, — печатается ровно
 * видимая выборка, а не весь журнал.
 */
export function openAccountingRegistryPdf(params: AccountingRegistryParams) {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const query = new URLSearchParams();
    if (params.companyId) query.set('companyId', params.companyId);
    if (params.type) query.set('type', params.type);
    if (params.direction) query.set('direction', params.direction);
    if (params.status) query.set('status', params.status);
    if (params.counterpartyId) query.set('counterpartyId', params.counterpartyId);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    // Повторяющийся параметр — так его разбирает DTO реестра.
    for (const id of params.ids ?? []) query.append('ids', id);
    window.open(`${base}/accounting-documents/registry/pdf?${query.toString()}`, '_blank', 'noopener');
}

/**
 * Разнесение платежа по счетам.
 *
 * Пока платёж не разнесён, он висит «общей суммой» на контрагенте: видно,
 * что деньги пришли, но непонятно, какие счета закрыты.
 */
export interface AllocationSuggestionItem {
    documentId: string;
    number: string;
    documentDate: string;
    dueDate: string | null;
    total: number;
    amountPaid: number;
    balanceDue: number;
    suggestedAmount: number;
}

export interface AllocationSuggestion {
    documents: AllocationSuggestionItem[];
    /** Не легло ни на один счёт — аванс или переплата. */
    unallocated: number;
}

export async function suggestAllocation(params: {
    counterpartyId: string;
    direction: 'IN' | 'OUT';
    amount: string;
}): Promise<AllocationSuggestion> {
    const res = await api.get('/accounting-documents/allocation-suggestion', { params });
    return res.data;
}

export async function applyAllocations(
    paymentId: string,
    allocations: { documentId: string; amount: string }[],
): Promise<{ allocated: number; documents: number }> {
    const res = await api.post(`/accounting-documents/payments/${paymentId}/allocations`, {
        allocations,
    });
    return res.data;
}
