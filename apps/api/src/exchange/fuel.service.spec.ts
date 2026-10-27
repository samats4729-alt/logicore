import { BadRequestException } from '@nestjs/common';
import { ExchangeFuelService, parseAmount } from './fuel.service';

function tripRow(overrides: Record<string, any> = {}) {
    return {
        id: 'order-1', orderNumber: '000000013', driverId: 'u-driver', partnerId: 'park-1', status: 'IN_TRANSIT',
        partner: { name: 'ТОО «Парк А»', bin: '123456789012', phone: '+77010000000', parkPayoutRates: { fuelConsumption: 30 } },
        exchangeSettlement: { driverTotal: 400000, fuelEstimate: 120000, distanceKm: 1200, driverId: 'd-1' },
        exchangeFuelIssues: [
            { id: 'i-1', amount: 60000, method: 'STATION', note: null, createdAt: new Date() },
            { id: 'i-2', amount: 60000, method: 'TO_DRIVER', note: null, createdAt: new Date() },
        ],
        exchangeFuelReceipts: [
            { id: 'r-1', amount: 60000, status: 'ACCEPTED', rejectReason: null, createdAt: new Date(), decidedAt: new Date() },
            { id: 'r-2', amount: 40000, status: 'PENDING', rejectReason: null, createdAt: new Date(), decidedAt: null },
        ],
        advanceRequests: [],
        driverPayoutItem: null,
        ...overrides,
    };
}

function build(row = tripRow()) {
    const prisma: any = {
        order: { findFirst: jest.fn().mockResolvedValue(row) },
        exchangeDriver: { findUnique: jest.fn().mockResolvedValue({ id: 'd-1', kind: 'PARK', parkCompanyId: 'park-1' }) },
        exchangeFuelReceipt: {
            create: jest.fn(), update: jest.fn(), delete: jest.fn(),
            findFirst: jest.fn().mockResolvedValue({ id: 'r-2', orderId: 'order-1', status: 'PENDING', fileKey: 'k' }),
        },
        exchangeFuelIssue: { create: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    };
    const s3: any = { isS3Enabled: () => true, uploadFile: jest.fn(), deleteFile: jest.fn() };
    return { service: new ExchangeFuelService(prisma, s3), prisma, s3 };
}

const PHOTO: any = { originalname: 'check.jpg', mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x') };

describe('Топливо рейса водителя парка', () => {
    it('водитель видит БИН парка, сколько дали на топливо и сколько ему останется', async () => {
        const { service } = build();
        const v = await service.forDriver('u-driver', 'order-1');
        expect(v.park).toMatchObject({ bin: '123456789012', phone: '+77010000000' });
        expect(v.issued.total).toBe(120000);
        expect(v.receipts).toMatchObject({ accepted: 60000, pending: 40000 });
        // Итог 400 000 минус 120 000, которые парк уже дал на топливо.
        expect(v.toPay).toBe(280000);
        // Дали 120 000, принятых чеков на 60 000 — 60 000 пока без чека.
        expect(v.withoutReceipt).toBe(60000);
        // Лимит на топливо — 120 000 по километражу, это 360 л при 30 л на 100 км.
        expect(v).toMatchObject({ fuelEstimate: 120000, fuelLiters: 360 });
    });

    it('предоплата — отдельно от топлива: вычитается из выплаты, но чек на неё не нужен', async () => {
        const { service } = build(tripRow({
            exchangeSettlement: { scheme: 2, driverTotal: 246600, workNet: 246600, fuelEstimate: 126000, distanceKm: 1200, driverId: 'd-1' },
            exchangeFuelIssues: [
                { id: 'i-1', amount: 60000, method: 'STATION', note: null, createdAt: new Date() },
                { id: 'adv-1', amount: 50000, method: 'TO_DRIVER', note: 'Предоплата по запросу водителя', createdAt: new Date() },
            ],
            exchangeFuelReceipts: [{ id: 'r-1', amount: 60000, status: 'ACCEPTED', rejectReason: null, createdAt: new Date(), decidedAt: new Date() }],
            advanceRequests: [{ fuelIssueId: 'adv-1' }],
        }));
        const v = await service.forDriver('u-driver', 'order-1');
        expect(v.issued).toMatchObject({ total: 60000, items: [expect.objectContaining({ id: 'i-1' })] });
        expect(v.advances).toMatchObject({ total: 50000, items: [expect.objectContaining({ id: 'adv-1' })] });
        // На топливо дали 60 000 и чеков на 60 000 — без чека ничего.
        expect(v.withoutReceipt).toBe(0);
        expect(v.ownMoney).toBe(0);
        // На руки 246 600 − предоплата 50 000; топливо сошлось чеками.
        expect(v.toPay).toBe(196600);
    });

    it('чек: фото и сумма — уходит парку на проверку', async () => {
        const { service, prisma, s3 } = build();
        await service.addReceipt('u-driver', 'order-1', '45 500', PHOTO);
        expect(s3.uploadFile).toHaveBeenCalled();
        expect(prisma.exchangeFuelReceipt.create.mock.calls[0][0].data).toMatchObject({ orderId: 'order-1', driverId: 'd-1', parkCompanyId: 'park-1', amount: 45500 });
    });

    it('сумма не числом — понятная ошибка', () => {
        expect(() => parseAmount('сорок')).toThrow(/числом/);
        expect(parseAmount('120 000,50')).toBe(120000.5);
    });

    it('после запроса выплаты топливо не меняется', async () => {
        const { service } = build(tripRow({ driverPayoutItem: { id: 'p-1' } }));
        await expect(service.addReceipt('u-driver', 'order-1', '1000', PHOTO)).rejects.toThrow(/Выплата по рейсу уже запрошена/);
    });

    it('рейс без расчёта «на руки» — топливо не ведётся', async () => {
        const { service } = build(tripRow({ exchangeSettlement: null }));
        await expect(service.addIssue('park-1', 'u-manager', 'order-1', { amount: 1000, method: 'STATION' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('отклонить чек можно только с причиной — водитель её увидит', async () => {
        const { service, prisma } = build();
        await expect(service.decideReceipt('park-1', 'u-manager', 'r-2', { accept: false })).rejects.toThrow(/почему/);
        await service.decideReceipt('park-1', 'u-manager', 'r-2', { accept: true, amount: 39000 });
        expect(prisma.exchangeFuelReceipt.update.mock.calls[0][0].data).toMatchObject({ status: 'ACCEPTED', amount: 39000 });
    });

    it('рассмотренный парком чек водитель не убирает', async () => {
        const { service, prisma } = build();
        prisma.exchangeFuelReceipt.findFirst.mockResolvedValue({ id: 'r-1', orderId: 'order-1', status: 'ACCEPTED', fileKey: 'k' });
        await expect(service.removeReceipt('u-driver', 'r-1')).rejects.toThrow(/уже рассмотрел/);
    });
});
