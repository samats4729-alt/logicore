import { PendingWorkService } from './pending-work.service';

const COMPANY = 'company-1';
const CUSTOMER = 'company-2';

/**
 * Заявки и документы «как в базе»: каждый рейс со списком выставленных по
 * нему документов. Фильтрацию Prisma здесь воспроизводим руками — иначе
 * тест проверял бы мок, а не правило отбора.
 */
const ORDERS = [
    // Завершён, акта нет — висяк №1.
    { id: 'o1', orderNumber: 'ЗК-001', status: 'COMPLETED', customerPrice: 100000, docs: [] },
    // Завершён, акт есть, счёта нет — висяк №2.
    { id: 'o2', orderNumber: 'ЗК-002', status: 'COMPLETED', customerPrice: 200000, docs: ['SERVICE_ACT'] },
    // Завершён, всё оформлено — не висяк.
    { id: 'o3', orderNumber: 'ЗК-003', status: 'COMPLETED', customerPrice: 300000, docs: ['SERVICE_ACT', 'PAYMENT_INVOICE'] },
    // Ещё в пути — актировать нечего, не висяк.
    { id: 'o4', orderNumber: 'ЗК-004', status: 'IN_TRANSIT', customerPrice: 400000, docs: [] },
    // Завершён, акт был, но отменён — снова висяк №1.
    { id: 'o5', orderNumber: 'ЗК-005', status: 'COMPLETED', customerPrice: 500000, docs: ['SERVICE_ACT:CANCELLED'] },
];

const INVOICES = [
    // Просрочен и не оплачен — висяк №3.
    { id: 'd1', number: 'СЧ-001', status: 'POSTED', dueDate: '2026-06-01', balanceDue: 150000 },
    // Просрочен, но оплачен полностью — не висяк.
    { id: 'd2', number: 'СЧ-002', status: 'POSTED', dueDate: '2026-06-10', balanceDue: 0 },
    // Срок ещё не наступил — не висяк.
    { id: 'd3', number: 'СЧ-003', status: 'POSTED', dueDate: '2027-01-01', balanceDue: 700000 },
    // Черновик: никому не отправлен, просрочки нет.
    { id: 'd4', number: 'СЧ-004', status: 'DRAFT', dueDate: '2026-05-01', balanceDue: 900000 },
];

/** Живым считается документ вида `type`, если он не отменён. */
function hasLiveDoc(docs: string[], type: string) {
    return docs.some((entry) => entry === type);
}

function makePrisma() {
    return {
        order: {
            findMany: jest.fn(async ({ where }: any) => {
                const wantsAct = where.accountingDocuments?.some;
                const noneType = where.accountingDocuments?.none
                    ? 'SERVICE_ACT'
                    : where.AND?.[0]?.accountingDocuments?.none
                        ? 'PAYMENT_INVOICE'
                        : null;

                return ORDERS
                    .filter((order) => (where.status ? order.status === where.status : true))
                    .filter((order) => (wantsAct ? hasLiveDoc(order.docs, 'SERVICE_ACT') : true))
                    .filter((order) => {
                        if (!noneType) return true;
                        return !hasLiveDoc(order.docs, noneType);
                    })
                    .map((order) => ({
                        id: order.id,
                        orderNumber: order.orderNumber,
                        customerPrice: order.customerPrice,
                        updatedAt: new Date('2026-07-01'),
                        customerCompany: { name: 'ТОО «Заказчик»' },
                    }));
            }),
        },
        accountingDocument: {
            findMany: jest.fn(async ({ where }: any) => INVOICES
                .filter((invoice) => invoice.status === where.status)
                .filter((invoice) => new Date(invoice.dueDate) < where.dueDate.lt)
                .filter((invoice) => invoice.balanceDue > where.balanceDue.gt)
                .map((invoice) => ({
                    id: invoice.id,
                    number: invoice.number,
                    dueDate: new Date(invoice.dueDate),
                    balanceDue: invoice.balanceDue,
                    counterparty: { name: 'ТОО «Заказчик»' },
                }))),
        },
    } as any;
}

