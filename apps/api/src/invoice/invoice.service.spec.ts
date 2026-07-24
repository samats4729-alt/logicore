import { BadRequestException } from '@nestjs/common';
import { InvoiceType } from '@prisma/client';
import { InvoiceService } from './invoice.service';

const COMPANY = 'company-1';
const CARRIER = 'company-carrier';
const SUB = 'company-subforwarder';

function makePrismaMock() {
    const mock: any = {
        order: {
            findMany: jest.fn(),
            updateMany: jest.fn(),
        },
        invoice: {
            create: jest.fn().mockResolvedValue({ id: 'inv-1' }),
        },
    };
    // createInvoice оборачивает создание в транзакцию — прокидываем тот же мок как tx
    mock.$transaction = jest.fn(async (cb: any) => cb(mock));
    return mock;
}

function makeService(prisma: ReturnType<typeof makePrismaMock>) {
    const service = new InvoiceService(prisma as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service, 'getInvoiceDetails').mockResolvedValue({ id: 'inv-1' } as any);
    return service;
}

const baseDto = (overrides: Record<string, any> = {}) => ({
    invoiceNumber: 'INV-001',
    type: InvoiceType.OUTGOING,
    date: '2026-06-01',
    issuerId: COMPANY,
    recipientId: 'company-customer',
    orderIds: ['o1', 'o2'],
    ...overrides,
});

describe('InvoiceService.createInvoice — расчёт суммы счёта', () => {
    let prisma: ReturnType<typeof makePrismaMock>;
    let service: InvoiceService;

    beforeEach(() => {
        prisma = makePrismaMock();
        service = makeService(prisma);
    });

    it('исходящий счёт: сумма = сумма цен заказчика по всем заявкам', async () => {
        prisma.order.findMany.mockResolvedValue([
            { id: 'o1', orderNumber: 'N1', customerPrice: 100000, outgoingInvoiceId: null },
            { id: 'o2', orderNumber: 'N2', customerPrice: 250000, outgoingInvoiceId: null },
        ]);

        await service.createInvoice(COMPANY, 'user-1', baseDto());

        const data = prisma.invoice.create.mock.calls[0][0].data;
        expect(data.amount).toBe(350000);
        expect(data.type).toBe(InvoiceType.OUTGOING);
        // Заявки привязываются к исходящему счёту
        expect(prisma.order.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['o1', 'o2'] } },
            data: { outgoingInvoiceId: 'inv-1' },
        });
    });

    it('входящий счёт от перевозчика: сумма = ставки водителя', async () => {
        prisma.order.findMany.mockResolvedValue([
            { id: 'o1', orderNumber: 'N1', driverCost: 80000, subForwarderId: null, incomingInvoiceId: null },
            { id: 'o2', orderNumber: 'N2', driverCost: 90000, subForwarderId: null, incomingInvoiceId: null },
        ]);

        await service.createInvoice(
            COMPANY,
            'user-1',
            baseDto({ type: InvoiceType.INCOMING, issuerId: CARRIER, recipientId: COMPANY }),
        );

        const data = prisma.invoice.create.mock.calls[0][0].data;
        expect(data.amount).toBe(170000);
        expect(prisma.order.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['o1', 'o2'] } },
            data: { incomingInvoiceId: 'inv-1' },
        });
    });

    it('входящий счёт от субэкспедитора: берётся цена субподряда, а не ставка водителя', async () => {
        prisma.order.findMany.mockResolvedValue([
            { id: 'o1', orderNumber: 'N1', driverCost: 80000, subForwarderPrice: 120000, subForwarderId: SUB, incomingInvoiceId: null },
        ]);

        await service.createInvoice(
            COMPANY,
            'user-1',
            baseDto({ type: InvoiceType.INCOMING, issuerId: SUB, recipientId: COMPANY, orderIds: ['o1'] }),
        );

        const data = prisma.invoice.create.mock.calls[0][0].data;
        expect(data.amount).toBe(120000);
    });

    it('исходящий счёт от субэкспедитора: берётся его ставка, а не цена заказчика', async () => {
        prisma.order.findMany.mockResolvedValue([
            { id: 'o1', orderNumber: 'N1', customerPrice: 250000, subForwarderPrice: 120000, subForwarderId: SUB, outgoingInvoiceId: null },
        ]);

        await service.createInvoice(
            COMPANY,
            'user-1',
            baseDto({ type: InvoiceType.OUTGOING, issuerId: SUB, recipientId: CARRIER, orderIds: ['o1'] }),
        );

        const data = prisma.invoice.create.mock.calls[0][0].data;
        expect(data.amount).toBe(120000);
    });

    it('пустые цены считаются нулём, а не NaN', async () => {
        prisma.order.findMany.mockResolvedValue([
            { id: 'o1', orderNumber: 'N1', customerPrice: null, outgoingInvoiceId: null },
            { id: 'o2', orderNumber: 'N2', customerPrice: 200000, outgoingInvoiceId: null },
        ]);

        await service.createInvoice(COMPANY, 'user-1', baseDto());

        expect(prisma.invoice.create.mock.calls[0][0].data.amount).toBe(200000);
    });

    it('отклоняет счёт без заявок', async () => {
        await expect(
            service.createInvoice(COMPANY, 'user-1', baseDto({ orderIds: [] })),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('отклоняет счёт, если часть заявок не найдена', async () => {
        prisma.order.findMany.mockResolvedValue([
            { id: 'o1', orderNumber: 'N1', customerPrice: 100000, outgoingInvoiceId: null },
        ]);

        await expect(
            service.createInvoice(COMPANY, 'user-1', baseDto()),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('не даёт выставить заявку в исходящий счёт повторно', async () => {
        prisma.order.findMany.mockResolvedValue([
            { id: 'o1', orderNumber: 'N1', customerPrice: 100000, outgoingInvoiceId: 'inv-old' },
            { id: 'o2', orderNumber: 'N2', customerPrice: 250000, outgoingInvoiceId: null },
        ]);

        await expect(
            service.createInvoice(COMPANY, 'user-1', baseDto()),
        ).rejects.toThrow('уже добавлен в исходящий счет');
        expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('заявка с исходящим счётом может попасть во входящий (типы независимы)', async () => {
        prisma.order.findMany.mockResolvedValue([
            { id: 'o1', orderNumber: 'N1', driverCost: 80000, subForwarderId: null, outgoingInvoiceId: 'inv-old', incomingInvoiceId: null },
        ]);

        await expect(
            service.createInvoice(
                COMPANY,
                'user-1',
                baseDto({ type: InvoiceType.INCOMING, issuerId: CARRIER, orderIds: ['o1'] }),
            ),
        ).resolves.toBeDefined();
    });
});
