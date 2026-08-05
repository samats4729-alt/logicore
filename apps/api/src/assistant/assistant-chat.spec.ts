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
    const service = (): { service: AssistantService; sent: () => any } => {
        let body: any = null;
        (global as any).fetch = jest.fn(async (_url: string, init: any) => {
            body = JSON.parse(init.body);
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: 'ответ' } }] }),
            } as any;
        });

        const instance = new AssistantService(
            { get: () => 'test-key' } as any,
            { platformUpdate: { findMany: jest.fn().mockResolvedValue([]) } } as any,
            { isEnabled: () => false } as any,
        );
        return { service: instance, sent: () => body };
    };

    const ask = async (user?: any, context?: string) => {
        const { service: instance, sent } = service();
        await instance.chat([{ role: 'user', content: 'Как выставить счёт?' }], context, user);
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

    it('пустой разговор не тратит запрос к модели', async () => {
        const { service: instance } = service();

        const { reply } = await instance.chat([], undefined, { role: 'ADMIN' });

        expect(reply).toContain('Задайте вопрос');
        expect((global as any).fetch).not.toHaveBeenCalled();
    });
});