describe('PendingWorkService — висяки для дашборда', () => {
    // Приёмочный критерий T-09: список на дашборде совпадает с ручным
    // подсчётом по таблицам выше.
    it('находит завершённые рейсы без акта', async () => {
        const service = new PendingWorkService(makePrisma());

        const { ordersWithoutAct } = await service.getPendingWork(COMPANY);

        // Руками: ЗК-001 (акта нет) и ЗК-005 (акт отменён).
        expect(ordersWithoutAct.count).toBe(2);
        expect(ordersWithoutAct.items.map((i) => i.label)).toEqual(['ЗК-001', 'ЗК-005']);
        expect(ordersWithoutAct.total).toBe(600000);
    });

    it('не считает висяком рейс, который ещё едет', async () => {
        const service = new PendingWorkService(makePrisma());

        const { ordersWithoutAct } = await service.getPendingWork(COMPANY);

        // ЗК-004 в пути: услуга не оказана, актировать нечего.
        expect(ordersWithoutAct.items.map((i) => i.label)).not.toContain('ЗК-004');
    });

    it('находит рейсы с актом, но без счёта', async () => {
        const service = new PendingWorkService(makePrisma());

        const { actsWithoutInvoice } = await service.getPendingWork(COMPANY);

        // Руками: только ЗК-002 — у ЗК-003 счёт уже есть.
        expect(actsWithoutInvoice.count).toBe(1);
        expect(actsWithoutInvoice.items[0].label).toBe('ЗК-002');
        expect(actsWithoutInvoice.total).toBe(200000);
    });

    it('находит просроченные неоплаченные счета', async () => {
        const service = new PendingWorkService(makePrisma());

        const { overdueInvoices } = await service.getPendingWork(COMPANY);

        // Руками: только СЧ-001. СЧ-002 оплачен, у СЧ-003 срок не вышел,
        // СЧ-004 — черновик.
        expect(overdueInvoices.count).toBe(1);
        expect(overdueInvoices.items[0].label).toBe('СЧ-001');
        expect(overdueInvoices.total).toBe(150000);
    });

    it('отменённый документ висяк не закрывает', async () => {
        const prisma = makePrisma();
        const service = new PendingWorkService(prisma);

        await service.getPendingWork(COMPANY);

        // В отборе документов явно исключён только CANCELLED — иначе
        // ошибочно отменённый акт навсегда прятал бы рейс из висяков.
        const call = prisma.order.findMany.mock.calls[0][0];
        expect(call.where.accountingDocuments.none.document.status).toEqual({ not: 'CANCELLED' });
    });

    it('берёт только исходящие документы своей компании', async () => {
        const prisma = makePrisma();
        const service = new PendingWorkService(prisma);

        await service.getPendingWork(COMPANY);

        const orderCall = prisma.order.findMany.mock.calls[0][0];
        expect(orderCall.where.accountingDocuments.none.document).toMatchObject({
            companyId: COMPANY,
            direction: 'OUTGOING',
        });

        const invoiceCall = prisma.accountingDocument.findMany.mock.calls[0][0];
        expect(invoiceCall.where).toMatchObject({
            companyId: COMPANY,
            direction: 'OUTGOING',
            type: 'PAYMENT_INVOICE',
        });
    });

    it('не берёт рейсы, где заказчик — мы сами', async () => {
        const prisma = makePrisma();
        const service = new PendingWorkService(prisma);

        await service.getPendingWork(COMPANY);

        const call = prisma.order.findMany.mock.calls[0][0];
        expect(call.where.NOT).toEqual({ customerCompanyId: COMPANY });
        expect(call.where.customerCompanyId).toEqual({ not: null });
        expect(call.where.OR).toEqual(expect.arrayContaining([{ forwarderId: COMPANY }]));
    });

    it('считает, сколько дней висит', async () => {
        const service = new PendingWorkService(makePrisma());

        const { ordersWithoutAct } = await service.getPendingWork(COMPANY);

        // Рейс обновлён 01.07.2026 — с тех пор прошло больше суток.
        expect(ordersWithoutAct.items[0].daysWaiting).toBeGreaterThan(0);
    });
});

// Ссылка на CUSTOMER нужна, чтобы имя контрагента в наборе читалось.
void CUSTOMER;
