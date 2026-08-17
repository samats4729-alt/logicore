import { AssistantService } from './assistant.service';

/**
 * Обращения в поддержку со стороны компании.
 *
 * Раньше письмо было дорогой в один конец: оно уходило владельцу в
 * телеграм, а человек на другом конце видел «принято» и всё. Здесь
 * проверяется то, что делает переписку перепиской: компания видит свои
 * письма и ответы на них — и только свои.
 */
describe('Обращения в поддержку', () => {
    const build = (over: any = {}) => {
        const prisma: any = {
            supportTicket: {
                findMany: jest.fn().mockResolvedValue([]),
                findUnique: jest.fn().mockResolvedValue({ id: 'т1', status: 'NEW' }),
                update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'т1', ...data })),
            },
            ...over.prisma,
        };
        const service = new AssistantService(
            { get: () => 'test-key' } as any,
            prisma as any,
            { isEnabled: () => false } as any,
        );
        return { service, prisma };
    };

    describe('свои письма', () => {
        it('отбираются строго по своей компании', async () => {
            // Список открыт каждому вошедшему — чужие письма в него попасть
            // не должны ни при каком фильтре.
            const { service, prisma } = build();

            await service.listCompanyTickets('наша-компания');

            expect(prisma.supportTicket.findMany.mock.calls[0][0].where)
                .toEqual({ companyId: 'наша-компания' });
        });

        it('без компании список пуст, а не общий', async () => {
            // У человека может не быть организации — например, пока её
            // проверяют. Пустой отбор означал бы «все обращения платформы».
            const { service, prisma } = build();

            await expect(service.listCompanyTickets('')).resolves.toEqual([]);
            expect(prisma.supportTicket.findMany).not.toHaveBeenCalled();
        });

        it('переписка с помощником в список не идёт', async () => {
            // Она бывает на несколько экранов и на странице не нужна.
            const { service, prisma } = build();

            await service.listCompanyTickets('наша-компания');

            expect(prisma.supportTicket.findMany.mock.calls[0][0].select.transcript).toBeUndefined();
            expect(prisma.supportTicket.findMany.mock.calls[0][0].select.answer).toBe(true);
        });
    });

    describe('ответ поддержки', () => {
        it('записывается вместе с датой и автором', async () => {
            const { service, prisma } = build();

            await service.updateTicket('т1', { answer: 'Поправили, обновите страницу' }, 'я');

            const data = prisma.supportTicket.update.mock.calls[0][0].data;
            expect(data.answer).toBe('Поправили, обновите страницу');
            expect(data.answeredAt).toBeInstanceOf(Date);
            expect(data.answeredById).toBe('я');
        });

        it('ответили — обращение считается решённым', async () => {
            // Отвеченное письмо в «новых» показывает компании, что им никто
            // не занимался.
            const { service, prisma } = build();

            await service.updateTicket('т1', { answer: 'Готово' });

            expect(prisma.supportTicket.update.mock.calls[0][0].data.status).toBe('DONE');
        });

        it('названный статус важнее подразумеваемого', async () => {
            const { service, prisma } = build();

            await service.updateTicket('т1', { answer: 'Уточните номер рейса', status: 'IN_PROGRESS' });

            expect(prisma.supportTicket.update.mock.calls[0][0].data.status).toBe('IN_PROGRESS');
        });

        it('пустой ответ не записывается и статус не трогает', async () => {
            // Иначе случайное нажатие «Ответить» закрывало бы обращение
            // пустотой.
            const { service, prisma } = build();

            await service.updateTicket('т1', { answer: '   ' });

            const data = prisma.supportTicket.update.mock.calls[0][0].data;
            expect(data.answer).toBeUndefined();
            expect(data.status).toBeUndefined();
        });

        it('обращения нет — говорим об этом, а не молчим', async () => {
            const { service } = build({
                prisma: { supportTicket: { findUnique: jest.fn().mockResolvedValue(null) } },
            });

            await expect(service.updateTicket('нет-такого', { status: 'DONE' })).rejects.toThrow('не найден');
        });
    });
});
