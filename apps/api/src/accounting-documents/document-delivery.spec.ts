import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountingDocumentStatus } from '@prisma/client';
import { AccountingDocumentsService } from './accounting-documents.service';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';

/**
 * Доставка документа контрагенту на платформе.
 *
 * До сих пор счёт от компании А компании Б у Б не появлялся — она заводила
 * его руками. Один документ существовал дважды, с разными номерами и суммами
 * на слух, и сверка превращалась в спор, чей вариант правильный.
 *
 * Здесь документ остаётся ОДИН: получателю открывается доступ на чтение к
 * той же строке. Поэтому главное, что проверяется, — границы: что можно
 * отправить, кому и что получатель может с этим сделать.
 */
describe('Отправка документа контрагенту', () => {
    const COMPANY = 'c-1';
    const RECIPIENT = 'c-2';

    const build = (options: { document?: any; platformCompany?: any } = {}) => {
        const updates: any[] = [];
        const prisma: any = {
            accountingDocument: {
                findFirst: jest.fn().mockResolvedValue(
                    options.document === undefined
                        ? {
                            id: 'd-1', number: 'СЧ-1',
                            status: AccountingDocumentStatus.POSTED,
                            sentAt: null,
                            counterparty: { id: 'cp-1', name: 'ТОО «Алтын Жол»', bin: '150641116666' },
                        }
                        : options.document,
                ),
                update: jest.fn(async (args: any) => { updates.push(args); return { id: 'd-1', number: 'СЧ-1', ...args.data }; }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            company: {
                findFirst: jest.fn().mockResolvedValue(
                    options.platformCompany === undefined
                        ? { id: RECIPIENT, name: 'ТОО «Алтын Жол»', bin: '150641116666' }
                        : options.platformCompany,
                ),
            },
        };
        const service = new AccountingDocumentsService(
            prisma,
            new AccountingDocumentCalculatorService(),
            { checkPeriodNotClosed: jest.fn() } as any,
            {} as any,
            { toBase: jest.fn().mockResolvedValue(null) } as any,
        );
        return { service, prisma, updates };
    };

    describe('что можно отправить', () => {
        it('проведённый документ уходит получателю', async () => {
            const { service, updates } = build();
            await service.sendToCounterparty(COMPANY, 'u-1', 'd-1');

            expect(updates[0].data.recipientCompanyId).toBe(RECIPIENT);
            expect(updates[0].data.sentAt).toBeInstanceOf(Date);
        });

        it('черновик не отправляется', async () => {
            // У контрагента светились бы наши недоделанные суммы.
            const { service, updates } = build({
                document: {
                    id: 'd-1', status: AccountingDocumentStatus.DRAFT, sentAt: null,
                    counterparty: { bin: '150641116666' },
                },
            });

            await expect(service.sendToCounterparty(COMPANY, 'u-1', 'd-1'))
                .rejects.toThrow(/только проведённый/);
            expect(updates).toHaveLength(0);
        });

        it('повторная отправка не проходит', async () => {
            const { service, updates } = build({
                document: {
                    id: 'd-1', status: AccountingDocumentStatus.POSTED,
                    sentAt: new Date('2026-08-01'),
                    counterparty: { bin: '150641116666' },
                },
            });

            await expect(service.sendToCounterparty(COMPANY, 'u-1', 'd-1'))
                .rejects.toThrow(/уже отправлен/);
            expect(updates).toHaveLength(0);
        });

        it('без БИН у контрагента отправлять некуда', async () => {
            const { service } = build({
                document: {
                    id: 'd-1', status: AccountingDocumentStatus.POSTED, sentAt: null,
                    counterparty: { name: 'ТОО без БИН', bin: null },
                },
            });

            await expect(service.sendToCounterparty(COMPANY, 'u-1', 'd-1'))
                .rejects.toThrow(/БИН/);
        });

        it('контрагента нет на платформе — отказ с подсказкой про ссылку', async () => {
            // Молчать нельзя: человек нажал «Отправить» и должен понять,
            // почему ничего не произошло.
            const { service } = build({ platformCompany: null });

            await expect(service.sendToCounterparty(COMPANY, 'u-1', 'd-1'))
                .rejects.toThrow(/ссылкой/);
        });

        it('чужой документ отправить нельзя', async () => {
            const { service } = build({ document: null });

            await expect(service.sendToCounterparty(COMPANY, 'u-1', 'd-1'))
                .rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('кого ищем по БИН', () => {
        it('настоящего арендатора, а не справочную копию', async () => {
            // Копия контрагента заведена нами: у неё нет ни сотрудников, ни
            // входа — доставлять туда некуда.
            const { service, prisma } = build();
            await service.sendToCounterparty(COMPANY, 'u-1', 'd-1');

            const where = prisma.company.findFirst.mock.calls[0][0].where;
            expect(where.bin).toBe('150641116666');
            expect(where.isExternal).toBe(false);
        });

        it('самому себе документ не отправляется', async () => {
            const { service, prisma } = build();
            await service.sendToCounterparty(COMPANY, 'u-1', 'd-1');

            const where = prisma.company.findFirst.mock.calls[0][0].where;
            expect(where.id).toEqual({ not: COMPANY });
        });
    });

    describe('решение получателя', () => {
        it('принять можно', async () => {
            const { service, updates } = build({ document: { id: 'd-1', receiptStatus: null } });
            await service.reviewIncoming(RECIPIENT, 'u-2', 'd-1', 'ACCEPTED');

            expect(updates[0].data.receiptStatus).toBe('ACCEPTED');
            expect(updates[0].data.receiptReason).toBeNull();
        });

        it('отклонить без причины нельзя', async () => {
            // «Отклонено» без объяснения означает телефонный звонок — он и
            // так был до платформы.
            const { service, updates } = build({ document: { id: 'd-1', receiptStatus: null } });

            await expect(service.reviewIncoming(RECIPIENT, 'u-2', 'd-1', 'REJECTED'))
                .rejects.toThrow(/причину/);
            expect(updates).toHaveLength(0);
        });

        it('причина отклонения сохраняется', async () => {
            const { service, updates } = build({ document: { id: 'd-1', receiptStatus: null } });
            await service.reviewIncoming(RECIPIENT, 'u-2', 'd-1', 'REJECTED', '  Сумма не совпадает с актом  ');

            expect(updates[0].data.receiptReason).toBe('Сумма не совпадает с актом');
        });

        it('решение принимает только получатель', async () => {
            const { service, prisma } = build({ document: { id: 'd-1', receiptStatus: null } });
            await service.reviewIncoming(RECIPIENT, 'u-2', 'd-1', 'ACCEPTED');

            const where = prisma.accountingDocument.findFirst.mock.calls[0][0].where;
            expect(where.recipientCompanyId).toBe(RECIPIENT);
        });

        it('по чужому входящему решения нет', async () => {
            const { service } = build({ document: null });

            await expect(service.reviewIncoming(RECIPIENT, 'u-2', 'd-1', 'ACCEPTED'))
                .rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('чтение документа получателем', () => {
        it('получатель видит документ, а посторонний — нет', async () => {
            const { service, prisma } = build();
            await service.getById(RECIPIENT, 'd-1').catch(() => null);

            const where = prisma.accountingDocument.findFirst.mock.calls[0][0].where;
            // Либо свой документ, либо доставленный нам — и только отправленный.
            expect(where.OR).toEqual([
                { companyId: RECIPIENT },
                { recipientCompanyId: RECIPIENT, sentAt: { not: null } },
            ]);
        });
    });

    describe('что видит отправитель', () => {
        /**
         * Отправка без обратной связи бесполезна: контрагент отклоняет счёт
         * с причиной, а выставившая сторона узнаёт об этом по телефону —
         * ровно то, от чего уходили.
         */
        const buildSender = (document: any) => {
            const prisma: any = {
                accountingDocument: { findFirst: jest.fn().mockResolvedValue(document) },
                company: { findFirst: jest.fn().mockResolvedValue({ id: RECIPIENT, name: 'ТОО «Алтын Жол»', bin: '150641116666' }) },
            };
            const service = new AccountingDocumentsService(
                prisma,
                new AccountingDocumentCalculatorService(),
                { checkPeriodNotClosed: jest.fn() } as any,
                {} as any,
                { toBase: jest.fn().mockResolvedValue(null) } as any,
            );
            return service;
        };

        const posted = (overrides: any = {}) => ({
            status: AccountingDocumentStatus.POSTED,
            sentAt: new Date('2026-08-04T08:18:00Z'),
            receiptStatus: null,
            receiptReason: null,
            receiptAt: null,
            counterparty: { name: 'ТОО «Алтын Жол»', bin: '150641116666' },
            recipientCompany: { id: RECIPIENT, name: 'ТОО «Алтын Жол»', bin: '150641116666' },
            ...overrides,
        });

        it('причина отказа возвращается отправителю', async () => {
            const service = buildSender(posted({
                receiptStatus: 'REJECTED',
                receiptReason: 'Сумма не совпадает с актом за август',
                receiptAt: new Date('2026-08-04T09:00:00Z'),
            }));

            const delivery = await service.deliveryTarget(COMPANY, 'd-1');

            expect(delivery.sent?.status).toBe('REJECTED');
            expect(delivery.sent?.reason).toBe('Сумма не совпадает с актом за август');
            expect(delivery.sent?.to?.name).toBe('ТОО «Алтын Жол»');
        });

        it('пока решения нет, видно хотя бы что документ ушёл', async () => {
            const service = buildSender(posted());

            const delivery = await service.deliveryTarget(COMPANY, 'd-1');

            expect(delivery.sent?.at).toEqual(new Date('2026-08-04T08:18:00Z'));
            expect(delivery.sent?.status).toBeNull();
        });

        it('у неотправленного документа судьбы ещё нет', async () => {
            const service = buildSender(posted({ sentAt: null }));

            const delivery = await service.deliveryTarget(COMPANY, 'd-1');

            expect(delivery.sent).toBeNull();
            expect(delivery.available).toBe(true);
        });

        it('без БИН у контрагента отправитель всё равно видит, что документ ушёл раньше', async () => {
            // БИН могли стереть в справочнике уже после отправки — судьба
            // документа от этого не исчезает.
            const service = buildSender(posted({
                counterparty: { name: 'ТОО «Алтын Жол»', bin: null },
                receiptStatus: 'ACCEPTED',
            }));

            const delivery = await service.deliveryTarget(COMPANY, 'd-1');

            expect(delivery.available).toBe(false);
            expect(delivery.sent?.status).toBe('ACCEPTED');
        });
    });

    describe('что получатель делать не может', () => {
        /**
         * Читать доставленный документ получатель обязан, а распоряжаться им —
         * нет: провести или отменить чужой счёт может только выпустившая
         * сторона. Поэтому мок различает запросы по where: запрос «наш ли это
         * документ» идёт с companyId, запрос на чтение — с OR.
         */
        const buildOwned = () => {
            const prisma: any = {
                accountingDocument: {
                    findFirst: jest.fn(async (args: any) => (
                        args.where.companyId !== undefined && args.where.companyId !== COMPANY
                            ? null
                            : {
                                id: 'd-1',
                                status: AccountingDocumentStatus.POSTED,
                                documentDate: new Date('2026-08-01'),
                                operationDate: null,
                                paymentAllocations: [],
                                lines: [],
                                orders: [],
                            }
                    )),
                    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                },
            };
            const service = new AccountingDocumentsService(
                prisma,
                new AccountingDocumentCalculatorService(),
                { checkPeriodNotClosed: jest.fn() } as any,
                {} as any,
                { toBase: jest.fn().mockResolvedValue(null) } as any,
            );
            return { service, prisma };
        };

        it('отменить доставленный ему документ получатель не может', async () => {
            // Без проверки владельца получатель дёргал бы updateMany вхолостую
            // и получал «документ изменён другим пользователем» — сообщение,
            // из которого не понять, что документ просто не его.
            const { service, prisma } = buildOwned();

            await expect(service.cancel(RECIPIENT, 'u-2', 'd-1', 'Не согласен'))
                .rejects.toBeInstanceOf(NotFoundException);
            expect(prisma.accountingDocument.updateMany).not.toHaveBeenCalled();
        });

        it('провести доставленный ему документ получатель не может', async () => {
            const { service, prisma } = buildOwned();

            await expect(service.post(RECIPIENT, 'u-2', 'd-1'))
                .rejects.toBeInstanceOf(NotFoundException);
            expect(prisma.accountingDocument.updateMany).not.toHaveBeenCalled();
        });

        it('выпустившая сторона проходит проверку владельца', async () => {
            // Обратная сторона: защита не должна перекрыть работу хозяину.
            const { service } = buildOwned();

            await expect(service.cancel(COMPANY, 'u-1', 'd-1', 'Ошибка в сумме'))
                .resolves.toBeDefined();
        });
    });

    describe('список входящих', () => {
        it('берутся только доставленные нам', async () => {
            const { service, prisma } = build();
            await service.listIncomingDelivered(RECIPIENT);

            const where = prisma.accountingDocument.findMany.mock.calls[0][0].where;
            expect(where.recipientCompanyId).toBe(RECIPIENT);
            expect(where.sentAt).toEqual({ not: null });
        });

        it('нерассмотренные отбираются отдельно', async () => {
            const { service, prisma } = build();
            await service.listIncomingDelivered(RECIPIENT, { status: 'PENDING' });

            const where = prisma.accountingDocument.findMany.mock.calls[0][0].where;
            expect(where.receiptStatus).toBeNull();
        });
    });
});
