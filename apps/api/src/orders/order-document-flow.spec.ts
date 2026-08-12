import { BadRequestException } from '@nestjs/common';
import { OrderDocumentKind } from '@prisma/client';
import { OrderDocumentsService, onlyVehicleChanged } from './order-documents.service';

/**
 * Черновик → проведён → отправлен.
 *
 * До этого документ появлялся сразу готовым, а печать с подписью ставились
 * одной кнопкой — любым, кто ведёт рейс. Заверенный документ с чужой ошибкой
 * (обычно «без НДС», проставленным по умолчанию) уходил контрагенту, и
 * узнавали об этом от него.
 *
 * Здесь проверяется не оформление, а границы: что можно сформировать, что
 * заверить, что отправить и в какой момент.
 */

const CONTRACT_SNAPSHOT = {
    order: {
        orderNumber: 'ЗК-2606',
        driverCost: 205000,
        executorHasVat: false,
        carrierPaymentDays: 15,
        carrierPaymentFrom: 'ORIGINALS',
        assignedDriverName: 'Сериков Асхат',
        assignedDriverPlate: '123 ABC 02',
        assignedDriverTrailer: null,
        vehicleModel: 'Volvo FH',
        driver: { firstName: 'Асхат', lastName: 'Сериков', phone: '+7 700 000 00 00' },
        routePoints: [{ pointType: 'PICKUP' }, { pointType: 'DELIVERY' }],
    },
    customer: { id: 'c-1', name: 'ТОО «Мы»' },
    carrier: { id: 'cp-1', name: 'ИП Сериков' },
};

function build(options: {
    last?: any;
    document?: any;
    confirmed?: boolean;
    missing?: string[];
    counterparty?: any;
    onPlatform?: any;
} = {}) {
    const created: any[] = [];
    const updates: any[] = [];

    const tx = {
        orderDocument: {
            findFirst: jest.fn().mockResolvedValue(options.last ?? null),
            create: jest.fn(async (args: any) => {
                created.push(args.data);
                return { id: 'd-new', version: args.data.version, status: args.data.status, kind: args.data.kind };
            }),
        },
    };

    const prisma: any = {
        $transaction: jest.fn(async (fn: any) => fn(tx)),
        orderDocument: {
            findFirst: jest.fn().mockResolvedValue(
                options.document === undefined
                    ? {
                        id: 'd-1', kind: 'CONTRACT', version: 1, status: 'DRAFT', orderId: 'o-1',
                        recipientCounterpartyId: 'cp-1', recipientCompanyId: null,
                        sentAt: null, sentToEmail: null, receiptStatus: null, receiptReason: null,
                        receiptAt: null, snapshot: CONTRACT_SNAPSHOT, replacesId: null,
                        order: { orderNumber: 'ЗК-2606' },
                    }
                    : options.document,
            ),
            update: jest.fn(async (args: any) => { updates.push(args); return { id: 'd-1', ...args.data }; }),
        },
        company: {
            findUnique: jest.fn().mockResolvedValue(
                options.counterparty === undefined
                    ? { id: 'cp-1', name: 'ИП Сериков', bin: '990101300123', email: 'carrier@mail.kz' }
                    : options.counterparty,
            ),
            findFirst: jest.fn().mockResolvedValue(options.onPlatform ?? null),
        },
    };

    const contracts: any = {
        snapshotFor: jest.fn().mockResolvedValue(CONTRACT_SNAPSHOT),
        renderFromSnapshot: jest.fn().mockResolvedValue(Buffer.from('pdf')),
        summaryOf: jest.fn(() => ({})),
    };
    const poa: any = {
        snapshotFor: jest.fn().mockResolvedValue({ order: {}, carrier: { id: 'cp-1' } }),
        renderFromSnapshot: jest.fn().mockResolvedValue(Buffer.from('pdf')),
        summaryOf: jest.fn(() => ({})),
    };
    const settlements: any = {
        stateOf: jest.fn().mockResolvedValue({
            confirmed: options.confirmed ?? true,
            missing: options.missing ?? [],
        }),
    };
    const email: any = { sendOrderDocumentEmail: jest.fn().mockResolvedValue(undefined) };

    const service = new OrderDocumentsService(prisma, contracts, poa, settlements, email);
    return { service, prisma, created, updates, email, settlements };
}

