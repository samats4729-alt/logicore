import { BadRequestException } from '@nestjs/common';
import { SharedReportDocumentService } from './shared-report-document.service';

/**
 * Документы, присланные контрагентом по ссылке на отчёт.
 *
 * Перевозчик выставляет счёт и вместе с ним шлёт пакет: свой счёт,
 * накладные, акт. Приложить их было негде, и они уходили в почту или
 * мессенджер — то есть мимо платформы. В споре об оплате предъявить потом
 * нечего, а накладная — это как раз то, чем спор и закрывается.
 *
 * Файл ложится в документы рейса: туда, где его ищут, а не в отдельный
 * «раздел присланного». Автором записывается организация — учётной записи
 * у отправителя нет, и подписывать чужой файл именем нашего сотрудника
 * значит врать в документообороте.
 */
describe('Документы от контрагента по ссылке', () => {
    const ORDER = {
        id: 'р-1',
        orderNumber: 'ЗК-2604',
        customerCompanyId: 'заказчик',
        forwarderId: 'мы',
        partnerId: null,
        subForwarderId: 'перевозчик',
        _count: { documents: 0 },
    };

    const FILE = {
        originalname: 'накладная.pdf',
        buffer: Buffer.from('%PDF'),
        mimetype: 'application/pdf',
        size: 4,
    } as any;

    const build = (orders: any[] = [ORDER]) => {
        const prisma: any = {
            order: { findMany: jest.fn().mockResolvedValue(orders) },
            document: { createMany: jest.fn().mockResolvedValue({ count: orders.length }) },
        };
        const s3: any = { isS3Enabled: () => true, uploadFile: jest.fn().mockResolvedValue({}) };
        const shareLinks: any = {
            resolve: jest.fn().mockResolvedValue({
                id: 'ссылка-1', companyId: 'мы', counterpartyId: 'перевозчик',
                counterpartyName: 'ИП Сериков',
            }),
        };
        return { service: new SharedReportDocumentService(prisma, s3, shareLinks), prisma, s3 };
    };

    it('файл ложится в документы заявки, автор — организация', async () => {
        const { service, prisma } = build();

        await service.uploadFromSharedReport('т', { orderIds: ['р-1'], type: 'TTN' }, FILE);

        const [row] = prisma.document.createMany.mock.calls[0][0].data;
        expect(row).toMatchObject({
            orderId: 'р-1',
            type: 'TTN',
            companyId: 'мы',
            uploadedById: null,
            uploadedByCounterpartyId: 'перевозчик',
        });
    });

    it('счёт на несколько рейсов виден в каждом из них', async () => {
        // Файл в хранилище один: копии раздували бы место на ровном месте.
        const second = { ...ORDER, id: 'р-2', orderNumber: 'ЗК-2605' };
        const { service, prisma, s3 } = build([ORDER, second]);

        const result = await service.uploadFromSharedReport(
            'т', { orderIds: ['р-1', 'р-2'], type: 'INVOICE' }, FILE,
        );

        const rows = prisma.document.createMany.mock.calls[0][0].data;
        expect(rows).toHaveLength(2);
        expect(new Set(rows.map((row: any) => row.fileUrl)).size).toBe(1);
        expect(s3.uploadFile).toHaveBeenCalledTimes(1);
        expect(result.message).toContain('2 сделкам');
    });

    it('чужая сделка не принимается', async () => {
        const { service } = build([{ ...ORDER, subForwarderId: 'другой', customerCompanyId: 'чужой' }]);

        await expect(service.uploadFromSharedReport('т', { orderIds: ['р-1'] }, FILE))
            .rejects.toThrow('не относится к взаиморасчётам с вами');
    });

    it('заказчик тоже вправе приложить документ', async () => {
        // Обе стороны расчётов шлют бумаги: перевозчик — накладную,
        // заказчик — доверенность на получателя.
        const { service } = build([{
            ...ORDER, customerCompanyId: 'перевозчик', subForwarderId: null,
        }]);

        await expect(service.uploadFromSharedReport('т', { orderIds: ['р-1'] }, FILE))
            .resolves.toBeDefined();
    });

    it('документ проверки организации сюда не подсунуть', async () => {
        // Иначе по публичной ссылке можно было бы засорять пакет,
        // по которому платформа подтверждает компании.
        const { service } = build();

        await expect(service.uploadFromSharedReport(
            'т', { orderIds: ['р-1'], type: 'DIRECTOR_ID' }, FILE,
        )).rejects.toBeInstanceOf(BadRequestException);
    });

    it('чужой формат и слишком большой файл не проходят', async () => {
        const { service } = build();

        await expect(service.uploadFromSharedReport(
            'т', { orderIds: ['р-1'] }, { ...FILE, mimetype: 'application/x-msdownload' },
        )).rejects.toThrow('PDF или изображение');

        await expect(service.uploadFromSharedReport(
            'т', { orderIds: ['р-1'] }, { ...FILE, size: 11 * 1024 * 1024 },
        )).rejects.toThrow('больше 10 МБ');
    });

    it('переполненный рейс отвечает понятно, а не молча', async () => {
        const { service } = build([{ ...ORDER, _count: { documents: 30 } }]);

        await expect(service.uploadFromSharedReport('т', { orderIds: ['р-1'] }, FILE))
            .rejects.toThrow('уже приложено');
    });

    it('без сделок загрузка не принимается', async () => {
        const { service } = build([]);

        await expect(service.uploadFromSharedReport('т', { orderIds: [] }, FILE))
            .rejects.toThrow('к каким сделкам');
    });
});
