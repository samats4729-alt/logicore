import { AssistantService } from './assistant.service';

/**
 * Что гид на самом деле отправляет модели.
 *
 * Знание о платформе и роль собеседника можно написать сколь угодно
 * подробно — толку не будет, если они не доедут до запроса. Здесь запрос
 * перехватывается и проверяется его содержимое: тексты в файле и текст в
 * запросе — разные вещи, и расходились они уже не раз.
 */
describe('Запрос ИИ-гида', () => {
    const service = (): { service: AssistantService; sent: () => any; prisma: any } => {
        let body: any = null;
        (global as any).fetch = jest.fn(async (_url: string, init: any) => {
            body = JSON.parse(init.body);
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: 'ответ' } }] }),
            } as any;
        });

        const prisma: any = {
            platformUpdate: { findMany: jest.fn().mockResolvedValue([]) },
            company: { findUnique: jest.fn().mockResolvedValue({ name: 'ТОО «Пример»' }) },
            order: {
                count: jest.fn().mockResolvedValue(3),
                findMany: jest.fn().mockResolvedValue([{ orderNumber: 'LC-1', status: 'IN_TRANSIT' }]),
            },
            accountingDocument: { count: jest.fn().mockResolvedValue(7) },
        };

        const instance = new AssistantService(
            { get: () => 'test-key' } as any,
            prisma as any,
            { isEnabled: () => false } as any,
        );
        return { service: instance, sent: () => body, prisma };
    };

    const ask = async (user?: any, context?: string, companyId?: string) => {
        const { service: instance, sent } = service();
        await instance.chat([{ role: 'user', content: 'Как выставить счёт?' }], context, user, companyId);
        return sent().messages[0].content as string;
    };

    it('знание о платформе уезжает в запрос', async () => {
        const system = await ask({ role: 'COMPANY_ADMIN' });

        expect(system).toContain('Что такое LogiCore');
        expect(system).toContain('Действия, у которых есть цена ошибки');
    });

    it('роль собеседника уезжает в запрос', async () => {
        const system = await ask({ role: 'ACCOUNTANT', permissions: ['accounting'] });

        expect(system).toContain('Кто спрашивает');
        expect(system).toContain('бухгалтер');
        expect(system).toContain('Бухгалтерия');
    });

    it('водителя гид не поведёт по кабинету', async () => {
        expect(await ask({ role: 'DRIVER' })).toContain('Не веди его по разделам кабинета');
    });

    it('без роли гид предупреждён не обещать доступ', async () => {
        expect(await ask(undefined)).toContain('не обещай доступ');
    });

    it('текущая страница по-прежнему передаётся', async () => {
        // Гид считает шаги от того места, где человек стоит: без страницы
        // он добавляет лишние клики к тому, что уже открыто.
        expect(await ask({ role: 'COMPANY_ADMIN' }, '/company/orders'))
            .toContain('/company/orders');
    });

    it('карта маршрутов никуда не делась', async () => {
        const system = await ask({ role: 'COMPANY_ADMIN' });

        expect(system).toContain('/company/accounting/invoices');
        expect(system).toContain("data-guide='orders-create'");
    });

    it('без ключа модель не дёргается вовсе', async () => {
        const instance = new AssistantService(
            { get: () => undefined } as any,
            {} as any,
            { isEnabled: () => false } as any,
        );
        (global as any).fetch = jest.fn();

        const { reply } = await instance.chat([{ role: 'user', content: 'привет' }], undefined, { role: 'ADMIN' });

        expect(reply).toContain('не настроен');
        expect((global as any).fetch).not.toHaveBeenCalled();
    });

    describe('что гид видит про компанию', () => {
        it('состояние рейсов уезжает в запрос', async () => {
            // Раньше гид не видел ничего и на «сколько у меня рейсов в работе»
            // отвечал «посмотрите на дашборде».
            const system = await ask({ role: 'COMPANY_ADMIN' }, '/company', 'c-1');

            expect(system).toContain('Данные компании собеседника');
            expect(system).toContain('ТОО «Пример»');
            expect(system).toContain('Рейсов в работе: 3');
            expect(system).toContain('LC-1');
        });

        it('деньги видит тот, кому открыта бухгалтерия', async () => {
            const system = await ask({ role: 'ACCOUNTANT', permissions: ['accounting'] }, '/company', 'c-1');

            expect(system).toContain('Неоплаченных счетов');
        });

        it('владельцу деньги открыты без отдельного права', async () => {
            const system = await ask({ role: 'COMPANY_ADMIN' }, '/company', 'c-1');

            expect(system).toContain('Неоплаченных счетов');
        });

        it('без права «Бухгалтерия» денег в запросе нет вовсе', async () => {
            // Не «гиду велено молчать», а именно нет: то, чего не отправили,
            // невозможно выманить формулировкой вопроса.
            const system = await ask({ role: 'WAREHOUSE_MANAGER', permissions: ['orders'] }, '/company', 'c-1');

            expect(system).not.toContain('Неоплаченных счетов');
            expect(system).toContain('Деньги этому человеку закрыты');
        });

        it('счета считаются по своей компании, а не по всем подряд', async () => {
            const { service: instance, prisma } = service();

            await instance.chat([{ role: 'user', content: 'сколько долгов' }], '/company',
                { role: 'COMPANY_ADMIN' }, 'c-1');

            for (const call of prisma.accountingDocument.count.mock.calls) {
                expect(call[0].where.companyId).toBe('c-1');
            }
        });

        it('без компании данные не собираются', async () => {
            // Помощник открыт и тому, кто ещё не подключил организацию.
            const { service: instance, prisma } = service();

            await instance.chat([{ role: 'user', content: 'привет' }], undefined, { role: 'COMPANY_ADMIN' });

            expect(prisma.order.count).not.toHaveBeenCalled();
        });

        it('упавшая база не мешает ответить про интерфейс', async () => {
            // «Как создать заявку» данных не требует, и молчать из-за сводки
            // было бы хуже, чем ответить без цифр.
            const { service: instance, sent, prisma } = service();
            prisma.order.count.mockRejectedValue(new Error('база недоступна'));

            const { reply } = await instance.chat([{ role: 'user', content: 'как создать заявку' }],
                '/company', { role: 'COMPANY_ADMIN' }, 'c-1');

            expect(reply).toBe('ответ');
            // Сводки в запросе нет — сверяемся по строке из неё самой, а не по
            // заголовку блока: заголовок упомянут ещё и в правилах поведения.
            expect(sent().messages[0].content).not.toContain('Рейсов в работе');
        });
    });

    it('пустой разговор не тратит запрос к модели', async () => {
        const { service: instance } = service();

        const { reply } = await instance.chat([], undefined, { role: 'ADMIN' });

        expect(reply).toContain('Задайте вопрос');
        expect((global as any).fetch).not.toHaveBeenCalled();
    });
});
