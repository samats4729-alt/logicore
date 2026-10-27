import { BadRequestException } from '@nestjs/common';
import { OrderContractAutoService } from './order-contract-auto.service';

/** Договор-заявка перевозчику — сама, по каждой сделке (A14). */
describe('договор-заявка автоматически', () => {
    const actor = { sub: 'u1', firstName: 'Евгений', lastName: 'Админ', role: 'COMPANY_ADMIN' };

    function setup(opts: { auto?: boolean; order?: Record<string, any> | null; last?: any; sendError?: Error } = {}) {
        const prisma: any = {
            company: { findUnique: jest.fn().mockResolvedValue({ autoContractRequest: opts.auto ?? true }) },
            order: {
                findUnique: jest.fn().mockResolvedValue(opts.order === null ? null : {
                    status: 'ASSIGNED', subForwarderId: null, partnerId: 'carrier-1', driverCost: 300000, subForwarderPrice: null,
                    ...opts.order,
                }),
            },
            orderDocument: { findFirst: jest.fn().mockResolvedValue(opts.last ?? null) },
        };
        const documents: any = {
            form: jest.fn().mockResolvedValue({ id: 'doc-1', version: 1, status: 'DRAFT' }),
            post: jest.fn().mockResolvedValue({}),
            send: opts.sendError
                ? jest.fn().mockRejectedValue(opts.sendError)
                : jest.fn().mockResolvedValue({ sentTo: 'ТОО «Алтын Жол» (кабинет на платформе)' }),
        };
        const audit: any = { log: jest.fn() };
        return { service: new OrderContractAutoService(prisma, documents, audit), prisma, documents, audit };
    }

    it('галочка выключена — ничего не делаем', async () => {
        const { service, documents } = setup({ auto: false });
        await expect(service.run('o1', 'us', actor)).resolves.toBe('SKIPPED');
        expect(documents.form).not.toHaveBeenCalled();
    });

    it('есть перевозчик и ставка — формирует, проводит без бухгалтера и отправляет; в истории рейса след', async () => {
        const { service, documents, audit } = setup();
        await expect(service.run('o1', 'us', actor)).resolves.toBe('SENT');
        expect(documents.form).toHaveBeenCalledWith('CONTRACT', 'o1', 'us', 'u1');
        expect(documents.post).toHaveBeenCalledWith('doc-1', 'us', 'u1');
        expect(documents.send).toHaveBeenCalledWith('doc-1', 'us', 'u1');
        expect(audit.log.mock.calls[0][0]).toEqual(expect.objectContaining({
            orderId: 'o1', entity: 'order_document',
            entityLabel: 'Договор-заявка, версия 1, отправлена автоматически: ТОО «Алтын Жол» (кабинет на платформе)',
        }));
    });

    it('нет перевозчика, нет ставки, черновик или отмена — не сделка', async () => {
        for (const order of [
            { partnerId: null }, { partnerId: 'us' }, { driverCost: null }, { driverCost: 0 },
            { status: 'DRAFT' }, { status: 'CANCELLED' }, { status: 'COMPLETED' },
        ]) {
            const { service, documents } = setup({ order });
            await expect(service.run('o1', 'us', actor)).resolves.toBe('SKIPPED');
            expect(documents.form).not.toHaveBeenCalled();
        }
        // Субэкспедитор со своей ценой — тоже сделка.
        const { service } = setup({ order: { partnerId: null, subForwarderId: 'sub-1', driverCost: null, subForwarderPrice: 250000 } });
        await expect(service.run('o1', 'us', actor)).resolves.toBe('SENT');
    });

    it('этому перевозчику уже оформлен — второй не шлём; сменился перевозчик — новому свой', async () => {
        const same = setup({ last: { recipientCounterpartyId: 'carrier-1' } });
        await expect(same.service.run('o1', 'us', actor)).resolves.toBe('SKIPPED');
        const other = setup({ last: { recipientCounterpartyId: 'carrier-0' } });
        await expect(other.service.run('o1', 'us', actor)).resolves.toBe('SENT');
    });

    it('отправить некуда — документ проведён, причина в истории рейса, сделка не ломается', async () => {
        const { service, documents, audit } = setup({
            sendError: new BadRequestException('У «ИП Береке» нет кабинета на платформе и не указана почта.'),
        });
        await expect(service.run('o1', 'us', actor)).resolves.toBe('NOT_SENT');
        expect(documents.post).toHaveBeenCalled();
        expect(audit.log.mock.calls[0][0].entityLabel).toMatch(/сформирована автоматически, но не отправлена: У «ИП Береке» нет кабинета/);
    });
});
