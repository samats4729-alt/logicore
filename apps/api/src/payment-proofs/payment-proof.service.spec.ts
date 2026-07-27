import { PaymentProofService } from './payment-proof.service';

const US = 'company-us';
const THEM = 'company-them';
const STRANGER = 'company-stranger';

/** Рейс, где заказчик — контрагент: платит он, везём мы. */
const theirOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'o-1',
    orderNumber: 'ЗК-001',
    customerCompanyId: THEM,
    forwarderId: US,
    partnerId: null,
    subForwarderId: null,
    ...overrides,
});

const pdf = (overrides: Partial<Express.Multer.File> = {}) => ({
    originalname: 'чек.pdf',
    mimetype: 'application/pdf',
    size: 120_000,
    buffer: Buffer.from('%PDF-1.4'),
    ...overrides,
}) as Express.Multer.File;

function makeService(options: { order?: any; proof?: any } = {}) {
    const created: any[] = [];
    const updated: any[] = [];
    const prisma: any = {
        order: {
            findUnique: jest.fn(async () => ('order' in options ? options.order : theirOrder())),
        },
        orderPaymentProof: {
            create: jest.fn(async ({ data }: any) => {
                created.push(data);
                return { id: 'proof-1', status: data.status, createdAt: new Date() };
            }),
            findUnique: jest.fn(async () => options.proof ?? {
                id: 'proof-1', companyId: US, status: 'PENDING',
                fileUrl: 'uploads/payment-proofs/p.pdf', fileName: 'чек.pdf', mimeType: 'application/pdf',
            }),
            update: jest.fn(async ({ data }: any) => {
                updated.push(data);
                return { id: 'proof-1', status: data.status, reviewedAt: data.reviewedAt };
            }),
            findMany: jest.fn(async () => []),
            count: jest.fn(async () => 0),
        },
        payment: { create: jest.fn() },
    };
    const s3: any = { isS3Enabled: () => true, uploadFile: jest.fn(async () => 'ok') };
    const shareLinks: any = {
        resolve: jest.fn(async () => ({
            id: 'link-1', companyId: US, companyName: 'Мы',
            counterpartyId: THEM, counterpartyName: 'Они',
            ourRole: 'Экспедитор', expiresAt: new Date(Date.now() + 86400000),
        })),
    };
    const service = new PaymentProofService(prisma, s3, shareLinks);
    return { service, prisma, s3, shareLinks, created, updated };
}

