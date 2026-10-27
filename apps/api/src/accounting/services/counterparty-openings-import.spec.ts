import { FinancialSettingsService } from './financial-settings.service';

/** Память вместо базы — ровно то, что читает и пишет запись начальных остатков. */
function fakeDb() {
    const companies = ['co-1', 'cp-a', 'cp-b'];
    const openings: any[] = [{ companyId: 'co-1', counterpartyId: 'cp-b', openingReceivable: 0, openingPayable: 40000, openingDate: null, note: null }];
    const prisma: any = {
        company: { count: async ({ where }: any) => where.id.in.filter((id: string) => companies.includes(id)).length },
        counterpartyOpeningBalance: {
            findMany: async ({ where }: any) => openings.filter((o) => o.companyId === where.companyId && where.counterpartyId.in.includes(o.counterpartyId)),
            upsert: ({ where, create, update }: any) => {
                const key = where.companyId_counterpartyId;
                const row = openings.find((o) => o.companyId === key.companyId && o.counterpartyId === key.counterpartyId);
                if (row) Object.assign(row, update); else openings.push({ ...create });
                return Promise.resolve();
            },
        },
        $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    return { prisma, openings };
}

describe('Начальные остатки из ведомости 1С — разом', () => {
    it('записывает сверенные строки; сторону, которой в ведомости нет, не затирает', async () => {
        const db = fakeDb();
        const service = new FinancialSettingsService(db.prisma);
        const r = await service.importCounterpartyOpenings('co-1', {
            openingDate: '2026-09-30',
            note: 'Из 1С: ведомость по счёту 1210',
            rows: [{ counterpartyId: 'cp-a', receivable: 80000, payable: 0 }, { counterpartyId: 'cp-b', receivable: 12500, payable: 0 }],
        });
        expect(r).toEqual({ saved: 2 });
        expect(db.openings.find((o) => o.counterpartyId === 'cp-a')).toMatchObject({ openingReceivable: 80000, openingPayable: 0 });
        // Кредит cp-b (40 000, из ведомости по поставщикам) остался, добавился дебет.
        expect(db.openings.find((o) => o.counterpartyId === 'cp-b')).toMatchObject({ openingReceivable: 12500, openingPayable: 40000, note: 'Из 1С: ведомость по счёту 1210' });
    });

    it('чужой или несуществующий контрагент, отрицательная сумма, пусто — отказ, ничего не записано', async () => {
        const db = fakeDb();
        const service = new FinancialSettingsService(db.prisma);
        await expect(service.importCounterpartyOpenings('co-1', { rows: [] })).rejects.toThrow('Нет строк');
        await expect(service.importCounterpartyOpenings('co-1', { rows: [{ counterpartyId: 'nobody', receivable: 1 }] })).rejects.toThrow('не найдена');
        await expect(service.importCounterpartyOpenings('co-1', { rows: [{ counterpartyId: 'cp-a', receivable: -5 }] })).rejects.toThrow('не меньше нуля');
        await expect(service.importCounterpartyOpenings('co-1', { rows: [{ counterpartyId: 'co-1', receivable: 5 }] })).rejects.toThrow('своей же организации');
        expect(db.openings).toHaveLength(1);
    });
});
