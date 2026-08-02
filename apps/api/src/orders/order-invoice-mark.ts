/**
 * Выставлен ли по рейсу счёт — отметка для журнала заявок.
 *
 * Просьба бухгалтера: «я должна знать, по каким заявкам я выставила счета,
 * по каким нет». Раньше это выяснялось только перебором документов, а у
 * одного клиента в счёте может сидеть двадцать рейсов.
 *
 * Считается по уже существующей связи документа с заявками — новых полей в
 * базе не заводим. Это важно: отдельный признак пришлось бы поддерживать
 * руками, и он разошёлся бы с правдой в первый же раз, когда счёт отменят.
 */

/** Что нам нужно знать о документе, чтобы решить, считается ли он счётом. */
export interface LinkedDocument {
    id: string;
    number: string | null;
    type: string;
    direction: string;
    status: string;
    documentDate: Date | string | null;
}

export interface InvoiceMark {
    /** Есть ли по рейсу выставленный счёт клиенту. */
    isInvoiced: boolean;
    /** Номера счетов — их может быть несколько, если рейс делили. */
    invoiceNumbers: string[];
    /** Есть ли черновик счёта: подготовлен, но ещё не выставлен. */
    hasDraftInvoice: boolean;
}

/**
 * Считается только счёт на оплату НАШЕМУ клиенту.
 *
 * Входящий счёт от перевозчика — это наш расход, а не выставленный счёт;
 * если его засчитать, бухгалтер увидит «счёт есть» там, где клиенту ещё
 * ничего не выставлено, и рейс останется неоплаченным.
 *
 * Черновик тоже не считается выставленным: он в любой момент может
 * измениться или быть удалён. Но и молчать о нём нельзя — иначе бухгалтер
 * заведёт второй счёт по тому же рейсу. Поэтому он отдельным признаком.
 */
export function invoiceMarks(
    links: { document: LinkedDocument }[] | null | undefined,
): InvoiceMark {
    const documents = (links || []).map((l) => l.document).filter(Boolean);

    const outgoingInvoices = documents.filter(
        (d) => d.type === 'PAYMENT_INVOICE' && d.direction === 'OUTGOING',
    );

    const posted = outgoingInvoices.filter((d) => d.status === 'POSTED');
    const drafts = outgoingInvoices.filter((d) => d.status === 'DRAFT');

    return {
        isInvoiced: posted.length > 0,
        invoiceNumbers: posted.map((d) => d.number).filter((n): n is string => !!n),
        hasDraftInvoice: posted.length === 0 && drafts.length > 0,
    };
}
