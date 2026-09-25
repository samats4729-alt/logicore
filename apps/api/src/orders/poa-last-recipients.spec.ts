import { OrderDocumentsService, POA_SHARE_KIND } from './order-documents.service';

/**
 * Кому ушла прежняя доверенность.
 *
 * Сломалась машина, водителя сменили — у склада на руках доверенность на
 * прежнего. Новую предлагаем отправить сразу и туда же, куда ушла прежняя:
 * набирать адреса заново диспетчер будет ночью, с дороги, с ошибками.
 *
 * Доверенность уходит двумя путями — письмом из карточки рейса («На почту»)
 * и сохранённой версией из «Документов рейса». Берём свежее из двух.
 */

const МЫ = 'company-1';

function build(options: { журнал?: any[]; версия?: any } = {}) {
    const prisma: any = {
        auditLog: { findMany: jest.fn().mockResolvedValue(options.журнал ?? []) },
        orderDocument: { findFirst: jest.fn().mockResolvedValue(options.версия ?? null) },
    };
    const service = new OrderDocumentsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { service, prisma };
}

const письмо = (at: string, emails: string[]) => ({
    createdAt: new Date(at),
    details: { kind: POA_SHARE_KIND, emails },
});

describe('Кому ушла прежняя доверенность', () => {
    it('письмом из карточки — те адреса, что отметили', async () => {
        const { service } = build({ журнал: [письмо('2026-09-24T10:00:00Z', ['sklad@magnum.kz', 'ohrana@magnum.kz'])] });

        const итог = await service.lastPowerOfAttorneyRecipients('o-1', МЫ);

        expect(итог.emails).toEqual(['sklad@magnum.kz', 'ohrana@magnum.kz']);
    });

    it('версией из «Документов рейса» — адреса из отправки версии', async () => {
        const { service } = build({
            версия: { sentAt: new Date('2026-09-24T10:00:00Z'), sentToEmail: 'sklad@magnum.kz, ohrana@magnum.kz' },
        });

        const итог = await service.lastPowerOfAttorneyRecipients('o-1', МЫ);

        expect(итог.emails).toEqual(['sklad@magnum.kz', 'ohrana@magnum.kz']);
    });

    it('отправляли обоими путями — берём свежее', async () => {
        const { service } = build({
            журнал: [письмо('2026-09-24T09:00:00Z', ['stary@magnum.kz'])],
            версия: { sentAt: new Date('2026-09-24T12:00:00Z'), sentToEmail: 'novy@magnum.kz' },
        });

        expect((await service.lastPowerOfAttorneyRecipients('o-1', МЫ)).emails).toEqual(['novy@magnum.kz']);
    });

    it('проведение и формирование документов за отправку доверенности не считаются', async () => {
        const { service } = build({
            журнал: [
                { createdAt: new Date('2026-09-24T12:00:00Z'), details: null },
                письмо('2026-09-24T09:00:00Z', ['sklad@magnum.kz']),
            ],
        });

        expect((await service.lastPowerOfAttorneyRecipients('o-1', МЫ)).emails).toEqual(['sklad@magnum.kz']);
    });

    it('не отправляли — пусто, окно подставит обычный список', async () => {
        const { service } = build();

        expect(await service.lastPowerOfAttorneyRecipients('o-1', МЫ)).toEqual({ at: null, emails: [] });
    });

    it('только свои отправки: у второй стороны рейса свои получатели', async () => {
        const { service, prisma } = build();

        await service.lastPowerOfAttorneyRecipients('o-1', МЫ);

        expect(prisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({ orderId: 'o-1', companyId: МЫ });
        expect(prisma.orderDocument.findFirst.mock.calls[0][0].where).toMatchObject({ orderId: 'o-1', companyId: МЫ });
    });
});