describe('Чек об оплате от контрагента', () => {
    describe('что происходит при отправке', () => {
        it('чек ложится в очередь «на проверке»', async () => {
            const { service, created } = makeService();

            const result = await service.submitFromSharedReport('t', { orderId: 'o-1' }, pdf());

            expect(created[0].status).toBe('PENDING');
            expect(result.status).toBe('PENDING');
        });

        it('ЧЕК НЕ СОЗДАЁТ ПЛАТЁЖ', async () => {
            // Ради этого всё и затевалось: иначе любой со ссылкой закрывал
            // бы свой долг картинкой.
            const { service, prisma } = makeService();

            await service.submitFromSharedReport('t', { orderId: 'o-1' }, pdf());

            expect(prisma.payment.create).not.toHaveBeenCalled();
        });

        it('видно, кто прислал и по какой ссылке', async () => {
            const { service, created } = makeService();

            await service.submitFromSharedReport('t', { orderId: 'o-1' }, pdf());

            expect(created[0]).toMatchObject({
                companyId: US,
                counterpartyId: THEM,
                sharedReportLinkId: 'link-1',
                orderId: 'o-1',
            });
        });

        it('сумма и дата сохраняются как заявленные отправителем', async () => {
            const { service, created } = makeService();

            await service.submitFromSharedReport(
                't', { orderId: 'o-1', claimedAmount: '120 000,50', claimedDate: '2026-07-20' }, pdf(),
            );

            expect(created[0].claimedAmount.toFixed(2)).toBe('120000.50');
            expect(created[0].claimedDate.toISOString().slice(0, 10)).toBe('2026-07-20');
        });

        it('подделанный статус в запросе игнорируется', async () => {
            // Иначе отправитель прислал бы себе сразу подтверждённый чек и
            // проверка бухгалтером была бы бессмысленной.
            const { service, created } = makeService();

            await service.submitFromSharedReport(
                't',
                { orderId: 'o-1', status: 'ACCEPTED', reviewedById: 'кто-то' } as any,
                pdf(),
            );

            expect(created[0].status).toBe('PENDING');
            expect(created[0].reviewedById).toBeUndefined();
        });

        it('чек можно прислать и без суммы', async () => {
            const { service, created } = makeService();

            await service.submitFromSharedReport('t', { orderId: 'o-1' }, pdf());

            expect(created[0].claimedAmount).toBeNull();
        });
    });

    describe('чего нельзя при отправке', () => {
        it('нельзя приложить чек к сделке, где платим МЫ', async () => {
            // Контрагент — субподрядчик: деньги идут ему, а не от него.
            const { service } = makeService({
                order: theirOrder({ customerCompanyId: null, forwarderId: US, subForwarderId: THEM }),
            });

            await expect(service.submitFromSharedReport('t', { orderId: 'o-1' }, pdf()))
                .rejects.toThrow('платёж идёт не от вас');
        });

        it('нельзя приложить чек к чужой сделке', async () => {
            const { service } = makeService({
                order: theirOrder({ customerCompanyId: THEM, forwarderId: STRANGER }),
            });

            await expect(service.submitFromSharedReport('t', { orderId: 'o-1' }, pdf()))
                .rejects.toThrow('платёж идёт не от вас');
        });

        it('исполняемые файлы не принимаются', async () => {
            const { service } = makeService();

            await expect(service.submitFromSharedReport(
                't', { orderId: 'o-1' }, pdf({ mimetype: 'application/x-msdownload', originalname: 'x.exe' }),
            )).rejects.toThrow('PDF или изображение');
        });

        it('файл больше 10 МБ не принимается', async () => {
            const { service } = makeService();

            await expect(service.submitFromSharedReport(
                't', { orderId: 'o-1' }, pdf({ size: 11 * 1024 * 1024 }),
            )).rejects.toThrow('больше 10 МБ');
        });

        it('без файла чек не принимается', async () => {
            const { service } = makeService();

            await expect(service.submitFromSharedReport('t', { orderId: 'o-1' }, undefined as any))
                .rejects.toThrow('Приложите файл');
        });

        it('по недействительной ссылке чек не принимается', async () => {
            const { service, shareLinks } = makeService();
            shareLinks.resolve.mockRejectedValue(new Error('Ссылка недействительна'));

            await expect(service.submitFromSharedReport('плохой', { orderId: 'o-1' }, pdf()))
                .rejects.toThrow('недействительна');
        });

        it('несуществующая сделка отклоняется', async () => {
            const { service } = makeService({ order: null });

            await expect(service.submitFromSharedReport('t', { orderId: 'нет' }, pdf()))
                .rejects.toThrow('Сделка не найдена');
        });

        it('мусор вместо суммы отклоняется', async () => {
            const { service } = makeService();

            await expect(service.submitFromSharedReport(
                't', { orderId: 'o-1', claimedAmount: 'много' }, pdf(),
            )).rejects.toThrow('Сумма указана неверно');
        });

        it('отрицательная сумма отклоняется', async () => {
            const { service } = makeService();

            await expect(service.submitFromSharedReport(
                't', { orderId: 'o-1', claimedAmount: '-5000' }, pdf(),
            )).rejects.toThrow('Сумма указана неверно');
        });
    });

    describe('проверка бухгалтером', () => {
        it('подтверждение НЕ создаёт платёж', async () => {
            const { service, prisma, updated } = makeService();

            await service.accept(US, 'user-1', 'proof-1');

            expect(updated[0].status).toBe('ACCEPTED');
            expect(prisma.payment.create).not.toHaveBeenCalled();
        });

        it('в отклонении сохраняется причина', async () => {
            const { service, updated } = makeService();

            await service.reject(US, 'user-1', 'proof-1', '  Сумма не сходится  ');

            expect(updated[0].status).toBe('REJECTED');
            expect(updated[0].rejectionReason).toBe('Сумма не сходится');
        });

        it('видно, кто и когда принял решение', async () => {
            const { service, updated } = makeService();

            await service.accept(US, 'user-42', 'proof-1');

            expect(updated[0].reviewedById).toBe('user-42');
            expect(updated[0].reviewedAt).toBeInstanceOf(Date);
        });

        it('чужой чек не подтвердить', async () => {
            const { service } = makeService({
                proof: { id: 'proof-1', companyId: STRANGER, status: 'PENDING' },
            });

            await expect(service.accept(US, 'user-1', 'proof-1'))
                .rejects.toThrow('другой организации');
        });

        it('чужой чек не посмотреть', async () => {
            const { service } = makeService({
                proof: { id: 'proof-1', companyId: STRANGER, status: 'PENDING' },
            });

            await expect(service.file(US, 'proof-1')).rejects.toThrow('другой организации');
        });

        it('решение по уже рассмотренному чеку не переигрывается', async () => {
            const { service } = makeService({
                proof: { id: 'proof-1', companyId: US, status: 'ACCEPTED' },
            });

            await expect(service.reject(US, 'user-1', 'proof-1'))
                .rejects.toThrow('решение уже принято');
        });
    });
});
