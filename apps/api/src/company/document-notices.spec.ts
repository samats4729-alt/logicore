import { Prisma, UserRole } from '@prisma/client';
import { documentNotices } from './document-notices';

const NOW = new Date('2026-10-21T10:00:00Z');

function makePrisma() {
    return {
        user: { findUnique: jest.fn().mockResolvedValue({ ordersScope: null }) },
        company: { findUnique: jest.fn().mockResolvedValue({ managersSeeOwnOrdersOnly: false }) },
        document: {
            findMany: jest.fn().mockResolvedValue([{
                id: 'd1', createdAt: new Date('2026-10-20T08:00:00Z'),
                order: { id: 'o1', orderNumber: 'ЗК-1' }, uploadedBy: { role: UserRole.DRIVER },
            }]),
        },
        accountingDocument: {
            findMany: jest.fn()
                .mockResolvedValueOnce([{
                    id: 'a1', number: 'СЧ-5', type: 'PAYMENT_INVOICE', total: new Prisma.Decimal(350000),
                    currency: 'KZT', sentAt: new Date('2026-10-21T09:00:00Z'), company: { name: 'ТОО Перевозчик' },
                }])
                .mockResolvedValueOnce([]),
        },
        auditLog: {
            findMany: jest.fn().mockResolvedValue([{
                id: 'l1', createdAt: new Date('2026-10-19T09:00:00Z'),
                details: { number: '12', incoming: true, senderName: 'ТОО Заказчик', paid: 100, total: 300, currency: 'KZT' },
            }]),
        },
    } as any;
}

describe('вести о документах для колокольчика (C5/H8)', () => {
    it('бухгалтер видит ТТН, счёт перевозчика и оплату — свежие сверху', async () => {
        const prisma = makePrisma();
        const notices = await documentNotices(prisma, 'us', { role: UserRole.ACCOUNTANT, userId: 'u1' }, NOW);

        expect(notices.map((n) => n.kind)).toEqual(['INCOMING_INVOICE', 'TTN', 'INVOICE_PAID']);
        expect(notices[0].title).toBe('Счёт № СЧ-5 от ТОО Перевозчик');
        expect(notices[1].text).toBe('Водитель прислал фото накладной');
        expect(notices[2].title).toContain('частично оплатил счёт № 12');
        // Оплата адресована именно нам — по записи в журнале отправителя.
        expect(prisma.auditLog.findMany.mock.calls[0][0].where.details).toEqual({
            path: ['recipientCompanyId'], equals: 'us',
        });
    });

    it('логист денег не видит — только ТТН', async () => {
        const prisma = makePrisma();
        const notices = await documentNotices(prisma, 'us', { role: UserRole.LOGISTICIAN, userId: 'u1' }, NOW);

        expect(notices.map((n) => n.kind)).toEqual(['TTN']);
        expect(prisma.accountingDocument.findMany).not.toHaveBeenCalled();
        expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('свою же ТТН себе не показывает', async () => {
        const prisma = makePrisma();
        await documentNotices(prisma, 'us', { role: UserRole.LOGISTICIAN, userId: 'u1' }, NOW);

        expect(prisma.document.findMany.mock.calls[0][0].where.NOT).toEqual({ uploadedById: 'u1' });
    });
});
