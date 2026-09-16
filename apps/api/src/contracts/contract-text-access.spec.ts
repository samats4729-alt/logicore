import { ContractsService } from './contracts.service';

/**
 * Кто правит текст договора.
 *
 * Правку пускали только со стороны экспедитора. Договор, заведённый «я —
 * заказчик», оказывался нередактируемым у того, кто его и создал: редактор
 * открывался, статьи правились, а на «Сохранить» приходило «Только экспедитор
 * может редактировать текст договора». Обойти это было нечем — сторону
 * договора после создания не меняют.
 *
 * Кто в сделке экспедитор, а кто заказчик, решают сами стороны, и текст до
 * подписания готовит тот, кому он нужен. Поэтому правило здесь одно на чтение
 * и на правку: сторона договора — можно, посторонний — нет.
 */

const МЫ = 'org-наша';
const ВТОРАЯ_СТОРОНА = 'org-контрагент';
const ПОСТОРОННИЙ = 'org-чужая';

function служба(договор: Record<string, any>) {
    const prisma: any = {
        contract: {
            findUnique: jest.fn(async () => договор),
            update: jest.fn(async ({ data }: any) => ({ id: договор.id, contractNumber: 'Д-1', ...data })),
        },
    };
    return { service: new ContractsService(prisma), prisma };
}

/** Мы — экспедитор в этом договоре. */
const КАК_ЭКСПЕДИТОР = { id: 'c1', forwarderCompanyId: МЫ, customerCompanyId: ВТОРАЯ_СТОРОНА };
/** Мы — заказчик: именно этот случай и не сохранялся. */
const КАК_ЗАКАЗЧИК = { id: 'c1', forwarderCompanyId: ВТОРАЯ_СТОРОНА, customerCompanyId: МЫ };

describe('Текст договора: кто правит', () => {
    describe('сохранение правок', () => {
        it('экспедитор правит — как и раньше', async () => {
            const { service, prisma } = служба(КАК_ЭКСПЕДИТОР);
            await service.updateContractContent('c1', МЫ, { articles: [] });
            expect(prisma.contract.update).toHaveBeenCalled();
        });

        it('заказчик тоже правит — ради этого правка и делалась', async () => {
            const { service, prisma } = служба(КАК_ЗАКАЗЧИК);
            await service.updateContractContent('c1', МЫ, { articles: [] });
            expect(prisma.contract.update).toHaveBeenCalled();
        });

        it('посторонняя компания не правит', async () => {
            // Доступ расширен на вторую сторону, а не на всех: номер договора
            // приходит из браузера, и без проверки это был бы способ
            // переписать чужой договор.
            const { service, prisma } = служба(КАК_ЭКСПЕДИТОР);
            await expect(service.updateContractContent('c1', ПОСТОРОННИЙ, { articles: [] }))
                .rejects.toThrow('Нет доступа к этому договору');
            expect(prisma.contract.update).not.toHaveBeenCalled();
        });
    });

    describe('сброс к шаблону', () => {
        it('круг тот же, что у правки', async () => {
            // Разойдись они — сторона получила бы наполовину рабочий
            // редактор: править можно, начать заново нельзя.
            for (const договор of [КАК_ЭКСПЕДИТОР, КАК_ЗАКАЗЧИК]) {
                const { service, prisma } = служба(договор);
                await service.resetContractContent('c1', МЫ);
                expect(prisma.contract.update).toHaveBeenCalled();
            }
        });

        it('посторонняя компания не сбрасывает', async () => {
            const { service, prisma } = служба(КАК_ЭКСПЕДИТОР);
            await expect(service.resetContractContent('c1', ПОСТОРОННИЙ))
                .rejects.toThrow('Нет доступа к этому договору');
            expect(prisma.contract.update).not.toHaveBeenCalled();
        });
    });

    describe('чтение осталось прежним', () => {
        it('обе стороны читают текст', async () => {
            for (const договор of [КАК_ЭКСПЕДИТОР, КАК_ЗАКАЗЧИК]) {
                const { service } = служба({ ...договор, content: { articles: ['своё'] } });
                await expect(service.getContractContent('c1', МЫ))
                    .resolves.toEqual({ articles: ['своё'] });
            }
        });

        it('посторонняя компания не читает', async () => {
            const { service } = служба({ ...КАК_ЭКСПЕДИТОР, content: null });
            await expect(service.getContractContent('c1', ПОСТОРОННИЙ))
                .rejects.toThrow('Нет доступа к этому договору');
        });
    });
});
