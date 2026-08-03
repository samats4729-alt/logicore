import { ForbiddenException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { DocumentsService } from './documents.service';

/**
 * Журнал вложенных документов компании.
 *
 * Экран «Документы» в кабинете раньше был пустой заготовкой: список всегда
 * показывал «нет загруженных документов», хотя накладные к рейсам грузят
 * каждый день. Бухгалтеру приходилось спрашивать номер заявки у логиста.
 *
 * Главное, что проверяется здесь — отбор по своей компании остаётся на месте
 * при любом наборе фильтров. Если он потеряется, человек увидит чужие
 * накладные, а такую ошибку по экрану не заметить: список выглядит рабочим.
 */
describe('Журнал документов компании', () => {
    const makeService = (rows: any[] = []) => {
        const findMany = jest.fn().mockResolvedValue(rows);
        const prisma = { document: { findMany } } as any;
        return { service: new DocumentsService(prisma, {} as any), findMany };
    };

    /** Условия доступа из запроса — их может быть несколько, они в AND. */
    const accessConditions = (where: any) =>
        (where.AND as any[]).filter((c) => c.OR?.some((o: any) => o.order?.OR));

    it('показывает только документы своей компании', async () => {
        const { service, findMany } = makeService();
        await service.listForCompany('c-1');

        const where = findMany.mock.calls[0][0].where;
        const access = accessConditions(where);
        expect(access).toHaveLength(1);
        expect(access[0].OR[0].order.OR).toEqual([
            { customerCompanyId: 'c-1' },
            { forwarderId: 'c-1' },
            { partnerId: 'c-1' },
            { responsibleManager: { companyId: 'c-1' } },
        ]);
        // Файл без рейса виден, если его вложил наш же сотрудник.
        expect(access[0].OR[1]).toEqual({ orderId: null, uploadedBy: { companyId: 'c-1' } });
    });

    it('поиск не отменяет отбор по своей компании', async () => {
        // Ровно та ошибка, на которой это легко сломать: два условия с ключом
        // `OR` в одном объекте затирают друг друга, и первым теряется доступ.
        const { service, findMany } = makeService();
        await service.listForCompany('c-1', { search: 'Магнум' });

        const where = findMany.mock.calls[0][0].where;
        expect(accessConditions(where)).toHaveLength(1);
        expect(where.AND).toHaveLength(2);

        const matches = where.AND[1].OR;
        expect(matches).toContainEqual({ order: { orderNumber: { contains: 'Магнум', mode: 'insensitive' } } });
        expect(matches).toContainEqual({ fileName: { contains: 'Магнум', mode: 'insensitive' } });
    });

    it('ищет по городу, водителю и заказчику — не только по номеру заявки', async () => {
        // Накладную помнят как «Магнум, Алматы, прошлая неделя», а не как ЛК-217.
        const { service, findMany } = makeService();
        await service.listForCompany('c-1', { search: 'Алматы' });

        const keys = (findMany.mock.calls[0][0].where.AND[1].OR as any[])
            .map((c) => JSON.stringify(c));
        expect(keys.some((k) => k.includes('routePoints'))).toBe(true);
        expect(keys.some((k) => k.includes('assignedDriverName'))).toBe(true);
        expect(keys.some((k) => k.includes('assignedDriverPlate'))).toBe(true);
        expect(keys.some((k) => k.includes('customerCompany'))).toBe(true);
    });

    it('фильтры по виду документа и периоду доходят до запроса', async () => {
        const { service, findMany } = makeService();
        await service.listForCompany('c-1', { type: DocumentType.TTN, from: '2026-07-01', to: '2026-07-31' });

        const where = findMany.mock.calls[0][0].where;
        expect(where.type).toBe(DocumentType.TTN);
        // Верхняя граница включает весь последний день, иначе документы,
        // вложенные 31-го числа днём, в отчёт за июль не попадут.
        expect(where.createdAt.gte).toEqual(new Date('2026-07-01'));
        expect(where.createdAt.lte).toEqual(new Date('2026-07-31T23:59:59.999Z'));
    });

    it('без периода условие по дате не добавляется вовсе', async () => {
        const { service, findMany } = makeService();
        await service.listForCompany('c-1');
        expect(findMany.mock.calls[0][0].where.createdAt).toBeUndefined();
    });

    it('строка списка расшифровывает рейс: маршрут, водитель, заказчик', async () => {
        const { service } = makeService([
            {
                id: 'd-1',
                type: DocumentType.TTN,
                fileName: 'ттн-205.jpg',
                fileSize: 120_000,
                mimeType: 'image/jpeg',
                createdAt: new Date('2026-07-20T10:00:00Z'),
                orderId: 'o-1',
                uploadedBy: { firstName: 'Айгуль', lastName: 'Сериковна' },
                order: {
                    orderNumber: '000000205',
                    status: 'DELIVERED',
                    assignedDriverName: 'Ержан Алиев',
                    assignedDriverPlate: '123ABC02',
                    customerCompany: { name: 'ТОО «Магнум»' },
                    routePoints: [
                        { pointType: 'PICKUP', location: { city: 'Алматы', address: 'ул. Раимбека 100' } },
                        { pointType: 'DELIVERY', location: { city: 'Астана', address: 'пр. Кабанбай батыра 5' } },
                    ],
                },
            },
        ]);

        const [row] = await service.listForCompany('c-1');
        expect(row.orderNumber).toBe('000000205');
        expect(row.route).toBe('Алматы → Астана');
        expect(row.driverName).toBe('Ержан Алиев');
        expect(row.driverPlate).toBe('123ABC02');
        expect(row.customer).toBe('ТОО «Магнум»');
    });

    it('если города у точки нет — берём адрес, а не пустую строку', async () => {
        const { service } = makeService([
            {
                id: 'd-2', type: DocumentType.OTHER, fileName: 'акт.pdf', fileSize: 1, mimeType: 'application/pdf',
                createdAt: new Date(), orderId: 'o-2', uploadedBy: null,
                order: {
                    orderNumber: '000000206', status: 'DELIVERED',
                    assignedDriverName: null, assignedDriverPlate: null, customerCompany: null,
                    routePoints: [
                        { pointType: 'PICKUP', location: { city: null, address: 'Склад №3, трасса А-2' } },
                        { pointType: 'DELIVERY', location: { city: 'Шымкент', address: null } },
                    ],
                },
            },
        ]);

        const [row] = await service.listForCompany('c-1');
        expect(row.route).toBe('Склад №3, трасса А-2 → Шымкент');
    });

    it('документ без рейса не притворяется рейсом', async () => {
        const { service } = makeService([
            {
                id: 'd-3', type: DocumentType.OTHER, fileName: 'скан.pdf', fileSize: 1, mimeType: 'application/pdf',
                createdAt: new Date(), orderId: null, uploadedBy: { firstName: 'Гульнара', lastName: 'Ахметова' },
                order: null,
            },
        ]);

        const [row] = await service.listForCompany('c-1');
        expect(row.orderNumber).toBeNull();
        expect(row.route).toBeNull();
        expect(row.customer).toBeNull();
    });

    it('без компании в сессии журнал не отдаётся', async () => {
        const { service, findMany } = makeService();
        await expect(service.listForCompany(undefined)).rejects.toBeInstanceOf(ForbiddenException);
        // До базы дело не доходит — иначе запрос без отбора вернул бы всё подряд.
        expect(findMany).not.toHaveBeenCalled();
    });

    it('список ограничен сверху и отсортирован новыми вперёд', async () => {
        const { service, findMany } = makeService();
        await service.listForCompany('c-1');
        const args = findMany.mock.calls[0][0];
        expect(args.take).toBe(300);
        expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });
});
