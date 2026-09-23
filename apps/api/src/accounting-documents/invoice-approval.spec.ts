import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountingDocumentsService } from './accounting-documents.service';

/**
 * Решение финотдела по входящему счёту.
 *
 * Раньше бухгалтер оплачивал входящий счёт сам, как только тот приходил:
 * сверить его с договором и бюджетом было негде, а деньги уже ушли. Теперь
 * между «пришёл счёт» и «оплатили» стоит чужое решение.
 *
 * Согласовывать нужно оба вида входящего: и заведённый своим бухгалтером, и
 * присланный контрагентом с платформы. Для человека это один и тот же счёт,
 * и проверка не должна зависеть от того, работает контрагент в LogiCore или
 * нет.
 */

const КОМПАНИЯ = 'company-1';
const D = (v: string | number) => new Prisma.Decimal(v);

function makeService(документ: any = { id: 'd-1', direction: 'INCOMING', status: 'POSTED', approvalStatus: null }) {
    const обновления: any[] = [];
    const prisma: any = {
        accountingDocument: {
            findFirst: jest.fn(async () => документ),
            findMany: jest.fn(async () => []),
            update: jest.fn(async (args: any) => {
                обновления.push(args);
                return { id: 'd-1', number: 'СЧ-ВХ-000001', ...args.data, approvedBy: null };
            }),
        },
    };
    const service = new AccountingDocumentsService(
        prisma, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    return { service, prisma, обновления };
}

describe('Согласование входящего счёта', () => {
    it('согласован — записано решение, кто и когда', async () => {
        const { service, обновления } = makeService();

        await service.decideApproval(КОМПАНИЯ, 'finance-1', 'd-1', 'APPROVED');

        expect(обновления[0].data.approvalStatus).toBe('APPROVED');
        expect(обновления[0].data.approvedById).toBe('finance-1');
        expect(обновления[0].data.approvedAt).toBeInstanceOf(Date);
    });

    it('отказ без причины не проходит', async () => {
        // «Не согласовано» без объяснения — это телефонный звонок, от
        // которого и уходим: бухгалтеру решать, ждать исправленный счёт или
        // вернуть его контрагенту.
        const { service } = makeService();

        await expect(service.decideApproval(КОМПАНИЯ, 'finance-1', 'd-1', 'REJECTED', '  '))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('отказ с причиной — причина сохраняется', async () => {
        const { service, обновления } = makeService();

        await service.decideApproval(КОМПАНИЯ, 'finance-1', 'd-1', 'REJECTED', 'Сумма выше договорной');

        expect(обновления[0].data.approvalStatus).toBe('REJECTED');
        expect(обновления[0].data.approvalNote).toBe('Сумма выше договорной');
    });

    it('отменённый счёт согласовывать нечего', async () => {
        const { service } = makeService({
            id: 'd-1', direction: 'INCOMING', status: 'CANCELLED', approvalStatus: null,
        });

        await expect(service.decideApproval(КОМПАНИЯ, 'finance-1', 'd-1', 'APPROVED'))
            .rejects.toThrow('отменён');
    });

    it('чужой счёт не найден', async () => {
        const { service } = makeService(null);

        await expect(service.decideApproval(КОМПАНИЯ, 'finance-1', 'd-1', 'APPROVED'))
            .rejects.toBeInstanceOf(NotFoundException);
    });

    it('согласовать можно и свой входящий, и присланный контрагентом', async () => {
        // Отбор идёт по обоим случаям сразу: во втором документ чужой, а мы
        // получатель.
        const { service, prisma } = makeService();

        await service.decideApproval(КОМПАНИЯ, 'finance-1', 'd-1', 'APPROVED');

        const { where } = prisma.accountingDocument.findFirst.mock.calls[0][0];
        expect(where.OR).toEqual(expect.arrayContaining([
            { companyId: КОМПАНИЯ, direction: 'INCOMING' },
            { recipientCompanyId: КОМПАНИЯ },
        ]));
    });
});

describe('Очередь входящих счетов для дашборда', () => {
    it('оплаченные в очереди не висят', async () => {
        // Очередь — это работа, а оплаченный счёт уже история.
        const { service, prisma } = makeService();

        await service.listIncomingInvoices(КОМПАНИЯ);

        const { where } = prisma.accountingDocument.findMany.mock.calls[0][0];
        expect(where.balanceDue).toEqual({ gt: 0 });
        expect(where.status).toEqual({ not: 'CANCELLED' });
    });

    it('согласующему можно спросить только ждущие его решения', async () => {
        const { service, prisma } = makeService();

        await service.listIncomingInvoices(КОМПАНИЯ, { onlyAwaitingApproval: true });

        const { where } = prisma.accountingDocument.findMany.mock.calls[0][0];
        expect(where.approvalStatus).toBeNull();
    });

    it('поставщик — тот, кто выставил счёт, кем бы документ ни был заведён', async () => {
        const { service, prisma } = makeService();
        prisma.accountingDocument.findMany.mockResolvedValueOnce([
            {
                id: 'a', number: 'СЧ-1', documentDate: new Date(), dueDate: null, currency: 'KZT',
                total: D(1000), balanceDue: D(1000), approvalStatus: null, approvalNote: null,
                approvedAt: null, receiptStatus: null, approvedBy: null,
                counterparty: { id: 'cp-1', name: 'ИП Сериков' },
                company: { id: КОМПАНИЯ, name: 'Мы' },
                recipientCompanyId: null,
            },
            {
                id: 'b', number: 'СЧ-2', documentDate: new Date(), dueDate: null, currency: 'KZT',
                total: D(2000), balanceDue: D(2000), approvalStatus: null, approvalNote: null,
                approvedAt: null, receiptStatus: null, approvedBy: null,
                counterparty: { id: КОМПАНИЯ, name: 'Мы' },
                company: { id: 'cp-2', name: 'ТОО «Алтын Жол»' },
                recipientCompanyId: КОМПАНИЯ,
            },
        ]);

        const очередь = await service.listIncomingInvoices(КОМПАНИЯ);

        expect(очередь[0].supplier?.name).toBe('ИП Сериков');
        expect(очередь[1].supplier?.name).toBe('ТОО «Алтын Жол»');
    });
});
