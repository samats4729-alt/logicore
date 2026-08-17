import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SharedReportInvoiceService } from './shared-report-invoice.service';

/**
 * Счёт, который перевозчик выставляет сам по ссылке на отчёт.
 *
 * Три правила, и каждое куплено разговором с живым перевозчиком.
 *
 * Первое: сумму называет он. У нас в карточке записана цена из заявки, а в
 * рейсе был простой, догруз или перевес — и спорить об этом ему было
 * негде. Но наша цифра при этом не меняется: заявленная сумма попадает в
 * счёт, расхождение — в примечание бухгалтеру, решает человек.
 *
 * Второе: свой счёт можно отозвать, пока бухгалтер его не тронул. Иначе
 * ошибившийся оказывался заперт — рейсы из счёта у него больше не
 * выбирались, а отменить документ он не мог.
 *
 * Третье: границы. Отзывается только свой счёт, только черновик и только
 * без разнесённых платежей.
 */
describe('Счёт по ссылке на отчёт', () => {
    const ORDER = {
        id: 'р-1',
        orderNumber: 'ЗК-2604',
        status: 'COMPLETED',
        customerCompanyId: 'заказчик',
        forwarderId: 'мы',
        partnerId: null,
        subForwarderId: 'перевозчик',
        customerPrice: 540_000,
        subForwarderPrice: 445_000,
        driverCost: null,
        routePoints: [
            { location: { city: 'Актобе' } },
            { location: { city: 'Атырау' } },
        ],
    };

    const build = (overrides: { order?: any; document?: any } = {}) => {
        const created = { id: 'д-1', number: 'ВХ-2026-000004', status: 'DRAFT' };
        const prisma: any = {
            order: { findMany: jest.fn().mockResolvedValue([overrides.order ?? ORDER]) },
            user: { findFirst: jest.fn().mockResolvedValue({ id: 'бух-1' }) },
            accountingDocument: {
                findFirst: jest.fn().mockResolvedValue(overrides.document ?? null),
                delete: jest.fn().mockResolvedValue({}),
            },
        };
        const shareLinks: any = {
            resolve: jest.fn().mockResolvedValue({
                id: 'ссылка-1',
                companyId: 'мы',
                counterpartyId: 'перевозчик',
                counterpartyName: 'ИП Сериков',
            }),
        };
        const documents: any = { createDraft: jest.fn().mockResolvedValue(created) };
        // Выручка контрагента по нашему рейсу — это его цена как исполнителя.
        const calculator: any = {
            computeOrderFinance: jest.fn().mockReturnValue({ revenue: 445_000 }),
        };

        const service = new SharedReportInvoiceService(prisma, shareLinks, documents, calculator);
        return { service, prisma, documents, shareLinks };
    };

    describe('своя сумма', () => {
        it('без своей суммы счёт идёт по нашей цифре', async () => {
            const { service, documents } = build();

            const result = await service.createFromSharedReport('т', { orderIds: ['р-1'] } as any);

            expect(result.total).toBe(445_000);
            expect(result.disagreements).toBe(0);
            const draft = documents.createDraft.mock.calls[0][2];
            expect(draft.lines[0].unitPrice).toBe('445000.00');
            expect(draft.note).not.toContain('расходятся');
        });

        it('названная сумма попадает в счёт вместо нашей', async () => {
            const { service, documents } = build();

            const result = await service.createFromSharedReport('т', {
                orderIds: ['р-1'],
                amounts: [{ orderId: 'р-1', amount: '470 000' }],
            } as any);

            expect(result.total).toBe(470_000);
            expect(documents.createDraft.mock.calls[0][2].lines[0].unitPrice).toBe('470000.00');
        });

        it('расхождение названо словами в примечании бухгалтеру', async () => {
            // Иначе разница уходит в оплату молча — а это чужие деньги.
            const { service, documents } = build();

            const result = await service.createFromSharedReport('т', {
                orderIds: ['р-1'],
                amounts: [{ orderId: 'р-1', amount: '470000' }],
            } as any);

            expect(result.disagreements).toBe(1);
            const draft = documents.createDraft.mock.calls[0][2];
            expect(draft.note).toContain('расходятся');
            expect(draft.note).toContain('ЗК-2604');
            expect(draft.lines[0].description).toContain('у нас');
        });

        it('сумма с запятой и пробелами читается, мусор — нет', async () => {
            const { service } = build();

            await expect(service.createFromSharedReport('т', {
                orderIds: ['р-1'], amounts: [{ orderId: 'р-1', amount: '470 000,50' }],
            } as any)).resolves.toMatchObject({ total: 470_000.5 });

            await expect(service.createFromSharedReport('т', {
                orderIds: ['р-1'], amounts: [{ orderId: 'р-1', amount: 'штук пять' }],
            } as any)).rejects.toBeInstanceOf(BadRequestException);
        });

        it('без нашей цены счёт выставляется по названной сумме', async () => {
            // Цену перевозчика могли не записать в карточку. Раньше это был
            // отказ, хотя сумму знает как раз тот, кто везёт.
            const { service } = build({ order: { ...ORDER, subForwarderPrice: null } });
            (service as any).calculator.computeOrderFinance.mockReturnValue({ revenue: 0 });

            await expect(service.createFromSharedReport('т', {
                orderIds: ['р-1'], amounts: [{ orderId: 'р-1', amount: '300000' }],
            } as any)).resolves.toMatchObject({ total: 300_000 });
        });

        it('без нашей цены и без своей — отказ говорит, что делать', async () => {
            const { service } = build({ order: { ...ORDER, subForwarderPrice: null } });
            (service as any).calculator.computeOrderFinance.mockReturnValue({ revenue: 0 });

            await expect(service.createFromSharedReport('т', { orderIds: ['р-1'] } as any))
                .rejects.toThrow('укажите свою');
        });

        it('чужая сделка в счёт не проходит', async () => {
            const { service } = build({
                order: { ...ORDER, subForwarderId: 'другой-перевозчик' },
            });

            await expect(service.createFromSharedReport('т', { orderIds: ['р-1'] } as any))
                .rejects.toThrow('не относится к взаиморасчётам с вами');
        });

        it('счёт помнит ссылку, по которой пришёл', async () => {
            // По ней же контрагент вправе его отозвать.
            const { service, documents } = build();

            await service.createFromSharedReport('т', { orderIds: ['р-1'] } as any);

            expect(documents.createDraft.mock.calls[0][2].sharedReportLinkId).toBe('ссылка-1');
        });
    });

    describe('отзыв счёта', () => {
        const draft = {
            id: 'д-1',
            number: 'ВХ-2026-000004',
            status: 'DRAFT',
            sharedReportLink: { counterpartyId: 'перевозчик' },
            _count: { paymentAllocations: 0 },
        };

        it('свой черновик отзывается, рейсы освобождаются', async () => {
            const { service, prisma } = build({ document: draft });

            await expect(service.withdrawFromSharedReport('т', 'д-1'))
                .resolves.toMatchObject({ withdrawn: true });
            expect(prisma.accountingDocument.delete).toHaveBeenCalledWith({ where: { id: 'д-1' } });
        });

        it('принятый в работу счёт не отзывается', async () => {
            const { service } = build({ document: { ...draft, status: 'POSTED' } });

            await expect(service.withdrawFromSharedReport('т', 'д-1'))
                .rejects.toBeInstanceOf(ConflictException);
        });

        it('счёт с разнесёнными платежами не отзывается', async () => {
            const { service } = build({
                document: { ...draft, _count: { paymentAllocations: 1 } },
            });

            await expect(service.withdrawFromSharedReport('т', 'д-1'))
                .rejects.toThrow('разнесены платежи');
        });

        it('чужой счёт неотличим от несуществующего', async () => {
            // По ответу нельзя перебирать чужие номера.
            const { service } = build({
                document: { ...draft, sharedReportLink: { counterpartyId: 'кто-то-ещё' } },
            });

            await expect(service.withdrawFromSharedReport('т', 'д-1'))
                .rejects.toBeInstanceOf(NotFoundException);
        });

        it('черновик нашего бухгалтера контрагенту не отдаётся', async () => {
            // У него нет ссылки-происхождения: выборка его не находит.
            const { service } = build({ document: null });

            await expect(service.withdrawFromSharedReport('т', 'д-1'))
                .rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
