import { ForbiddenException } from '@nestjs/common';
import { DocumentsService } from './documents.service';

/**
 * Какие документы видит водитель.
 *
 * Тот же изъян, что был в карточке рейса, только здесь утекают уже
 * подписанные бумаги. Водитель состоит в компании, и проверка «рейс нашей
 * фирмы» открывала ему весь её архив: договоры, счета, акты и накладные по
 * всем заявкам, каждую — с возможностью скачать файл.
 *
 * Проверено на стенде до починки: водитель, снятый с рейса, открывал его
 * накладную и скачивал файл — 200 в обоих случаях.
 */
describe('Документы и водитель', () => {
    const ВОДИТЕЛЬ = { sub: 'вод-1', role: 'DRIVER', companyId: 'наша' };

    const build = (order: Record<string, unknown> | null) => {
        const prisma: any = {
            document: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'док-1',
                    companyId: 'наша',
                    fileName: 'ttn.pdf',
                    order,
                    uploadedBy: { companyId: 'наша' },
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            order: {
                findFirst: jest.fn(async ({ where }: any) =>
                    (where.driverId && where.driverId === 'вод-1' && where.id === 'мой-рейс')
                        ? { id: where.id }
                        : null),
            },
        };
        return { service: new DocumentsService(prisma, { isS3Enabled: () => false } as any), prisma };
    };

    it('чужой рейс — документа не видно', async () => {
        const { service } = build({ id: 'чужой-рейс', driverId: 'другой', customerCompanyId: 'наша' });

        await expect(service.findById('док-1', ВОДИТЕЛЬ))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('свой рейс — документ открывается', async () => {
        const { service } = build({ id: 'мой-рейс', driverId: 'вод-1', customerCompanyId: 'наша' });

        await expect(service.findById('док-1', ВОДИТЕЛЬ)).resolves.toMatchObject({ id: 'док-1' });
    });

    it('документ без рейса водителю не отдаётся', async () => {
        // Там уставные бумаги компании и прочее, что к перевозке отношения
        // не имеет, — а прежняя проверка «автор из нашей компании» его
        // пускала.
        const { service } = build(null);

        await expect(service.findById('док-1', ВОДИТЕЛЬ))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('журнал документов у водителя — только его рейсы', async () => {
        const { service, prisma } = build(null);

        await service.listForCompany('наша', {}, { user: ВОДИТЕЛЬ });

        const { where } = prisma.document.findMany.mock.calls[0][0];
        expect(JSON.stringify(where.AND)).toContain('"driverId":"вод-1"');
        // Общая проверка по компании для водителя не применяется: иначе
        // отбор снова стал бы «все документы фирмы».
        expect(JSON.stringify(where.AND)).not.toContain('customerCompanyId');
    });

    it('приложить файл можно только к своему рейсу', async () => {
        const { service } = build(null);

        await expect(service.uploadFile('чужой-рейс', 'вод-1', 'TTN' as any, {} as any, ВОДИТЕЛЬ))
            .rejects.toThrow('назначен не вам');
    });
});
