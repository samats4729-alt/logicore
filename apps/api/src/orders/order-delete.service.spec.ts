import { OrderDeleteService } from './order-delete.service';

const NAMES: Record<string, string> = { 'заказчик': 'ТОО «Заказчик»', 'мы': 'ТОО «Экспедитор»', 'парк': 'ТОО «Парк»' };

function build(
    order: any = { id: 'o-1', orderNumber: '000000031', status: 'ASSIGNED', forwarderId: 'мы', customerCompanyId: 'заказчик' },
    counts: Record<string, number> = {},
    registered: string[] = [],
) {
    const count = (k: string) => ({ count: jest.fn(async () => counts[k] ?? 0), deleteMany: jest.fn() });
    let request: any = null;
    const prisma: any = {
        order: { findUnique: jest.fn().mockResolvedValue(order), delete: jest.fn() },
        payment: count('payment'), paymentOrderShare: count('share'), income: count('income'), expense: count('expense'),
        financeOperation: count('op'), accountingDocumentOrder: count('doc'), accountingDocumentLine: count('line'),
        bonus: count('bonus'), payrollAccrual: count('accrual'), driverPayoutItem: count('payout'),
        exchangeFuelIssue: count('given'), exchangeFuelReceipt: count('receipt'),
        document: count('file'), gpsPoint: count('gps'), warehouseQueueItem: count('queue'),
        company: {
            findMany: jest.fn(async ({ where }: any) => (where.isExternal === false
                ? where.id.in.filter((id: string) => registered.includes(id)).map((id: string) => ({ id }))
                : where.id.in.map((id: string) => ({ id, name: NAMES[id] ?? id })))),
        },
        orderDeleteRequest: {
            findUnique: jest.fn(async () => request),
            create: jest.fn(async ({ data }: any) => (request = { id: 'r-1', approvedCompanyIds: [], createdAt: new Date(), ...data })),
            update: jest.fn(async ({ data }: any) => (request = { ...request, ...data })),
            delete: jest.fn(async () => { request = null; }),
        },
        orderStatusHistory: { create: jest.fn() },
        $transaction: jest.fn(async (ops: any[]) => ops),
    };
    const notifications: any = { notifyCompany: jest.fn() };
    return { service: new OrderDeleteService(prisma, notifications), prisma, notifications, request: () => request };
}

/** Удаление заявки (задачи шефа, A12): только без денег и учётных документов, только хозяином. */
describe('Удаление заявки', () => {
    it('заявка без денег — удаляется вместе с файлами, точками GPS и очередью склада', async () => {
        const { service, prisma } = build();
        await expect(service.delete('o-1', 'мы', 'COMPANY_ADMIN')).resolves.toMatchObject({ ok: true, orderNumber: '000000031', deleted: true });
        expect(prisma.document.deleteMany).toHaveBeenCalledWith({ where: { orderId: 'o-1' } });
        expect(prisma.order.delete).toHaveBeenCalledWith({ where: { id: 'o-1' } });
    });

    it('есть платёж или счёт — удалить нельзя, только отменить', async () => {
        const { service, prisma } = build(undefined, { payment: 1, doc: 1 });
        await expect(service.delete('o-1', 'мы', 'COMPANY_ADMIN')).rejects.toThrow(/платежи, счета или акты — удалить её нельзя.*отменить/);
        expect(prisma.order.delete).not.toHaveBeenCalled();
    });

    it('парк выдал водителю топливо или предоплату, есть чек — удалить нельзя: деньги водителя пропали бы из расчёта', async () => {
        const { service, prisma } = build(undefined, { given: 2, receipt: 1 });
        await expect(service.delete('o-1', 'мы', 'COMPANY_ADMIN')).rejects.toThrow(/выдачи водителю \(топливо, предоплата\), чеки на топливо/);
        expect(prisma.order.delete).not.toHaveBeenCalled();
    });

    it('чужая заявка (мы перевозчик, а не экспедитор) — нельзя', async () => {
        const { service } = build();
        await expect(service.delete('o-1', 'перевозчик', 'COMPANY_ADMIN')).rejects.toThrow(/экспедитор этой заявки/);
    });

    it('заявка без экспедитора — удаляет заказчик, который её завёл', async () => {
        const { service } = build({ id: 'o-1', orderNumber: '1', status: 'NEW', forwarderId: null, customerCompanyId: 'заказчик' });
        await expect(service.delete('o-1', 'заказчик', 'LOGISTICIAN')).resolves.toMatchObject({ ok: true, deleted: true });
    });
});

