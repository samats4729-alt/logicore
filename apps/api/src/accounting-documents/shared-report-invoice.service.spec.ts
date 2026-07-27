import { Prisma } from '@prisma/client';
import { SharedReportInvoiceService } from './shared-report-invoice.service';
import { FinanceCalculatorService } from '../accounting/services/finance-calculator.service';

const US = 'company-us';
const CARRIER = 'company-carrier';
const STRANGER = 'company-stranger';

const D = (v: number) => new Prisma.Decimal(v);

/** Рейс, где перевозчик — субподрядчик, а платим мы. */
const ourOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'o-1',
    orderNumber: 'ЗК-001',
    status: 'COMPLETED',
    customerCompanyId: 'company-client',
    forwarderId: US,
    partnerId: null,
    subForwarderId: CARRIER,
    customerPrice: D(120000),
    subForwarderPrice: D(90000),
    driverCost: D(85000),
    routePoints: [
        { location: { city: 'Астана' } },
        { location: { city: 'Алматы' } },
    ],
    ...overrides,
});

function makeService(orders: any[], options: { hasOwner?: boolean } = {}) {
    const created: any[] = [];
    const prisma: any = {
        order: { findMany: jest.fn(async ({ where }: any) => orders.filter((o) => where.id.in.includes(o.id))) },
        user: {
            findFirst: jest.fn(async () => (options.hasOwner === false ? null : { id: 'user-buh' })),
        },
    };
    const shareLinks: any = {
        resolve: jest.fn(async () => ({
            id: 'link-1',
            companyId: US,
            companyName: 'ТОО «Мы»',
            counterpartyId: CARRIER,
            counterpartyName: 'ИП Перевозчик',
            ourRole: 'CUSTOMER',
            expiresAt: new Date(Date.now() + 86400000),
        })),
    };
    const documents: any = {
        createDraft: jest.fn(async (companyId: string, userId: string, dto: any) => {
            created.push({ companyId, userId, dto });
            return { id: 'doc-1', number: 'СЧ-2026-000001', status: 'DRAFT' };
        }),
        post: jest.fn(),
    };
    const service = new SharedReportInvoiceService(
        prisma,
        shareLinks,
        documents,
        new FinanceCalculatorService(),
    );
    return { service, prisma, shareLinks, documents, created };
}

