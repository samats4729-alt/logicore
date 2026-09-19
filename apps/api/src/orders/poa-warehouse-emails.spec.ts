import { BadRequestException } from '@nestjs/common';
import { OrderDocumentsService, разобратьПочты } from './order-documents.service';

/**
 * Куда уходит доверенность и почему её не набирают заново каждый рейс.
 *
 * Постоянного получателя у доверенности нет: её выписывают на водителя и
 * предъявляют на складе. Поэтому поле в окне отправки было пустым всегда —
 * менеджер каждый раз вспоминал и набирал адреса склада руками. Один из них
 * он набирал с опечаткой, и на погрузке машину не ждали.
 *
 * Правило: куда отправили, то и запомнили — за складами погрузки этого
 * рейса. В следующий раз по тому же складу список подставится сам.
 *
 * У договора-заявки получатель постоянный, его почта живёт в карточке
 * контрагента, и складу она отношения не имеет — за складом не запоминаем.
 */

const ПОГРУЗКА = [{ locationId: 'sklad-1' }];

function build(options: {
    recipient?: any;
    pickups?: any[];
    savedEmails?: any[];
    locations?: any[];
} = {}) {
    const upserts: any[] = [];
    const письма: string[] = [];

    const prisma: any = {
        orderDocument: {
            findFirst: jest.fn().mockResolvedValue({
                id: 'd-1', kind: 'POWER_OF_ATTORNEY', version: 1, status: 'POSTED', orderId: 'o-1',
                recipientCounterpartyId: options.recipient ? 'cp-1' : null,
                recipientCompanyId: null,
                sentAt: null, sentToEmail: null, receiptStatus: null, receiptReason: null,
                receiptAt: null, snapshot: { order: {} }, replacesId: null,
                order: { orderNumber: 'ЗК-2601' },
            }),
            update: jest.fn(async (args: any) => ({ id: 'd-1', ...args.data })),
        },
        company: {
            findUnique: jest.fn().mockResolvedValue(options.recipient ?? { name: 'ТОО «Мы»' }),
            findFirst: jest.fn().mockResolvedValue(null),
        },
        orderRoutePoint: { findMany: jest.fn().mockResolvedValue(options.pickups ?? ПОГРУЗКА) },
        locationEmailList: {
            findMany: jest.fn().mockResolvedValue(options.savedEmails ?? []),
            upsert: jest.fn(async (args: any) => { upserts.push(args); return args.create; }),
        },
        location: { findMany: jest.fn().mockResolvedValue(options.locations ?? []) },
    };

    const poa: any = {
        renderFromSnapshot: jest.fn().mockResolvedValue(Buffer.from('pdf')),
        summaryOf: jest.fn(() => ({})),
    };
    const email: any = {
        sendOrderDocumentEmail: jest.fn(async (to: string) => { письма.push(to); }),
    };
    const redis: any = { delByPattern: jest.fn().mockResolvedValue(undefined) };

    const service = new OrderDocumentsService(
        prisma,
        { renderFromSnapshot: jest.fn().mockResolvedValue(Buffer.from('pdf')), summaryOf: jest.fn(() => ({})) } as any,
        poa,
        { stateOf: jest.fn().mockResolvedValue({ confirmed: true, missing: [] }) } as any,
        email,
        redis,
    );
    return { service, prisma, upserts, письма, redis };
}