/**
 * Запрос на удаление (владелец, 29.10.2026): заказчик выставил заявку на
 * биржу, парк взял её и назначил водителя — и заказчик удалил её молча.
 * Теперь при другой стороне в LogiCore удаление — запрос, удаляется с согласия.
 */
describe('Запрос на удаление заявки', () => {
    const exchangeOrder = { id: 'o-1', orderNumber: '000000001', status: 'ASSIGNED', forwarderId: null, customerCompanyId: 'заказчик', subForwarderId: 'парк', partnerId: null };

    it('случай владельца: заказчик удаляет заявку, которую взял парк, — заявка остаётся, парку уходит запрос', async () => {
        const { service, prisma, notifications, request } = build(exchangeOrder, {}, ['заказчик', 'парк']);
        const r = await service.delete('o-1', 'заказчик', 'COMPANY_ADMIN', 'u-1', ' тестовая ');
        expect(r).toEqual({ ok: true, orderNumber: '000000001', deleted: false, waitingFor: ['ТОО «Парк»'] });
        expect(prisma.order.delete).not.toHaveBeenCalled();
        expect(request()).toMatchObject({ orderId: 'o-1', requestedByCompanyId: 'заказчик', requestedByUserId: 'u-1', reason: 'тестовая' });
        expect(notifications.notifyCompany).toHaveBeenCalledWith('парк', expect.objectContaining({
            title: 'Запрос на удаление заявки',
            body: 'Запрос на удаление заявки №000000001 от ТОО «Заказчик». Причина: тестовая. Подтвердите или отклоните запрос в карточке заявки.',
        }));
        expect(prisma.orderStatusHistory.create.mock.calls[0][0].data.comment).toBe('ТОО «Заказчик»: запрос на удаление заявки. Причина: тестовая');
    });

    it('парк соглашается — заявка удаляется, заказчику приходит весть', async () => {
        const { service, prisma, notifications } = build(exchangeOrder, {}, ['заказчик', 'парк']);
        await service.delete('o-1', 'заказчик', 'COMPANY_ADMIN');
        expect(await service.view('o-1', 'парк', 'COMPANY_ADMIN')).toMatchObject({ canAnswer: true, mine: false, requestedBy: { name: 'ТОО «Заказчик»' } });
        await expect(service.approve('o-1', 'парк', 'u-2')).resolves.toMatchObject({ deleted: true, orderNumber: '000000001' });
        expect(prisma.order.delete).toHaveBeenCalledWith({ where: { id: 'o-1' } });
        expect(notifications.notifyCompany).toHaveBeenLastCalledWith('заказчик', expect.objectContaining({
            title: 'Заявка удалена', body: 'Заявка №000000001 удалена с согласия ТОО «Парк».',
        }));
    });

    it('парк отклоняет — заявка на месте, заказчик видит отказ и причину, пока не скроет', async () => {
        const { service, prisma, notifications, request } = build(exchangeOrder, {}, ['заказчик', 'парк']);
        await service.delete('o-1', 'заказчик', 'COMPANY_ADMIN');
        await service.decline('o-1', 'парк', 'u-2', 'водитель уже едет');
        expect(prisma.order.delete).not.toHaveBeenCalled();
        expect(await service.view('o-1', 'парк', 'COMPANY_ADMIN')).toBeNull();
        expect(await service.view('o-1', 'заказчик', 'COMPANY_ADMIN')).toMatchObject({
            mine: true, canAnswer: false, declined: { by: { name: 'ТОО «Парк»' }, reason: 'водитель уже едет' },
        });
        await expect(service.approve('o-1', 'парк')).rejects.toThrow(/Запроса на удаление нет/);
        await service.withdraw('o-1', 'заказчик', 'COMPANY_ADMIN');
        expect(request()).toBeNull();
        expect(notifications.notifyCompany).toHaveBeenLastCalledWith('заказчик', expect.objectContaining({
            title: 'Запрос на удаление отклонён',
            body: 'ТОО «Парк»: запрос на удаление заявки №000000001 отклонён. Причина: водитель уже едет.',
        }));
    });

    it('после отказа можно отправить новый запрос — он заменяет отклонённый', async () => {
        const { service, request } = build(exchangeOrder, {}, ['заказчик', 'парк']);
        await service.delete('o-1', 'заказчик', 'COMPANY_ADMIN');
        await service.decline('o-1', 'парк');
        await expect(service.delete('o-1', 'заказчик', 'COMPANY_ADMIN', 'u-1', 'ещё раз')).resolves.toMatchObject({ deleted: false });
        expect(request()).toMatchObject({ reason: 'ещё раз', approvedCompanyIds: [] });
        expect(request().declinedAt).toBeUndefined();
    });

    it('отправить запрос может и парк, хотя заявку не вёл; согласие заказчика — и заявка удалена', async () => {
        const { service, prisma } = build(exchangeOrder, {}, ['заказчик', 'парк']);
        await expect(service.delete('o-1', 'парк', 'COMPANY_ADMIN')).resolves.toMatchObject({ deleted: false, waitingFor: ['ТОО «Заказчик»'] });
        await service.approve('o-1', 'заказчик');
        expect(prisma.order.delete).toHaveBeenCalled();
    });

    it('три стороны: удаляется, только когда согласились обе другие', async () => {
        const order = { ...exchangeOrder, forwarderId: 'мы' };
        const { service, prisma } = build(order, {}, ['заказчик', 'мы', 'парк']);
        await service.delete('o-1', 'мы', 'COMPANY_ADMIN');
        await expect(service.approve('o-1', 'заказчик')).resolves.toMatchObject({ deleted: false, waitingFor: ['ТОО «Парк»'] });
        expect(prisma.order.delete).not.toHaveBeenCalled();
        expect(await service.view('o-1', 'заказчик', 'COMPANY_ADMIN')).toMatchObject({ canAnswer: false, approved: [{ name: 'ТОО «Заказчик»' }] });
        await expect(service.approve('o-1', 'парк')).resolves.toMatchObject({ deleted: true });
    });

    it('ответить может только другая сторона: ни сам просивший, ни посторонний', async () => {
        const { service } = build(exchangeOrder, {}, ['заказчик', 'парк']);
        await service.delete('o-1', 'заказчик', 'COMPANY_ADMIN');
        await expect(service.approve('o-1', 'заказчик')).rejects.toThrow(/другая сторона/);
        await expect(service.decline('o-1', 'чужая')).rejects.toThrow(/другая сторона/);
    });

    it('пока ждали ответа, по заявке прошли деньги — согласие не удаляет, запрос закрыт', async () => {
        const counts: Record<string, number> = {};
        const { service, prisma, request } = build(exchangeOrder, counts, ['заказчик', 'парк']);
        await service.delete('o-1', 'заказчик', 'COMPANY_ADMIN');
        counts.payout = 1;
        await expect(service.approve('o-1', 'парк')).rejects.toThrow(/выплата водителю — удалить её нельзя, можно только отменить/);
        expect(prisma.order.delete).not.toHaveBeenCalled();
        expect(request()).toBeNull();
    });

    it('второй запрос, пока ждём ответа на первый, — нельзя', async () => {
        const { service } = build(exchangeOrder, {}, ['заказчик', 'парк']);
        await service.delete('o-1', 'заказчик', 'COMPANY_ADMIN');
        await expect(service.delete('o-1', 'заказчик', 'COMPANY_ADMIN')).rejects.toThrow(/уже отправлен/);
        await expect(service.delete('o-1', 'парк', 'COMPANY_ADMIN')).rejects.toThrow(/ответьте на него/);
    });

    it('отозвать запрос может только тот, кто его отправил', async () => {
        const { service, request } = build(exchangeOrder, {}, ['заказчик', 'парк']);
        await service.delete('o-1', 'заказчик', 'COMPANY_ADMIN');
        await expect(service.withdraw('o-1', 'парк', 'COMPANY_ADMIN')).rejects.toThrow(/только компания, которая его отправила/);
        await service.withdraw('o-1', 'заказчик', 'COMPANY_ADMIN');
        expect(request()).toBeNull();
    });

    it('администратор платформы удаляет сразу, без запроса', async () => {
        const { service, prisma } = build(exchangeOrder, {}, ['заказчик', 'парк']);
        await expect(service.delete('o-1', null, 'ADMIN')).resolves.toMatchObject({ deleted: true });
        expect(prisma.order.delete).toHaveBeenCalled();
    });

    it('постороннему окно удаления не открывается', async () => {
        const { service } = build(exchangeOrder, {}, ['заказчик', 'парк']);
        await expect(service.check('o-1', 'чужая', 'COMPANY_ADMIN')).rejects.toThrow(/Нет доступа/);
        await expect(service.check('o-1', 'заказчик', 'COMPANY_ADMIN')).resolves.toMatchObject({ canDelete: true, needsConsent: ['ТОО «Парк»'], request: null });
    });
});
