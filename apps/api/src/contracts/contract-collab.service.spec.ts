import { ContractCollabService } from './contract-collab.service';

/**
 * Совместная работа над текстом договора (G6, владелец 25.10.2026):
 * история версий, предложения правок, принять — отклонить — отозвать,
 * автор и время каждой правки, доступ только сторон договора.
 */
const МЫ = 'org-наша';
const ВТОРАЯ = 'org-контрагент';
const ЧУЖАЯ = 'org-чужая';
const ТЕКСТ = [{ title: '1. Предмет', paragraphs: [{ number: '1.1', text: 'Перевозка грузов' }] }];
const НОВЫЙ = [{ title: '1. Предмет', paragraphs: [{ number: '1.1', text: 'Перевозка грузов по Казахстану' }] }];

function build(contract: Record<string, any>, proposals: any[] = []) {
    const state = {
        contract: {
            id: 'c1', contractNumber: 'Д-1', status: 'ACTIVE', content: ТЕКСТ as unknown, contentVersion: 0,
            forwarderCompanyId: МЫ, customerCompanyId: ВТОРАЯ,
            forwarderCompany: { id: МЫ, name: 'ТОО Наша', isExternal: false },
            customerCompany: { id: ВТОРАЯ, name: 'ТОО Контрагент', isExternal: false },
            ...contract,
        },
    };
    const revisions: any[] = [];
    const tx: any = {
        contract: {
            updateMany: jest.fn(async ({ where, data }: any) => {
                if (where.contentVersion !== state.contract.contentVersion) return { count: 0 };
                Object.assign(state.contract, data);
                return { count: 1 };
            }),
        },
        contractRevision: { create: jest.fn(async ({ data }: any) => { revisions.push(data); return data; }) },
        contractProposal: {
            update: jest.fn(async ({ where, data }: any) => Object.assign(proposals.find((p) => p.id === where.id), data)),
            updateMany: jest.fn(async () => ({ count: 0 })),
        },
    };
    const prisma: any = {
        contract: { ...tx.contract, findUnique: jest.fn(async () => state.contract) },
        contractProposal: {
            ...tx.contractProposal,
            create: jest.fn(async ({ data }: any) => {
                const p = { id: `p${proposals.length + 1}`, status: 'PENDING', createdAt: new Date(), ...data };
                proposals.push(p);
                return p;
            }),
            findFirst: jest.fn(async ({ where }: any) => proposals.find((p) => p.id === where.id) ?? null),
            findMany: jest.fn(async () => proposals),
        },
        contractRevision: { ...tx.contractRevision, findMany: jest.fn(async () => revisions), findUnique: jest.fn(async () => null) },
        user: { findUnique: jest.fn(async () => ({ firstName: 'Алия', lastName: 'Менеджер' })) },
        company: { findUnique: jest.fn(async ({ where }: any) => ({ name: where.id === МЫ ? 'ТОО Наша' : 'ТОО Контрагент' })) },
        $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    return { service: new ContractCollabService(prisma), state, revisions, proposals };
}

describe('Текст договора: кто правит напрямую', () => {
    it('с контрагентом из справочника — любая сторона, как раньше; правка становится версией с автором', async () => {
        const { service, state, revisions } = build({ customerCompany: { id: ВТОРАЯ, name: 'ТОО Контрагент', isExternal: true } });
        const r = await service.saveDirect('c1', { companyId: МЫ, userId: 'u1' }, НОВЫЙ);
        expect(r.version).toBe(2);
        expect(state.contract.content).toEqual(НОВЫЙ);
        // Первая запись истории хранит и прежний текст — иначе первую правку не с чем сравнить.
        expect(revisions.map((x) => [x.version, x.source])).toEqual([[1, 'INITIAL'], [2, 'SAVE']]);
        expect(revisions[1].authorName).toBe('Менеджер Алия · ТОО Наша');
    });

    it('вторая сторона в LogiCore и договор не черновик — только предложением', async () => {
        const { service, state } = build({});
        await expect(service.saveDirect('c1', { companyId: МЫ }, НОВЫЙ)).rejects.toThrow(/только предложением правок/);
        expect(state.contract.content).toEqual(ТЕКСТ);
    });

    it('черновик правят обе стороны напрямую — ради этого правку сторон и открывали', async () => {
        for (const side of [МЫ, ВТОРАЯ]) {
            const { service } = build({ status: 'DRAFT' });
            await expect(service.saveDirect('c1', { companyId: side }, НОВЫЙ)).resolves.toMatchObject({ version: 2 });
        }
    });

    it('сброс к шаблону — тот же круг и тоже версия', async () => {
        const { service, revisions } = build({ status: 'DRAFT' });
        await service.saveDirect('c1', { companyId: МЫ }, [{ title: 'Шаблон', paragraphs: [] }], 'RESET');
        expect(revisions[1]).toMatchObject({ source: 'RESET', note: 'Текст сброшен к шаблону' });
    });

    it('посторонняя компания не правит и не видит', async () => {
        // Номер договора приходит из браузера: без проверки это был бы способ
        // переписать чужой договор.
        const { service, state } = build({ status: 'DRAFT' });
        await expect(service.saveDirect('c1', { companyId: ЧУЖАЯ }, НОВЫЙ)).rejects.toThrow('Нет доступа к этому договору');
        await expect(service.state('c1', ЧУЖАЯ)).rejects.toThrow('Нет доступа к этому договору');
        expect(state.contract.content).toEqual(ТЕКСТ);
    });
});

describe('Предложения правок', () => {
    it('предложили — вторая сторона приняла: новая версия, автор — предложивший, отметка о принятии', async () => {
        const { service, state, revisions, proposals } = build({});
        const p = await service.propose('c1', { companyId: МЫ, userId: 'u1' }, НОВЫЙ, 'Уточнили географию');
        expect(p).toMatchObject({ status: 'PENDING', baseVersion: 0 });
        await expect(service.accept('c1', { companyId: МЫ }, p.id)).rejects.toThrow('Свои правки принимает вторая сторона');
        await service.accept('c1', { companyId: ВТОРАЯ, userId: 'u2' }, p.id);
        expect(state.contract.content).toEqual(НОВЫЙ);
        expect(proposals[0].status).toBe('ACCEPTED');
        expect(revisions[1]).toMatchObject({ source: 'PROPOSAL', authorCompanyId: МЫ, proposalId: p.id });
        expect(revisions[1].note).toMatch(/Уточнили географию · Принято: Менеджер Алия · ТОО Контрагент/);
    });

    it('текст изменился после предложения — принять нельзя, предложение устарело', async () => {
        const { service, state, proposals } = build({});
        const p = await service.propose('c1', { companyId: МЫ }, НОВЫЙ);
        state.contract.contentVersion = 3;
        await expect(service.accept('c1', { companyId: ВТОРАЯ }, p.id)).rejects.toThrow(/изменился после этого предложения/);
        expect(proposals[0].status).toBe('OUTDATED');
    });

    it('отклонить можно только с причиной; отозвать — только предложивший', async () => {
        const { service, proposals } = build({});
        const p = await service.propose('c1', { companyId: МЫ }, НОВЫЙ);
        await expect(service.reject('c1', { companyId: ВТОРАЯ }, p.id, '  ')).rejects.toThrow(/почему отклоняете/);
        await expect(service.withdraw('c1', { companyId: ВТОРАЯ }, p.id)).rejects.toThrow(/только та сторона, что предложила/);
        await service.reject('c1', { companyId: ВТОРАЯ }, p.id, 'Оставьте прежнюю редакцию');
        expect(proposals[0]).toMatchObject({ status: 'REJECTED', decisionNote: 'Оставьте прежнюю редакцию' });
        await expect(service.withdraw('c1', { companyId: МЫ }, p.id)).rejects.toThrow('уже есть решение');
    });

    it('без изменений и с контрагентом без кабинета — предлагать нечего и некому', async () => {
        const { service } = build({});
        await expect(service.propose('c1', { companyId: МЫ }, ТЕКСТ)).rejects.toThrow('Текст не изменился');
        const ext = build({ customerCompany: { id: ВТОРАЯ, name: 'ТОО Контрагент', isExternal: true } });
        await expect(ext.service.propose('c1', { companyId: МЫ }, НОВЫЙ)).rejects.toThrow(/не работает в LogiCore/);
    });
});