describe('Контрагент выставляет счёт по расшаренному отчёту', () => {
    describe('что создаётся', () => {
        it('входящий счёт нашей организации от контрагента', async () => {
            const { service, created } = makeService([ourOrder()]);

            await service.createFromSharedReport('token-1', { orderIds: ['o-1'] });

            expect(created[0].companyId).toBe(US);
            expect(created[0].dto).toMatchObject({
                type: 'PAYMENT_INVOICE',
                direction: 'INCOMING',
                counterpartyId: CARRIER,
            });
        });

        it('счёт остаётся ЧЕРНОВИКОМ — проводит бухгалтер, не отправитель', async () => {
            // Запрос пришёл от человека без учётной записи. Проведённый
            // документ — это уже наше обязательство, его подтверждаем мы.
            const { service, documents } = makeService([ourOrder()]);

            const result = await service.createFromSharedReport('token-1', { orderIds: ['o-1'] });

            expect(result.status).toBe('DRAFT');
            // Главное — что документ никто не провёл по дороге: проведение
            // делает бухгалтер руками, из своей учётной записи.
            expect(documents.post).not.toHaveBeenCalled();
        });

        it('строка на каждую сделку, сумма — стоимость исполнителя', async () => {
            const { service, created } = makeService([ourOrder()]);

            const result = await service.createFromSharedReport('token-1', { orderIds: ['o-1'] });

            expect(created[0].dto.lines).toHaveLength(1);
            expect(created[0].dto.lines[0]).toMatchObject({
                name: 'Транспортные услуги по заявке №ЗК-001',
                unitPrice: '90000.00',
            });
            expect(result.total).toBe(90000);
        });

        it('маршрут попадает в строку счёта', async () => {
            const { service, created } = makeService([ourOrder()]);

            await service.createFromSharedReport('token-1', { orderIds: ['o-1'] });

            expect(created[0].dto.lines[0].description).toBe('Астана — Алматы');
        });

        it('сделки привязываются к документу', async () => {
            const { service, created } = makeService([
                ourOrder(),
                ourOrder({ id: 'o-2', orderNumber: 'ЗК-002' }),
            ]);

            await service.createFromSharedReport('token-1', { orderIds: ['o-1', 'o-2'] });

            expect(created[0].dto.orderIds).toEqual(['o-1', 'o-2']);
        });

        it('в примечании остаётся след, что счёт пришёл извне', async () => {
            // Настоящего автора у документа нет: запрос анонимный. Из
            // примечания видно, откуда он взялся.
            const { service, created } = makeService([ourOrder()]);

            await service.createFromSharedReport('token-1', { orderIds: ['o-1'] });

            expect(created[0].dto.note).toContain('выставлен контрагентом');
            expect(created[0].dto.note).toContain('ИП Перевозчик');
        });

        it('номер контрагента идёт во внешний номер, не в наш', async () => {
            const { service, created } = makeService([ourOrder()]);

            await service.createFromSharedReport('token-1', {
                orderIds: ['o-1'],
                externalNumber: ' 77/К ',
            });

            // Наш номер выдаёт наша нумерация; чужой хранится отдельно.
            expect(created[0].dto.externalNumber).toBe('77/К');
        });
    });

    describe('чего нельзя', () => {
        it('нельзя выставить счёт по чужой сделке', async () => {
            const foreign = ourOrder({
                id: 'o-x',
                orderNumber: 'ЧУЖ-001',
                forwarderId: STRANGER,
                subForwarderId: STRANGER,
            });
            const { service } = makeService([foreign]);

            await expect(service.createFromSharedReport('token-1', { orderIds: ['o-x'] }))
                .rejects.toThrow('не относится к взаиморасчётам');
        });

        it('нельзя подтянуть сделку контрагента с посторонней компанией', async () => {
            // Рейс настоящий и контрагент в нём настоящий, но везёт он не
            // нам. По нашей ссылке такую сделку выставить нельзя, иначе к
            // нам в бухгалтерию попадут чужие обязательства.
            const notOurs = ourOrder({
                id: 'o-alien',
                orderNumber: 'ЧУЖ-002',
                forwarderId: STRANGER,
                partnerId: null,
                subForwarderId: CARRIER,
                customerCompanyId: STRANGER,
            });
            const { service } = makeService([notOurs]);

            await expect(service.createFromSharedReport('token-1', { orderIds: ['o-alien'] }))
                .rejects.toThrow('не относится к взаиморасчётам');
        });

        it('нельзя подтянуть чужой рейс, где контрагент везёт постороннему', async () => {
            // Та же чужая сделка, но через вторую связку: контрагент —
            // экспедитор, а заказчик не мы.
            const notOurs = ourOrder({
                id: 'o-alien-2',
                orderNumber: 'ЧУЖ-003',
                forwarderId: CARRIER,
                partnerId: null,
                subForwarderId: null,
                customerCompanyId: STRANGER,
            });
            const { service } = makeService([notOurs]);

            await expect(service.createFromSharedReport('token-1', { orderIds: ['o-alien-2'] }))
                .rejects.toThrow('не относится к взаиморасчётам');
        });

        it('нельзя выставить счёт в НАШУ пользу от нашего имени', async () => {
            // Сделка, где платит контрагент, а не мы: выпускать по ней
            // документ от нашего имени анонимный отправитель не должен.
            const weSell = ourOrder({
                id: 'o-sell',
                orderNumber: 'ЗК-ПРОД',
                forwarderId: US,
                subForwarderId: null,
                customerCompanyId: CARRIER,
            });
            const { service } = makeService([weSell]);

            await expect(service.createFromSharedReport('token-1', { orderIds: ['o-sell'] }))
                .rejects.toThrow('не относится к взаиморасчётам');
        });

        it('пустой список сделок отклоняется', async () => {
            const { service } = makeService([ourOrder()]);

            await expect(service.createFromSharedReport('token-1', { orderIds: [] }))
                .rejects.toThrow('Отметьте хотя бы одну сделку');
        });

        it('несуществующая сделка отклоняется', async () => {
            const { service } = makeService([ourOrder()]);

            await expect(service.createFromSharedReport('token-1', { orderIds: ['o-1', 'нет-такой'] }))
                .rejects.toThrow('не найдены');
        });

        it('сделка без суммы отклоняется', async () => {
            const { service } = makeService([
                ourOrder({ subForwarderPrice: null, driverCost: null }),
            ]);

            await expect(service.createFromSharedReport('token-1', { orderIds: ['o-1'] }))
                .rejects.toThrow('сумма не указана');
        });

        it('пустая ставка перевозчика не подменяется стоимостью водителя', async () => {
            // Стоимость водителя — наша внутренняя цифра. Если ставка
            // субподрядчика не заполнена, счёт выставлять не по чему, и
            // подставлять вместо неё чужое число нельзя: контрагент увидел
            // бы в отчёте одну сумму, а в счёте другую.
            const { service } = makeService([
                ourOrder({ subForwarderPrice: null, driverCost: D(85000) }),
            ]);

            await expect(service.createFromSharedReport('token-1', { orderIds: ['o-1'] }))
                .rejects.toThrow('сумма не указана');
        });

        it('слишком много сделок в одном счёте отклоняется', async () => {
            const many = Array.from({ length: 201 }, (_, i) => ourOrder({ id: `o-${i}` }));
            const { service } = makeService(many);

            await expect(service.createFromSharedReport('token-1', {
                orderIds: many.map((o) => o.id),
            })).rejects.toThrow('не больше');
        });

        it('счёт по недействительной ссылке не создаётся', async () => {
            const { service, shareLinks } = makeService([ourOrder()]);
            shareLinks.resolve.mockRejectedValue(new Error('Ссылка недействительна'));

            await expect(service.createFromSharedReport('плохой-токен', { orderIds: ['o-1'] }))
                .rejects.toThrow('недействительна');
        });

        it('дубли в списке сделок не удваивают сумму', async () => {
            const { service, created } = makeService([ourOrder()]);

            await service.createFromSharedReport('token-1', { orderIds: ['o-1', 'o-1'] });

            expect(created[0].dto.lines).toHaveLength(1);
        });
    });
});