describe('Почты складов для доверенности', () => {
    describe('что подставляется в окно отправки', () => {
        it('список, заведённый компанией за складом', async () => {
            const { service } = build({
                savedEmails: [{ locationId: 'sklad-1', emails: 'sklad@magnum.kz,ohrana@magnum.kz' }],
            });

            const итог = await service.deliveryTarget('d-1', 'c-1');

            expect(итог.suggestedEmails).toEqual(['sklad@magnum.kz', 'ohrana@magnum.kz']);
        });

        it('свой список компании сильнее общего поля в карточке адреса', async () => {
            // Справочник адресов общий: у складов владельца нет. Общее поле —
            // это то, что вписал кто-то другой, и подменять им свои контакты
            // нельзя.
            const { service } = build({
                savedEmails: [{ locationId: 'sklad-1', emails: 'nash@magnum.kz' }],
                locations: [{ id: 'sklad-1', emails: 'chuzhoy@magnum.kz' }],
            });

            const итог = await service.deliveryTarget('d-1', 'c-1');

            expect(итог.suggestedEmails).toEqual(['nash@magnum.kz']);
        });

        it('нет своего списка — берём общий, чтобы поле не пустовало', async () => {
            const { service } = build({
                locations: [{ id: 'sklad-1', emails: 'obshiy@magnum.kz' }],
            });

            const итог = await service.deliveryTarget('d-1', 'c-1');

            expect(итог.suggestedEmails).toEqual(['obshiy@magnum.kz']);
        });

        it('повторы между складами не задваиваются', async () => {
            // Один и тот же диспетчер на двух складах получил бы два письма.
            const { service } = build({
                pickups: [{ locationId: 'sklad-1' }, { locationId: 'sklad-2' }],
                savedEmails: [
                    { locationId: 'sklad-1', emails: 'dispetcher@magnum.kz' },
                    { locationId: 'sklad-2', emails: 'Dispetcher@magnum.kz,vtoroy@magnum.kz' },
                ],
            });

            const итог = await service.deliveryTarget('d-1', 'c-1');

            expect(итог.suggestedEmails).toEqual(['dispetcher@magnum.kz', 'vtoroy@magnum.kz']);
        });

        it('у договора-заявки склад ни при чём — подсказки нет', async () => {
            const { service } = build({
                recipient: { id: 'cp-1', name: 'ИП Сериков', bin: '990101300123', email: 'carrier@mail.kz' },
                savedEmails: [{ locationId: 'sklad-1', emails: 'sklad@magnum.kz' }],
            });

            const итог = await service.deliveryTarget('d-1', 'c-1');

            expect(итог.suggestedEmails).toEqual([]);
        });
    });

    describe('отправка', () => {
        it('письмо уходит каждому адресу отдельно', async () => {
            // Одним письмом на всех получатели с разных складов увидели бы
            // почты друг друга, а один упавший адрес унёс бы остальные.
            const { service, письма } = build();

            await service.send('d-1', 'c-1', 'u-1', ['a@magnum.kz', 'b@magnum.kz']);

            expect(письма).toEqual(['a@magnum.kz', 'b@magnum.kz']);
        });

        it('строку через запятую тоже принимаем', async () => {
            const { service, письма } = build();

            await service.send('d-1', 'c-1', 'u-1', 'a@magnum.kz, b@magnum.kz');

            expect(письма).toEqual(['a@magnum.kz', 'b@magnum.kz']);
        });

        it('опечатка не даёт отправить', async () => {
            // Иначе письмо тихо не уйдёт, а человек будет считать, что
            // доверенность на складе.
            const { service, письма } = build();

            await expect(service.send('d-1', 'c-1', 'u-1', ['a@magnum.kz', 'sklad@magnum']))
                .rejects.toBeInstanceOf(BadRequestException);
            expect(письма).toEqual([]);
        });
    });

    describe('что запоминается', () => {
        it('отправленные адреса ложатся за складом погрузки', async () => {
            const { service, upserts } = build();

            await service.send('d-1', 'c-1', 'u-1', ['sklad@magnum.kz', 'ohrana@magnum.kz']);

            expect(upserts).toHaveLength(1);
            expect(upserts[0].where.locationId_companyId).toEqual({
                locationId: 'sklad-1', companyId: 'c-1',
            });
            expect(upserts[0].update.emails).toBe('sklad@magnum.kz,ohrana@magnum.kz');
        });

        it('убранный из списка адрес больше не подставится', async () => {
            // Список из окна отправки и список за складом — одно место, а не
            // два расходящихся. Убрал — значит убрал.
            const { service, upserts } = build({
                savedEmails: [{ locationId: 'sklad-1', emails: 'staryi@magnum.kz,novyi@magnum.kz' }],
            });

            await service.send('d-1', 'c-1', 'u-1', ['novyi@magnum.kz']);

            expect(upserts[0].update.emails).toBe('novyi@magnum.kz');
        });

        it('складов несколько — запоминаем всем', async () => {
            const { service, upserts } = build({
                pickups: [{ locationId: 'sklad-1' }, { locationId: 'sklad-2' }],
            });

            await service.send('d-1', 'c-1', 'u-1', ['a@magnum.kz']);

            expect(upserts.map((u) => u.where.locationId_companyId.locationId))
                .toEqual(['sklad-1', 'sklad-2']);
        });

        it('у договора-заявки за складом не запоминаем', async () => {
            const { service, upserts } = build({
                recipient: { id: 'cp-1', name: 'ИП Сериков', bin: '990101300123', email: null },
            });

            await service.send('d-1', 'c-1', 'u-1', ['buh@serikov.kz']);

            expect(upserts).toEqual([]);
        });

        it('маршрут без точек погрузки запоминать некуда — и это не ошибка', async () => {
            const { service, upserts, письма } = build({ pickups: [] });

            await service.send('d-1', 'c-1', 'u-1', ['a@magnum.kz']);

            expect(письма).toEqual(['a@magnum.kz']);
            expect(upserts).toEqual([]);
        });

        it('кэш адресов сбрасывается — иначе подстановка вернёт прежнее', async () => {
            const { service, redis } = build();

            await service.send('d-1', 'c-1', 'u-1', ['a@magnum.kz']);

            expect(redis.delByPattern).toHaveBeenCalledWith('locations:*');
        });
    });
});

describe('разобратьПочты', () => {
    it('строку через запятую и точку с запятой — в список', () => {
        expect(разобратьПочты('a@b.kz, c@d.kz; e@f.kz')).toEqual(['a@b.kz', 'c@d.kz', 'e@f.kz']);
    });

    it('один и тот же ящик в разном регистре — один адрес', () => {
        expect(разобратьПочты(['Sklad@b.kz', 'sklad@b.kz'])).toEqual(['Sklad@b.kz']);
    });

    it('пусто — пустой список, а не строка из пустоты', () => {
        expect(разобратьПочты(null)).toEqual([]);
        expect(разобратьПочты(' , ; ')).toEqual([]);
    });
});
