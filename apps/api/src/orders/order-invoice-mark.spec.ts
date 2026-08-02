import { invoiceMarks } from './order-invoice-mark';

/**
 * Отметка «по рейсу выставлен счёт».
 *
 * Просьба бухгалтера. Ошибка здесь дорогая в обе стороны: сказать «счёт
 * есть», когда его нет, — значит не получить деньги; сказать «счёта нет»,
 * когда он есть, — значит выставить второй и объясняться с клиентом.
 */

const doc = (over: Partial<any> = {}) => ({
    document: {
        id: 'д-1', number: 'АВ00010002', type: 'PAYMENT_INVOICE',
        direction: 'OUTGOING', status: 'POSTED', documentDate: new Date('2026-07-27'),
        ...over,
    },
});

describe('Отметка «счёт выставлен»', () => {
    it('без документов рейс считается невыставленным', () => {
        expect(invoiceMarks([]).isInvoiced).toBe(false);
        expect(invoiceMarks(null).isInvoiced).toBe(false);
        expect(invoiceMarks(undefined).isInvoiced).toBe(false);
    });

    it('проведённый счёт клиенту — рейс выставлен, номер виден', () => {
        const mark = invoiceMarks([doc()]);
        expect(mark.isInvoiced).toBe(true);
        expect(mark.invoiceNumbers).toEqual(['АВ00010002']);
    });

    it('счёт ОТ перевозчика выставленным не считается', () => {
        // Входящий счёт — это наш расход. Засчитать его значит показать
        // «счёт есть» там, где клиенту ещё ничего не выставлено, и
        // оставить рейс без оплаты.
        expect(invoiceMarks([doc({ direction: 'INCOMING' })]).isInvoiced).toBe(false);
    });

    it('акт выполненных работ счётом не считается', () => {
        expect(invoiceMarks([doc({ type: 'SERVICE_ACT' })]).isInvoiced).toBe(false);
    });

    it('отменённый счёт возвращает рейс в невыставленные', () => {
        expect(invoiceMarks([doc({ status: 'CANCELLED' })]).isInvoiced).toBe(false);
    });

    it('черновик — не выставлен, но о нём сказано отдельно', () => {
        // Молчать нельзя: бухгалтер заведёт второй счёт по тому же рейсу.
        const mark = invoiceMarks([doc({ status: 'DRAFT' })]);
        expect(mark.isInvoiced).toBe(false);
        expect(mark.hasDraftInvoice).toBe(true);
    });

    it('если есть и черновик, и проведённый — рейс выставлен', () => {
        const mark = invoiceMarks([doc({ status: 'DRAFT', id: 'д-2' }), doc()]);
        expect(mark.isInvoiced).toBe(true);
        expect(mark.hasDraftInvoice).toBe(false);
    });

    it('рейс, разделённый на два счёта, показывает оба номера', () => {
        // Бухгалтер прямо говорила: «я делю счёт на два».
        const mark = invoiceMarks([doc(), doc({ id: 'д-2', number: 'АВ00010003' })]);
        expect(mark.invoiceNumbers).toEqual(['АВ00010002', 'АВ00010003']);
    });

    it('счёт без номера не ломает список номеров', () => {
        const mark = invoiceMarks([doc({ number: null })]);
        expect(mark.isInvoiced).toBe(true);
        expect(mark.invoiceNumbers).toEqual([]);
    });
});
