import { ContractsService } from './contracts.service';

/**
 * Своя сторона договора в холдинге.
 *
 * У аккаунта может быть несколько организаций. Договор заключался всегда от
 * той, в которую человек сейчас переключён, и сменить её потом было нельзя:
 * завёл машинально не от той — заводи заново, теряя правленый текст,
 * реквизиты и доп. соглашения.
 */

const Я = 'org-1';
const ВТОРАЯ_МОЯ = 'org-2';
const ЧУЖАЯ = 'org-чужая';
const КОНТРАГЕНТ = 'partner';
const ПОЛЬЗОВАТЕЛЬ = 'user-1';

function служба(опции: {
    договор?: Record<string, any>;
    мои?: string[];
    документов?: number;
} = {}) {
    const мои = опции.мои ?? [Я, ВТОРАЯ_МОЯ];
    const договор = {
        id: 'c1',
        contractNumber: 'Д-1',
        forwarderCompanyId: Я,
        customerCompanyId: КОНТРАГЕНТ,
        _count: { accountingDocuments: опции.документов ?? 0 },
        ...опции.договор,
    };
    const prisma: any = {
        contract: {
            findUnique: jest.fn(async () => договор),
            update: jest.fn(async ({ data }: any) => ({ ...договор, ...data })),
            create: jest.fn(async ({ data }: any) => ({ id: 'новый', ...data })),
        },
        userCompanyRelation: {
            findFirst: jest.fn(async ({ where }: any) =>
                мои.includes(where.companyId) ? { companyId: where.companyId } : null),
            findMany: jest.fn(async () => мои.map(id => ({ company: { id, name: id, bin: null } }))),
        },
        user: { findUnique: jest.fn(async () => ({ companyId: Я })) },
        company: {
            findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, isExternal: true })),
            findFirst: jest.fn(async () => null),
        },
        partnership: { findFirst: jest.fn(async () => ({ id: 'p' })) },
    };
    return { service: new ContractsService(prisma), prisma };
}

describe('Организация — сторона договора', () => {
    it('меняется на другую свою организацию', async () => {
        const { service, prisma } = служба();
        await service.changeContractOrganization('c1', ПОЛЬЗОВАТЕЛЬ, Я, ВТОРАЯ_МОЯ);

        expect(prisma.contract.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { forwarderCompanyId: ВТОРАЯ_МОЯ } }),
        );
    });

    it('чужую организацию подставить нельзя', async () => {
        // Список организаций приходит из браузера, и в запрос можно вписать
        // что угодно. Без проверки это был бы способ завести договор от
        // имени компании, к которой человек отношения не имеет.
        const { service, prisma } = служба();
        await expect(service.changeContractOrganization('c1', ПОЛЬЗОВАТЕЛЬ, Я, ЧУЖАЯ))
            .rejects.toThrow('Это не ваша организация');
        expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('нельзя сделать своей стороной вторую сторону договора', async () => {
        const { service } = служба({ мои: [Я, КОНТРАГЕНТ] });
        await expect(service.changeContractOrganization('c1', ПОЛЬЗОВАТЕЛЬ, Я, КОНТРАГЕНТ))
            .rejects.toThrow('уже вторая сторона');
    });

    it('договор с выписанными документами не перевешивается', async () => {
        // Счёт и акт ссылаются на договор, и в них напечатана организация,
        // бывшая стороной в момент выписки. Сменишь её — бумаги начнут
        // расходиться с базой, а выданное уже не исправить.
        const { service, prisma } = служба({ документов: 3 });
        await expect(service.changeContractOrganization('c1', ПОЛЬЗОВАТЕЛЬ, Я, ВТОРАЯ_МОЯ))
            .rejects.toThrow('уже выписаны документы');
        expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('меняется и сторона заказчика, если своя сторона — заказчик', async () => {
        const { service, prisma } = служба({
            договор: { forwarderCompanyId: КОНТРАГЕНТ, customerCompanyId: Я },
        });
        await service.changeContractOrganization('c1', ПОЛЬЗОВАТЕЛЬ, Я, ВТОРАЯ_МОЯ);

        expect(prisma.contract.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { customerCompanyId: ВТОРАЯ_МОЯ } }),
        );
    });

    it('в чужой договор не пускают', async () => {
        const { service } = служба({
            договор: { forwarderCompanyId: 'кто-то', customerCompanyId: 'ещё-кто-то' },
        });
        await expect(service.changeContractOrganization('c1', ПОЛЬЗОВАТЕЛЬ, Я, ВТОРАЯ_МОЯ))
            .rejects.toThrow('Нет доступа');
    });

    it('при заведении договор оформляется на выбранную организацию', async () => {
        const { service, prisma } = служба();
        await service.createContract(Я, 'COMPANY_ADMIN', {
            myRole: 'FORWARDER',
            partnerCompanyId: КОНТРАГЕНТ,
            contractNumber: 'Д-2',
            myCompanyId: ВТОРАЯ_МОЯ,
        }, ПОЛЬЗОВАТЕЛЬ);

        expect(prisma.contract.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    forwarderCompanyId: ВТОРАЯ_МОЯ,
                    customerCompanyId: КОНТРАГЕНТ,
                }),
            }),
        );
    });

    it('при заведении чужую организацию тоже не пропускают', async () => {
        const { service, prisma } = служба();
        await expect(service.createContract(Я, 'COMPANY_ADMIN', {
            myRole: 'FORWARDER',
            partnerCompanyId: КОНТРАГЕНТ,
            contractNumber: 'Д-3',
            myCompanyId: ЧУЖАЯ,
        }, ПОЛЬЗОВАТЕЛЬ)).rejects.toThrow('Это не ваша организация');
        expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('без выбора организация остаётся текущей — как было до холдингов', async () => {
        const { service, prisma } = служба();
        await service.createContract(Я, 'COMPANY_ADMIN', {
            myRole: 'FORWARDER',
            partnerCompanyId: КОНТРАГЕНТ,
            contractNumber: 'Д-4',
        });

        expect(prisma.contract.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ forwarderCompanyId: Я }),
            }),
        );
    });
});