describe('Жизнь документа по рейсу', () => {
    describe('что получается при формировании', () => {
        it('договор-заявка — черновик: в нём ставка, НДС и срок оплаты', async () => {
            const { service, created } = build();
            await service.form(OrderDocumentKind.CONTRACT, 'o-1', 'c-1', 'u-1');

            expect(created[0].status).toBe('DRAFT');
            expect(created[0].postedAt).toBeNull();
        });

        it('доверенность — сразу проведённая: денег в ней нет', async () => {
            // Выписывает её тот же человек, который назначает водителя.
            // Ждать бухгалтера ради номера машины — значит держать погрузку.
            const { service, created } = build();
            await service.form(OrderDocumentKind.POWER_OF_ATTORNEY, 'o-1', 'c-1', 'u-1');

            expect(created[0].status).toBe('POSTED');
            expect(created[0].postedAt).toBeInstanceOf(Date);
        });

        it('получатель записывается в документ, а не выводится потом из заявки', async () => {
            // Перевозчика в рейсе меняют; бумага выписана прежнему.
            const { service, created } = build();
            await service.form(OrderDocumentKind.CONTRACT, 'o-1', 'c-1', 'u-1');

            expect(created[0].recipientCounterpartyId).toBe('cp-1');
        });

        it('исправление отправленного помечается как замена', async () => {
            const { service, created } = build({
                last: { id: 'd-1', version: 1, status: 'SENT', sentAt: new Date(), snapshot: CONTRACT_SNAPSHOT },
            });
            await service.form(OrderDocumentKind.CONTRACT, 'o-1', 'c-1', 'u-1');

            expect(created[0].version).toBe(2);
            expect(created[0].replacesId).toBe('d-1');
        });
    });

    describe('быстрый путь: поменяли машину', () => {
        it('сменились только водитель и номера — новая версия проводится сама', async () => {
            // Машина сломалась, вышла другая, рейс идёт. Деньги и стороны те
            // же — будить бухгалтера ночью незачем.
            const { service, created } = build({
                last: {
                    id: 'd-1', version: 1, status: 'POSTED', sentAt: null,
                    snapshot: {
                        ...CONTRACT_SNAPSHOT,
                        order: {
                            ...CONTRACT_SNAPSHOT.order,
                            assignedDriverName: 'Другой Водитель',
                            assignedDriverPlate: '456 XYZ 02',
                        },
                    },
                },
            });
            await service.form(OrderDocumentKind.CONTRACT, 'o-1', 'c-1', 'u-1');

            expect(created[0].status).toBe('POSTED');
        });

        it('сменилась ставка — снова черновик', async () => {
            const { service, created } = build({
                last: {
                    id: 'd-1', version: 1, status: 'POSTED', sentAt: null,
                    snapshot: {
                        ...CONTRACT_SNAPSHOT,
                        order: { ...CONTRACT_SNAPSHOT.order, driverCost: 180000 },
                    },
                },
            });
            await service.form(OrderDocumentKind.CONTRACT, 'o-1', 'c-1', 'u-1');

            expect(created[0].status).toBe('DRAFT');
        });

        it('прежняя версия была черновиком — новая тоже черновик', async () => {
            const { service, created } = build({
                last: { id: 'd-1', version: 1, status: 'DRAFT', sentAt: null, snapshot: CONTRACT_SNAPSHOT },
            });
            await service.form(OrderDocumentKind.CONTRACT, 'o-1', 'c-1', 'u-1');

            expect(created[0].status).toBe('DRAFT');
        });
    });

    describe('сравнение версий', () => {
        it('водитель, машина и прицеп — не повод для новой проверки', () => {
            const next = {
                ...CONTRACT_SNAPSHOT,
                order: {
                    ...CONTRACT_SNAPSHOT.order,
                    assignedDriverName: 'Иванов Иван',
                    assignedDriverPlate: '999 ZZZ 01',
                    assignedDriverTrailer: 'AA 111',
                    vehicleModel: 'MAN TGX',
                    driver: { firstName: 'Иван', lastName: 'Иванов', phone: '+7 701' },
                },
            };
            expect(onlyVehicleChanged(CONTRACT_SNAPSHOT, next)).toBe(true);
        });

        it('другой перевозчик — это другой договор', () => {
            const next = { ...CONTRACT_SNAPSHOT, carrier: { id: 'cp-2', name: 'ТОО «Другой»' } };
            expect(onlyVehicleChanged(CONTRACT_SNAPSHOT, next)).toBe(false);
        });

        it('другой НДС — это другой договор', () => {
            const next = {
                ...CONTRACT_SNAPSHOT,
                order: { ...CONTRACT_SNAPSHOT.order, executorHasVat: true },
            };
            expect(onlyVehicleChanged(CONTRACT_SNAPSHOT, next)).toBe(false);
        });

        it('другой срок оплаты — это другой договор', () => {
            const next = {
                ...CONTRACT_SNAPSHOT,
                order: { ...CONTRACT_SNAPSHOT.order, carrierPaymentDays: 30 },
            };
            expect(onlyVehicleChanged(CONTRACT_SNAPSHOT, next)).toBe(false);
        });
    });

    describe('проведение', () => {
        it('проведённый документ помнит, кто и когда его заверил', async () => {
            const { service, updates } = build();
            await service.post('d-1', 'c-1', 'u-9');

            expect(updates[0].data.status).toBe('POSTED');
            expect(updates[0].data.postedById).toBe('u-9');
            expect(updates[0].data.postedAt).toBeInstanceOf(Date);
        });

        it('пока расчёты не проверены — проводить нечего, и сказано почему', async () => {
            const { service, updates } = build({
                confirmed: false,
                missing: ['В карточке перевозчика «ИП Сериков» не заполнены условия расчётов'],
            });

            await expect(service.post('d-1', 'c-1', 'u-9'))
                .rejects.toThrow(/В карточке перевозчика/);
            expect(updates).toHaveLength(0);
        });

        it('дважды не проводится', async () => {
            const { service } = build({
                document: { id: 'd-1', kind: 'CONTRACT', version: 1, status: 'POSTED', orderId: 'o-1' },
            });
            await expect(service.post('d-1', 'c-1', 'u-9')).rejects.toThrow(/уже проведён/);
        });
    });

    describe('печать', () => {
        it('на черновик печать не ставится', async () => {
            const { service } = build();
            await expect(service.printSaved('d-1', 'c-1', { withStamp: true }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('черновик без печати скачивается: это проект для согласования', async () => {
            const { service } = build();
            await expect(service.printSaved('d-1', 'c-1')).resolves.toBeInstanceOf(Buffer);
        });

        it('на проведённом печать есть', async () => {
            const { service } = build({
                document: { id: 'd-1', kind: 'CONTRACT', status: 'POSTED', snapshot: CONTRACT_SNAPSHOT },
            });
            await expect(service.printSaved('d-1', 'c-1', { withStamp: true })).resolves.toBeInstanceOf(Buffer);
        });
    });

    describe('отправка', () => {
        it('черновик не уходит никуда', async () => {
            const { service, updates } = build();
            await expect(service.send('d-1', 'c-1', 'u-1')).rejects.toThrow(/сначала документ проводят/i);
            expect(updates).toHaveLength(0);
        });

        it('проведённый уходит почтой, если кабинета у контрагента нет', async () => {
            const { service, updates, email } = build({
                document: {
                    id: 'd-1', kind: 'CONTRACT', version: 1, status: 'POSTED', orderId: 'o-1',
                    recipientCounterpartyId: 'cp-1', recipientCompanyId: null, sentAt: null,
                    snapshot: CONTRACT_SNAPSHOT, replacesId: null, order: { orderNumber: 'ЗК-2606' },
                },
            });
            const result = await service.send('d-1', 'c-1', 'u-1');

            expect(email.sendOrderDocumentEmail).toHaveBeenCalledWith(
                'carrier@mail.kz', expect.objectContaining({ title: 'Договор-заявка' }),
            );
            expect(updates[0].data.status).toBe('SENT');
            expect(updates[0].data.sentToEmail).toBe('carrier@mail.kz');
            expect(result.inCabinet).toBe(false);
        });

        it('контрагент на платформе — документ ложится ему в кабинет, а не письмом', async () => {
            const { service, updates, email } = build({
                document: {
                    id: 'd-1', kind: 'CONTRACT', version: 1, status: 'POSTED', orderId: 'o-1',
                    recipientCounterpartyId: 'cp-1', recipientCompanyId: null, sentAt: null,
                    snapshot: CONTRACT_SNAPSHOT, replacesId: null, order: { orderNumber: 'ЗК-2606' },
                },
                onPlatform: { id: 'real-2', name: 'ИП Сериков' },
            });
            const result = await service.send('d-1', 'c-1', 'u-1');

            expect(email.sendOrderDocumentEmail).not.toHaveBeenCalled();
            expect(updates[0].data.recipientCompanyId).toBe('real-2');
            expect(result.inCabinet).toBe(true);
        });

        it('второй раз тот же документ не уходит — исправление отправляют версией', async () => {
            const { service } = build({
                document: {
                    id: 'd-1', kind: 'CONTRACT', version: 1, status: 'SENT', orderId: 'o-1',
                    recipientCounterpartyId: 'cp-1', sentAt: new Date('2026-08-10'),
                },
            });
            await expect(service.send('d-1', 'c-1', 'u-1')).rejects.toThrow(/новой версией/);
        });

        it('без кабинета и без почты — просят адрес, а не молчат', async () => {
            const { service } = build({
                document: {
                    id: 'd-1', kind: 'CONTRACT', version: 1, status: 'POSTED', orderId: 'o-1',
                    recipientCounterpartyId: 'cp-1', recipientCompanyId: null, sentAt: null,
                    snapshot: CONTRACT_SNAPSHOT, replacesId: null, order: { orderNumber: 'ЗК-2606' },
                },
                counterparty: { id: 'cp-1', name: 'ИП Сериков', bin: null, email: null },
            });
            await expect(service.send('d-1', 'c-1', 'u-1')).rejects.toThrow(/Впишите адрес/);
        });

        it('адрес можно указать при отправке — уйдёт на него', async () => {
            const { service, email } = build({
                document: {
                    id: 'd-1', kind: 'CONTRACT', version: 1, status: 'POSTED', orderId: 'o-1',
                    recipientCounterpartyId: 'cp-1', recipientCompanyId: null, sentAt: null,
                    snapshot: CONTRACT_SNAPSHOT, replacesId: null, order: { orderNumber: 'ЗК-2606' },
                },
                counterparty: { id: 'cp-1', name: 'ИП Сериков', bin: null, email: null },
            });
            await service.send('d-1', 'c-1', 'u-1', 'buh@carrier.kz');

            expect(email.sendOrderDocumentEmail).toHaveBeenCalledWith(
                'buh@carrier.kz', expect.anything(),
            );
        });
    });

    describe('куда уйдёт документ', () => {
        it('видно получателя и то, что у него есть кабинет', async () => {
            const { service } = build({
                document: {
                    id: 'd-1', kind: 'CONTRACT', version: 1, status: 'POSTED', orderId: 'o-1',
                    recipientCounterpartyId: 'cp-1', recipientCompanyId: null, sentAt: null,
                },
                onPlatform: { id: 'real-2', name: 'ИП Сериков' },
            });
            const delivery = await service.deliveryTarget('d-1', 'c-1');

            expect(delivery.available).toBe(true);
            expect(delivery.recipient?.name).toBe('ИП Сериков');
            expect(delivery.recipient?.onPlatform).toBe(true);
        });

        it('у отправленного видна судьба, а не только факт отправки', async () => {
            const { service } = build({
                document: {
                    id: 'd-1', kind: 'CONTRACT', version: 1, status: 'SENT', orderId: 'o-1',
                    recipientCounterpartyId: 'cp-1', recipientCompanyId: 'real-2',
                    sentAt: new Date('2026-08-10'), receiptStatus: 'REJECTED',
                    receiptReason: 'Ставка не та, о которой договаривались',
                    receiptAt: new Date('2026-08-11'),
                },
            });
            const delivery = await service.deliveryTarget('d-1', 'c-1');

            expect(delivery.sent?.status).toBe('REJECTED');
            expect(delivery.sent?.reason).toBe('Ставка не та, о которой договаривались');
        });
    });
});
