import { BadRequestException } from '@nestjs/common';
import { PaymentProofService } from './payment-proof.service';

/**
 * «Мне пришло не столько» — заявление получателя денег.
 *
 * Чек до сих пор умел только одно: плательщик доказывал, что перевёл.
 * Обратная сторона молчала. Перевозчик видел «Частично: 100 000 из
 * 260 000» и, если к нему на счёт легло восемьдесят, сказать об этом было
 * негде — оставался звонок.
 *
 * Разница между двумя заявлениями не косметическая. Плательщик обязан
 * приложить платёжку: без неё его слово ничего не стоит. Получателю
 * прикладывать нечего — выписка у него своя, а спорный факт как раз
 * сумма, поэтому сумма и обязательна.
 */
describe('Замечание получателя по оплате', () => {
    const ORDER = {
        id: 'р-1',
        orderNumber: 'ЗК-2602',
        customerCompanyId: 'заказчик',
        forwarderId: 'мы',
        partnerId: null,
        subForwarderId: 'перевозчик',
    };

    const build = (order: any = ORDER) => {
        const prisma: any = {
            order: { findUnique: jest.fn().mockResolvedValue(order) },
            orderPaymentProof: {
                create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({
                    id: 'з-1', status: 'PENDING', kind: data.kind, createdAt: new Date(),
                })),
            },
        };
        const s3: any = { isS3Enabled: () => true, uploadFile: jest.fn() };
        const shareLinks: any = {
            resolve: jest.fn().mockResolvedValue({
                id: 'ссылка-1', companyId: 'мы', counterpartyId: 'перевозчик',
            }),
        };
        return { service: new PaymentProofService(prisma, s3, shareLinks), prisma, s3 };
    };

    it('получатель называет сумму без всякого файла', async () => {
        const { service, prisma, s3 } = build();

        const result = await service.submitFromSharedReport(
            'т', { orderId: 'р-1', kind: 'RECEIPT', claimedAmount: '80 000' } as any, undefined as any,
        );

        expect(result.kind).toBe('RECEIPT');
        expect(result.message).toContain('Замечание');
        expect(s3.uploadFile).not.toHaveBeenCalled();
        const data = prisma.orderPaymentProof.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ kind: 'RECEIPT', fileUrl: null, status: 'PENDING' });
        expect(Number(data.claimedAmount)).toBe(80_000);
    });

    it('замечание без суммы не принимается', async () => {
        // «Что-то не так» без единой цифры — это день работы бухгалтера
        // ради того, что отправитель знал с самого начала.
        const { service } = build();

        await expect(service.submitFromSharedReport(
            'т', { orderId: 'р-1', kind: 'RECEIPT' } as any, undefined as any,
        )).rejects.toThrow('сумму, которая к вам пришла');
    });

    it('замечание принимается только там, где деньги идут заявителю', async () => {
        const { service } = build({ ...ORDER, subForwarderId: 'другой' });

        await expect(service.submitFromSharedReport(
            'т', { orderId: 'р-1', kind: 'RECEIPT', claimedAmount: '80000' } as any, undefined as any,
        )).rejects.toThrow('деньги идут не вам');
    });

    it('чек плательщика по-прежнему требует файла', async () => {
        const { service } = build({ ...ORDER, customerCompanyId: 'перевозчик', subForwarderId: null });

        await expect(service.submitFromSharedReport(
            'т', { orderId: 'р-1', claimedAmount: '80000' } as any, undefined as any,
        )).rejects.toBeInstanceOf(BadRequestException);
    });

    it('без указания вида заявление считается платежом — как было раньше', async () => {
        const { service, prisma } = build({ ...ORDER, customerCompanyId: 'перевозчик', subForwarderId: null });

        await service.submitFromSharedReport('т', { orderId: 'р-1' } as any, {
            originalname: 'платёжка.pdf', buffer: Buffer.from('%PDF'),
            mimetype: 'application/pdf', size: 4,
        } as any);

        expect(prisma.orderPaymentProof.create.mock.calls[0][0].data.kind).toBe('PAYMENT');
    });

    it('заявление уходит на проверку, а не закрывает долг', async () => {
        // Главное правило обеих форм: платёж проводит бухгалтер после
        // сверки с банком, а не страница по ссылке.
        const { service, prisma } = build();

        await service.submitFromSharedReport(
            'т', { orderId: 'р-1', kind: 'RECEIPT', claimedAmount: '80000' } as any, undefined as any,
        );

        expect(prisma.orderPaymentProof.create.mock.calls[0][0].data.status).toBe('PENDING');
    });
});
