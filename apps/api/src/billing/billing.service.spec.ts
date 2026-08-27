import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { BillingService } from './billing.service';
import { addMonths } from '../common/utils/business-date';

/**
 * Подписки компаний.
 *
 * Здесь решается один вопрос: пускать компанию в платформу или нет. Ошибка
 * в любую сторону дорогая — либо работающая компания в понедельник утром
 * упирается в «оплатите тариф», либо неоплаченная работает бесплатно.
 * До сих пор на этот модуль не было ни одного теста.
 */
describe('Подписки компаний', () => {
    const COMPANY = 'c-1';

    const DAY = 24 * 60 * 60 * 1000;
    const future = (days: number) => new Date(Date.now() + days * DAY);
    const past = (days: number) => new Date(Date.now() - days * DAY);

    /**
     * Настройки лежат в двух строках `PlatformSetting`. Сборка отдаёт их
     * как реальная база — парой записей, а не готовым объектом: иначе
     * разбор значений («true», «14») остался бы непроверенным.
     */
    const build = (options: {
        enabled?: boolean;
        trialDays?: string;
        graceDays?: string;
        subscription?: any;
        companies?: any[];
        plan?: any;
        mainPlan?: any;
        request?: any;
        requestId?: any;
        userCount?: number;
        orderCount?: number;
        graceUpdated?: number;
    } = {}) => {
        // Настройки живут в базе, а не в объекте сборки: сохранение обязано
        // менять то, что прочитают следующим запросом, иначе проверка
        // «выключил биллинг — разблокировало» ничего не проверяет.
        const settings = new Map<string, string>([
            ['billing_enabled', String(options.enabled ?? false)],
            ...(options.trialDays === undefined
                ? []
                : [['billing_trial_days', options.trialDays] as [string, string]]),
            ...(options.graceDays === undefined
                ? []
                : [['billing_grace_days', options.graceDays] as [string, string]]),
        ]);
        const prisma: any = {
            platformSetting: {
                findMany: jest.fn(async () => [...settings].map(([key, value]) => ({ key, value }))),
                upsert: jest.fn(async (args: any) => {
                    settings.set(args.where.key, args.create.value);
                    return {};
                }),
            },
            companySubscription: {
                findUnique: jest.fn().mockResolvedValue(options.subscription ?? null),
                create: jest.fn(async ({ data }: any) => ({ id: 'sub-new', ...data })),
                createMany: jest.fn().mockResolvedValue({ count: 0 }),
                updateMany: jest.fn().mockResolvedValue({ count: options.graceUpdated ?? 0 }),
                update: jest.fn().mockResolvedValue({}),
                upsert: jest.fn(async (args: any) => ({ companyId: COMPANY, ...args.update })),
                count: jest.fn().mockResolvedValue(0),
            },
            company: {
                findMany: jest.fn().mockResolvedValue(options.companies ?? []),
                findUnique: jest.fn().mockResolvedValue({ id: COMPANY, name: 'ТОО «Пример»', bin: '123456789012' }),
            },
            subscriptionPlan: {
                findUnique: jest.fn().mockResolvedValue(options.plan ?? null),
                findFirst: jest.fn().mockResolvedValue(options.mainPlan ?? null),
                create: jest.fn(async ({ data }: any) => ({ id: 'plan-new', ...data })),
                update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
                delete: jest.fn().mockResolvedValue({}),
                findMany: jest.fn().mockResolvedValue([]),
            },
            subscriptionRequest: {
                findFirst: jest.fn().mockResolvedValue(options.request ?? null),
                findUnique: jest.fn().mockResolvedValue(options.requestId ?? null),
                findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn(async ({ data }: any) => ({ id: 'req-1', ...data })),
                update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
            },
            user: {
                count: jest.fn().mockResolvedValue(options.userCount ?? 0),
                findUnique: jest.fn().mockResolvedValue(null),
            },
            order: { count: jest.fn().mockResolvedValue(options.orderCount ?? 0) },
        };
        const telegram: any = { send: jest.fn().mockResolvedValue(true) };
        return { service: new BillingService(prisma, telegram), prisma, telegram };
    };

    describe('пока биллинг выключен', () => {
        it('пускают всех', async () => {
            // Платформа живёт без биллинга: включение — отдельное решение
            // владельца, а не состояние по умолчанию.
            const { service, prisma } = build({ enabled: false });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(true);
            expect(prisma.companySubscription.findUnique).not.toHaveBeenCalled();
        });

        it('лимиты тарифа не действуют', async () => {
            const { service, prisma } = build({ enabled: false, userCount: 1000 });

            await service.assertUserLimit(COMPANY);
            await service.assertOrderLimit(COMPANY);
            expect(prisma.user.count).not.toHaveBeenCalled();
            expect(prisma.order.count).not.toHaveBeenCalled();
        });

        it('кабинету компании нечего показывать', async () => {
            const { service } = build({ enabled: false });

            expect(await service.getCompanyStatus(COMPANY)).toEqual({ enabled: false, blocked: false });
        });
    });

    describe('доступ при включённом биллинге', () => {
        it('компания без подписки получает пробный период, а не отказ', async () => {
            // Иначе первая же компания, зарегистрировавшаяся после включения
            // биллинга, упиралась бы в «оплатите тариф» на пустом кабинете.
            const { service, prisma } = build({ enabled: true, subscription: null });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(true);
            expect(prisma.companySubscription.create.mock.calls[0][0].data.status)
                .toBe(SubscriptionStatus.TRIAL);
        });

        it('пробный период по умолчанию — 14 дней', async () => {
            const { service, prisma } = build({ enabled: true, subscription: null });
            await service.isCompanyAllowed(COMPANY);

            const { trialEndsAt } = prisma.companySubscription.create.mock.calls[0][0].data;
            expect(Math.round((trialEndsAt.getTime() - Date.now()) / DAY)).toBe(14);
        });

        it('срок пробного периода берётся из настроек', async () => {
            const { service, prisma } = build({ enabled: true, trialDays: '30', subscription: null });
            await service.isCompanyAllowed(COMPANY);

            const { trialEndsAt } = prisma.companySubscription.create.mock.calls[0][0].data;
            expect(Math.round((trialEndsAt.getTime() - Date.now()) / DAY)).toBe(30);
        });

        it('действующий пробный период пускает', async () => {
            const { service } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.TRIAL, trialEndsAt: future(3) },
            });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(true);
        });

        it('истёкший пробный период закрывает доступ и помечает подписку', async () => {
            const { service, prisma } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.TRIAL, trialEndsAt: past(1) },
            });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(false);
            expect(prisma.companySubscription.update.mock.calls[0][0].data.status)
                .toBe(SubscriptionStatus.PAST_DUE);
        });

        it('оплаченный период пускает', async () => {
            const { service } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.ACTIVE, periodEnd: future(20) },
            });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(true);
        });

        it('подписка без конца периода — бессрочная', async () => {
            // Так заводят своих: партнёр, пилот, собственная компания
            // владельца. Их нельзя выключить по календарю.
            const { service } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.ACTIVE, periodEnd: null },
            });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(true);
        });

        it('закончившийся оплаченный период закрывает доступ', async () => {
            const { service, prisma } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.ACTIVE, periodEnd: past(1) },
            });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(false);
            expect(prisma.companySubscription.update.mock.calls[0][0].data.status)
                .toBe(SubscriptionStatus.PAST_DUE);
        });

        it('отменённая подписка не пускает', async () => {
            const { service } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.CANCELLED, periodEnd: future(20) },
            });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(false);
        });
    });

    describe('кэш решения о доступе', () => {
        it('повторная проверка не ходит в базу', async () => {
            // Проверка висит на каждом запросе платформы: без кэша это
            // лишнее обращение к базе на любое действие пользователя.
            const { service, prisma } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.ACTIVE, periodEnd: future(20) },
            });

            await service.isCompanyAllowed(COMPANY);
            await service.isCompanyAllowed(COMPANY);

            expect(prisma.companySubscription.findUnique).toHaveBeenCalledTimes(1);
        });

        it('после правки подписки кэш сбрасывается', async () => {
            // Владелец продлил подписку вручную после оплаты по счёту —
            // компания обязана заработать сразу, а не через минуту.
            const { service, prisma } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.TRIAL, trialEndsAt: past(1) },
            });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(false);

            prisma.companySubscription.findUnique.mockResolvedValue({
                id: 's-1', status: SubscriptionStatus.ACTIVE, periodEnd: future(30),
            });
            await service.updateCompanySubscription(COMPANY, { months: 1 });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(true);
        });
    });

    describe('день, когда назначили цену', () => {
        it('все действующие компании получают дни на оплату', async () => {
            // Иначе в момент включения оплаты вся платформа встаёт разом —
            // вместе с рейсами, которые уже в пути.
            const { service, prisma } = build({
                enabled: false,
                companies: [{ id: 'c-1' }, { id: 'c-2' }],
            });

            const result = await service.updateSettings({ enabled: true });

            expect(result.graceGranted).toBe(2);
            expect(prisma.companySubscription.createMany.mock.calls[0][0].data).toHaveLength(2);
            expect(prisma.companySubscription.createMany.mock.calls[0][0].data[0].status)
                .toBe(SubscriptionStatus.GRACE);
        });

        it('срок на оплату по умолчанию — три дня', async () => {
            const { service, prisma } = build({ enabled: false, companies: [{ id: 'c-1' }] });
            await service.updateSettings({ enabled: true });

            const { trialEndsAt } = prisma.companySubscription.createMany.mock.calls[0][0].data[0];
            expect(Math.round((trialEndsAt.getTime() - Date.now()) / DAY)).toBe(3);
        });

        it('число дней задаёт владелец', async () => {
            const { service, prisma } = build({ enabled: false, companies: [{ id: 'c-1' }] });
            await service.updateSettings({ enabled: true, graceDays: 10 });

            const { trialEndsAt } = prisma.companySubscription.createMany.mock.calls[0][0].data[0];
            expect(Math.round((trialEndsAt.getTime() - Date.now()) / DAY)).toBe(10);
        });

        it('те, у кого подписка уже кончилась, тоже получают срок', async () => {
            // До этого дня они работали: платформа была бесплатной. Отключить
            // их в ту же секунду, когда назначили цену, было бы нечестно.
            const { service, prisma } = build({ enabled: false, graceUpdated: 4 });

            const result = await service.updateSettings({ enabled: true });

            expect(result.graceGranted).toBe(4);
            const { where, data } = prisma.companySubscription.updateMany.mock.calls[0][0];
            expect(data.status).toBe(SubscriptionStatus.GRACE);
            expect(where.OR).toEqual(expect.arrayContaining([
                { status: { in: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELLED] } },
            ]));
        });

        it('оплаченное вперёд не отбирается', async () => {
            // Правило перехода одно: только добавляем. Бессрочная подписка —
            // periodEnd пустой — под условие не подходит и остаётся как была.
            const { service, prisma } = build({ enabled: false });
            await service.updateSettings({ enabled: true });

            const { where } = prisma.companySubscription.updateMany.mock.calls[0][0];
            const active = where.OR.find((c: any) => c.status === SubscriptionStatus.ACTIVE);
            expect(active.periodEnd.lt.getTime()).toBeCloseTo(Date.now() + 3 * DAY, -4);
        });

        it('срок выдаётся только настоящим арендаторам', async () => {
            const { service, prisma } = build({ enabled: false, companies: [{ id: 'c-1' }] });
            await service.updateSettings({ enabled: true });

            const where = prisma.company.findMany.mock.calls[0][0].where;
            expect(where.isExternal).toBe(false);
            expect(where.isActive).toBe(true);
            expect(where.subscription).toBeNull();
        });

        it('повторное сохранение настроек сроков не раздаёт', async () => {
            // Иначе правка цены продлевала бы жизнь всем, кого уже отключили
            // за неоплату.
            const { service, prisma } = build({ enabled: true, companies: [{ id: 'c-1' }] });

            const result = await service.updateSettings({ trialDays: 20 });

            expect(result.graceGranted).toBe(0);
            expect(prisma.companySubscription.createMany).not.toHaveBeenCalled();
            expect(prisma.companySubscription.updateMany).not.toHaveBeenCalled();
        });

        it('выключение оплаты разблокирует сразу', async () => {
            const { service } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.GRACE, trialEndsAt: past(1) },
            });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(false);
            await service.updateSettings({ enabled: false });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(true);
        });

        it('пробный период короче суток не принимается', async () => {
            const { service } = build({ enabled: false });

            await expect(service.updateSettings({ trialDays: 0 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('пробный период длиннее года не принимается', async () => {
            const { service } = build({ enabled: false });

            await expect(service.updateSettings({ trialDays: 366 }))
                .rejects.toThrow(/от 1 до 365/);
        });

        it('нулевой срок на оплату не принимается', async () => {
            const { service } = build({ enabled: false });

            await expect(service.updateSettings({ graceDays: 0 }))
                .rejects.toThrow(/от 1 до 90/);
        });

        it('действующий срок на оплату пускает', async () => {
            const { service } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.GRACE, trialEndsAt: future(2) },
            });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(true);
        });

        it('истёкший срок на оплату закрывает доступ', async () => {
            const { service, prisma } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.GRACE, trialEndsAt: past(1) },
            });

            expect(await service.isCompanyAllowed(COMPANY)).toBe(false);
            expect(prisma.companySubscription.update.mock.calls[0][0].data.status)
                .toBe(SubscriptionStatus.PAST_DUE);
        });
    });

    describe('цена тарифа', () => {
        it('пока оплата не включена, на сайте ноль', async () => {
            // Сумма в тарифе может быть заведена заранее. Показывать её,
            // пока никто не платит, — обещать цену, которой ещё нет.
            const { service } = build({ enabled: false, mainPlan: { priceMonthly: 25000, features: [] } });

            expect(await service.getTariff()).toMatchObject({ paid: false, pricePerUser: 0 });
        });

        it('после включения показывается назначенная сумма', async () => {
            const { service } = build({ enabled: true, mainPlan: { name: 'Стандарт', priceMonthly: 25000, features: [] } });

            expect(await service.getTariff()).toMatchObject({ paid: true, pricePerUser: 25000 });
        });

        it('цена правится в админке, а не в коде', async () => {
            const { service, prisma } = build({ enabled: false, mainPlan: { id: 'p-1', priceMonthly: 0 } });

            await service.updateSettings({ priceMonthly: 25000 });

            expect(prisma.subscriptionPlan.update.mock.calls[0][0].data.priceMonthly).toBe(25000);
        });

        it('первая назначенная цена заводит тариф сама', async () => {
            // Владельцу не нужно знать про «тарифные планы»: он называет
            // сумму, а всё остальное появляется само.
            const { service, prisma } = build({ enabled: false, mainPlan: null });

            await service.updateSettings({ priceMonthly: 25000 });

            expect(prisma.subscriptionPlan.create.mock.calls[0][0].data)
                .toMatchObject({ name: 'Стандарт', priceMonthly: 25000 });
        });

        it('отрицательная цена не принимается', async () => {
            const { service } = build({ enabled: false });

            await expect(service.updateSettings({ priceMonthly: -1 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('лимиты тарифа', () => {
        const withPlan = (plan: any, extra: any = {}) => build({
            enabled: true,
            subscription: { id: 's-1', status: SubscriptionStatus.ACTIVE, periodEnd: future(30), plan },
            ...extra,
        });

        it('водители в лимит сотрудников не входят', async () => {
            // Лимит продаётся как «рабочие места в офисе»: у перевозчика
            // сорок водителей и три диспетчера, и платит он за троих.
            const { service, prisma } = withPlan({ maxUsers: 5, maxOrdersPerMonth: null }, { userCount: 3 });

            await service.assertUserLimit(COMPANY);

            expect(prisma.user.count.mock.calls[0][0].where.role).toEqual({ not: 'DRIVER' });
        });

        it('на границе лимита нового сотрудника не заводят', async () => {
            const { service } = withPlan({ maxUsers: 5, maxOrdersPerMonth: null }, { userCount: 5 });

            await expect(service.assertUserLimit(COMPANY))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('в отказе названо, сколько мест в тарифе', async () => {
            const { service } = withPlan({ maxUsers: 5, maxOrdersPerMonth: null }, { userCount: 5 });

            await expect(service.assertUserLimit(COMPANY)).rejects.toThrow(/до 5 сотрудников/);
        });

        it('план без ограничения по людям не мешает', async () => {
            const { service } = withPlan({ maxUsers: null, maxOrdersPerMonth: 100 }, { userCount: 900 });

            await expect(service.assertUserLimit(COMPANY)).resolves.toBeUndefined();
        });

        it('пробный период не ограничен', async () => {
            // На триале плана ещё нет: считать его нулевым значило бы не
            // пустить человека дальше первой заявки.
            const { service } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.TRIAL, trialEndsAt: future(5), plan: null },
                userCount: 50,
                orderCount: 500,
            });

            await expect(service.assertUserLimit(COMPANY)).resolves.toBeUndefined();
            await expect(service.assertOrderLimit(COMPANY)).resolves.toBeUndefined();
        });

        it('заявки считаются с начала месяца по Казахстану', async () => {
            // По UTC ночью первого числа лимит ещё не обнулялся: пять часов
            // нового месяца заявку создать было нельзя.
            const { service, prisma } = withPlan({ maxUsers: null, maxOrdersPerMonth: 100 }, { orderCount: 10 });

            await service.assertOrderLimit(COMPANY);

            const { createdAt } = prisma.order.count.mock.calls[0][0].where;
            const kzHour = new Date(createdAt.gte.getTime() + 5 * 60 * 60 * 1000).getUTCHours();
            expect(kzHour).toBe(0);
            expect(new Date(createdAt.gte.getTime() + 5 * 60 * 60 * 1000).getUTCDate()).toBe(1);
        });

        it('исчерпанный месячный лимит заявок останавливает', async () => {
            const { service } = withPlan({ maxUsers: null, maxOrdersPerMonth: 100 }, { orderCount: 100 });

            await expect(service.assertOrderLimit(COMPANY)).rejects.toThrow(/до 100 заявок в месяц/);
        });

        it('считаются заявки компании-заказчика, а не все подряд', async () => {
            const { service, prisma } = withPlan({ maxUsers: null, maxOrdersPerMonth: 100 });
            await service.assertOrderLimit(COMPANY);

            expect(prisma.order.count.mock.calls[0][0].where.customerCompanyId).toBe(COMPANY);
        });
    });

    describe('тарифные планы', () => {
        it('план без названия не создаётся', async () => {
            const { service } = build();

            await expect(service.createPlan({ name: '   ', priceMonthly: 10000 }))
                .rejects.toThrow(/Название/);
        });

        it('отрицательная цена не принимается', async () => {
            const { service } = build();

            await expect(service.createPlan({ name: 'Базовый', priceMonthly: -1 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('бесплатный план — это нормально', async () => {
            const { service } = build();

            await expect(service.createPlan({ name: 'Бесплатный', priceMonthly: 0 }))
                .resolves.toMatchObject({ priceMonthly: 0 });
        });

        it('цена хранится целыми тенге', async () => {
            const { service } = build();
            const plan: any = await service.createPlan({ name: 'Базовый', priceMonthly: 14999.6 });

            expect(plan.priceMonthly).toBe(15000);
        });

        it('несуществующий план не правится', async () => {
            const { service } = build({ plan: null });

            await expect(service.updatePlan('p-1', { name: 'Новый' }))
                .rejects.toBeInstanceOf(NotFoundException);
        });

        it('план с подписками не удаляется, а снимается с продажи', async () => {
            // Удалить его — значит оборвать подписки тех, кто на нём сидит.
            const { service, prisma } = build();
            prisma.companySubscription.count.mockResolvedValue(3);

            await service.deletePlan('p-1');

            expect(prisma.subscriptionPlan.delete).not.toHaveBeenCalled();
            expect(prisma.subscriptionPlan.update.mock.calls[0][0].data.isActive).toBe(false);
        });

        it('неиспользованный план удаляется', async () => {
            const { service, prisma } = build();
            prisma.companySubscription.count.mockResolvedValue(0);

            await service.deletePlan('p-1');

            expect(prisma.subscriptionPlan.delete).toHaveBeenCalled();
        });
    });

    describe('продление подписки после оплаты по счёту', () => {
        it('оплата вперёд прибавляется к оплаченному периоду, а не съедает его', async () => {
            // Компания заплатила за второй месяц, не дождавшись конца
            // первого. Считать от сегодня — значит отобрать оплаченные дни.
            const end = future(20);
            const { service, prisma } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.ACTIVE, periodStart: past(10), periodEnd: end },
            });

            await service.updateCompanySubscription(COMPANY, { months: 1 });

            // Ожидаемую дату считаем тем же правилом, что и продакшен:
            // месяц прибавляется с прижатием к последнему дню. Наивный
            // `setMonth(+1)` от 31 августа даёт «31 сентября», а такого дня
            // нет — JS молча переносит на 1 октября, и проверка падала
            // ровно в те дни года, когда конец периода попадал на 31-е.
            // Проверяем здесь другое: продление считается от конца
            // оплаченного периода, а не от сегодня.
            const periodEnd: Date = prisma.companySubscription.upsert.mock.calls[0][0].update.periodEnd;
            const expected = addMonths(end, 1);
            expect(periodEnd.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
        });

        it('после перерыва период считается от сегодня', async () => {
            const { service, prisma } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.PAST_DUE, periodEnd: past(40) },
            });

            await service.updateCompanySubscription(COMPANY, { months: 1 });

            const periodEnd: Date = prisma.companySubscription.upsert.mock.calls[0][0].update.periodEnd;
            expect(periodEnd.getTime()).toBeGreaterThan(Date.now());
        });

        it('продление включает подписку', async () => {
            const { service, prisma } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.PAST_DUE, periodEnd: past(40) },
            });

            await service.updateCompanySubscription(COMPANY, { months: 3 });

            expect(prisma.companySubscription.upsert.mock.calls[0][0].update.status)
                .toBe(SubscriptionStatus.ACTIVE);
        });

        it('оплата 31 числа не даёт лишних дней', async () => {
            // Прибавление месяца к 31 января даёт 3 марта: три дня подписки
            // сверх оплаченного. На сотне компаний это уже не мелочь.
            const { service, prisma } = build({
                enabled: true,
                subscription: {
                    id: 's-1', status: SubscriptionStatus.ACTIVE,
                    periodStart: new Date('2027-01-01T00:00:00Z'),
                    periodEnd: new Date('2027-01-31T00:00:00Z'),
                },
            });
            jest.spyOn(Date, 'now').mockReturnValue(new Date('2027-01-20T00:00:00Z').getTime());

            try {
                await service.updateCompanySubscription(COMPANY, { months: 1 });
                const periodEnd: Date = prisma.companySubscription.upsert.mock.calls[0][0].update.periodEnd;
                expect(periodEnd.toISOString().slice(0, 10)).toBe('2027-02-28');
            } finally {
                (Date.now as jest.Mock).mockRestore();
            }
        });

        it('несуществующая компания не заводит подписку', async () => {
            const { service, prisma } = build();
            prisma.company.findUnique.mockResolvedValue(null);

            await expect(service.updateCompanySubscription(COMPANY, { months: 1 }))
                .rejects.toBeInstanceOf(NotFoundException);
            expect(prisma.companySubscription.upsert).not.toHaveBeenCalled();
        });

        it('несуществующий план не назначается', async () => {
            const { service } = build({ plan: null });

            await expect(service.updateCompanySubscription(COMPANY, { planId: 'p-нет' }))
                .rejects.toThrow(/План не найден/);
        });

        it('снять план можно, а подставить несуществующий — нет', async () => {
            const { service, prisma } = build({ plan: null });

            await service.updateCompanySubscription(COMPANY, { planId: null });

            expect(prisma.companySubscription.upsert.mock.calls[0][0].update.planId).toBeNull();
        });
    });

    describe('запрос на покупку подписки', () => {
        const USER = { id: 'u-1', firstName: 'Данияр', lastName: 'Заказчик' };
        const PLAN = { id: 'p-1', name: 'Стандарт', priceMonthly: 25000, features: [] };

        it('сумму считает сервер, а не браузер', async () => {
            // Иначе компания прислала бы свою цену и «оплатила» тариф рублём.
            const { service, prisma } = build({ enabled: true, mainPlan: PLAN });

            await service.createRequest(COMPANY, USER, { months: 3, comment: undefined });

            expect(prisma.subscriptionRequest.create.mock.calls[0][0].data)
                .toMatchObject({ months: 3, amount: 75000, planId: 'p-1' });
        });

        it('второй запрос не создаётся, пока не ответили на первый', async () => {
            const { service } = build({
                enabled: true, mainPlan: PLAN,
                request: { id: 'req-0', status: 'PENDING' },
            });

            await expect(service.createRequest(COMPANY, USER, { months: 1 }))
                .rejects.toThrow(/уже отправлен/);
        });

        it('срок длиннее трёх лет не принимается', async () => {
            const { service } = build({ enabled: true, mainPlan: PLAN });

            await expect(service.createRequest(COMPANY, USER, { months: 48 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('запрос уходит владельцу в телеграм', async () => {
            // Иначе владелец узнает о желании заплатить, когда сам зайдёт
            // в админку.
            const { service, telegram } = build({ enabled: true, mainPlan: PLAN });

            await service.createRequest(COMPANY, USER, { months: 3 });

            expect(telegram.send).toHaveBeenCalled();
            const text: string = telegram.send.mock.calls[0][0];
            expect(text).toContain('ТОО «Пример»');
            expect(text).toContain('3 мес');
        });

        it('молчащий телеграм запрос не роняет', async () => {
            const { service, telegram } = build({ enabled: true, mainPlan: PLAN });
            telegram.send.mockRejectedValue(new Error('нет сети'));

            await expect(service.createRequest(COMPANY, USER, { months: 1 })).resolves.toBeDefined();
        });

        it('имя отправителя сохраняется снимком', async () => {
            // Сотрудник может уволиться, а запрос должен остаться читаемым.
            const { service, prisma } = build({ enabled: true, mainPlan: PLAN });

            await service.createRequest(COMPANY, USER, { months: 1 });

            expect(prisma.subscriptionRequest.create.mock.calls[0][0].data.requesterName)
                .toBe('Заказчик Данияр');
        });

        it('имя берётся из базы, когда его нет в токене', async () => {
            // В JWT фамилии нет, и в админке был виден только БИН компании.
            const { service, prisma } = build({ enabled: true, mainPlan: PLAN });
            prisma.user.findUnique.mockResolvedValue({ firstName: 'Данияр', lastName: 'Заказчик' });

            await service.createRequest(COMPANY, { id: 'u-1' }, { months: 1 });

            expect(prisma.subscriptionRequest.create.mock.calls[0][0].data.requesterName)
                .toBe('Заказчик Данияр');
        });

        it('одобрение продлевает подписку на запрошенный срок', async () => {
            const { service, prisma } = build({
                enabled: true,
                requestId: { id: 'req-1', companyId: COMPANY, months: 3, amount: 75000, planId: 'p-1', status: 'PENDING' },
                plan: PLAN,
                subscription: { id: 's-1', status: SubscriptionStatus.GRACE, trialEndsAt: future(1) },
            });

            await service.approveRequest('req-1', 'Счёт №12');

            const update = prisma.companySubscription.upsert.mock.calls[0][0].update;
            expect(update.status).toBe(SubscriptionStatus.ACTIVE);
            expect(update.periodEnd.toISOString().slice(0, 10))
                .toBe(addMonths(new Date(), 3).toISOString().slice(0, 10));
            expect(prisma.subscriptionRequest.update.mock.calls[0][0].data.status).toBe('APPROVED');
        });

        it('одобренный запрос повторно не проводится', async () => {
            // Иначе двойной клик дарит компании ещё три месяца.
            const { service, prisma } = build({
                enabled: true,
                requestId: { id: 'req-1', companyId: COMPANY, months: 3, amount: 75000, status: 'APPROVED' },
            });

            await expect(service.approveRequest('req-1')).rejects.toThrow(/уже ответили/);
            expect(prisma.companySubscription.upsert).not.toHaveBeenCalled();
        });

        it('отказ подписку не трогает', async () => {
            const { service, prisma } = build({
                enabled: true,
                requestId: { id: 'req-1', companyId: COMPANY, months: 3, amount: 75000, status: 'PENDING' },
            });

            await service.rejectRequest('req-1', 'Оплата не поступила');

            expect(prisma.companySubscription.upsert).not.toHaveBeenCalled();
            expect(prisma.subscriptionRequest.update.mock.calls[0][0].data.status).toBe('REJECTED');
        });

        it('несуществующий запрос не одобряется', async () => {
            const { service } = build({ enabled: true, requestId: null });

            await expect(service.approveRequest('req-нет')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('кабинет видит отправленный запрос', async () => {
            // На плитке «Тариф» должно быть написано «ждём счёт», иначе
            // человек нажмёт «Купить» ещё раз.
            const { service } = build({
                enabled: true,
                mainPlan: PLAN,
                subscription: { id: 's-1', status: SubscriptionStatus.GRACE, trialEndsAt: future(2) },
                request: { id: 'req-1', months: 3, amount: 75000, createdAt: new Date() },
            });

            const status: any = await service.getCompanyStatus(COMPANY);
            expect(status.request).toMatchObject({ months: 3, amount: 75000 });
            expect(status.daysLeft).toBe(2);
        });
    });
});

/**
 * Цена за пользователя (решение владельца от 26.08.2026).
 *
 * Тариф считается не за компанию, а за каждого сотрудника в кабинете. Это
 * деньги, и ошибка здесь тихая: на экране одна сумма, в счёте другая, а
 * заметит её бухгалтер контрагента, а не мы.
 */
describe('Цена за пользователя', () => {
    const COMPANY = 'c-1';

    /** Отдельная сборка: нужен доступ к тому, чем считали сотрудников. */
    const стенд = (options: { price?: number; users?: number; enabled?: boolean } = {}) => {
        const settings = new Map<string, string>([['billing_enabled', String(options.enabled ?? true)]]);
        const план = { id: 'plan-1', name: 'Стандарт', priceMonthly: options.price ?? 5000, currency: 'KZT', features: [] };
        const prisma: any = {
            platformSetting: {
                findMany: jest.fn(async () => [...settings].map(([key, value]) => ({ key, value }))),
                upsert: jest.fn(async () => ({})),
            },
            companySubscription: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn(async ({ data }: any) => ({ id: 'sub-new', ...data })),
                createMany: jest.fn().mockResolvedValue({ count: 0 }),
                update: jest.fn().mockResolvedValue({}),
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                upsert: jest.fn(async () => ({})),
                count: jest.fn().mockResolvedValue(0),
            },
            company: {
                findMany: jest.fn().mockResolvedValue([]),
                findUnique: jest.fn().mockResolvedValue({ id: COMPANY, name: 'ТОО «Пример»', bin: '123456789012' }),
            },
            subscriptionPlan: { findFirst: jest.fn().mockResolvedValue(план) },
            subscriptionRequest: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn(async ({ data }: any) => ({ id: 'req-1', ...data })),
            },
            user: {
                count: jest.fn().mockResolvedValue(options.users ?? 1),
                findUnique: jest.fn().mockResolvedValue(null),
            },
            order: { count: jest.fn().mockResolvedValue(0) },
        };
        const telegram: any = { send: jest.fn().mockResolvedValue(true) };
        return { service: new BillingService(prisma, telegram), prisma, telegram };
    };

    describe('кого считаем', () => {
        it('только тех, кто работает в кабинете, и только действующих', async () => {
            // Водителей не считаем: у них нет кабинета. Иначе у перевозчика
            // с сорока водителями подписка вышла бы в двести тысяч.
            const { service, prisma } = стенд({ users: 3 });

            await service.countBillableUsers(COMPANY);

            expect(prisma.user.count).toHaveBeenCalledWith({
                where: expect.objectContaining({
                    companyId: COMPANY,
                    isActive: true,
                    role: { not: 'DRIVER' },
                }),
            });
        });

        it('меньше одного не бывает', async () => {
            // Компания без единого сотрудника — это компания, в которую
            // никто не может войти. Ноль в цене дал бы бесплатный доступ.
            const { service } = стенд({ users: 0 });

            expect(await service.countBillableUsers(COMPANY)).toBe(1);
        });
    });

    describe('сумма в кабинете', () => {
        it('умножается на число сотрудников', async () => {
            const { service } = стенд({ price: 5000, users: 3 });

            const status: any = await service.getCompanyStatus(COMPANY);

            expect(status.pricePerUser).toBe(5000);
            expect(status.users).toBe(3);
            expect(status.monthlyTotal).toBe(15000);
        });

        it('один сотрудник — одна цена', async () => {
            const { service } = стенд({ price: 5000, users: 1 });
            const status: any = await service.getCompanyStatus(COMPANY);
            expect(status.monthlyTotal).toBe(5000);
        });
    });

    describe('сумма в счёте', () => {
        it('считается так же, как показана в кабинете', async () => {
            // Разъедься эти два расчёта — компания увидит одно на экране и
            // другое в счёте, и виноватыми окажемся мы.
            const { service } = стенд({ price: 5000, users: 4 });

            const status: any = await service.getCompanyStatus(COMPANY);
            const request: any = await service.createRequest(COMPANY, { id: 'u-1' }, { months: 3 });

            expect(request.amount).toBe(status.monthlyTotal * 3);
            expect(request.amount).toBe(60000);
        });

        it('в уведомлении владельцу видно, из чего сложилась сумма', async () => {
            const { service, telegram } = стенд({ price: 5000, users: 2 });

            await service.createRequest(COMPANY, { id: 'u-1', lastName: 'Сериков' }, { months: 1 });

            const текст = telegram.send.mock.calls[0][0];
            expect(текст).toContain('2 сотрудника');
            // Числа сравниваем так же, как их пишет служба: в русской
            // локали разряды разделяет неразрывный пробел, а не обычный.
            expect(текст).toContain((5000).toLocaleString('ru-RU'));
            expect(текст).toContain((10000).toLocaleString('ru-RU'));
        });
    });

    describe('список компаний у владельца', () => {
        it('водителей не считает', async () => {
            // Владелец сверяет эту строку со счётом, который сам выставил.
            // Посчитай тут всех подряд — у перевозчика с водителями список
            // разойдётся со счётом, и разбираться будет он, а не мы.
            const { service, prisma } = стенд();

            await service.getSubscriptionsOverview();

            const аргументы = prisma.company.findMany.mock.calls[0][0];
            expect(аргументы.select._count.select.users).toMatchObject({
                where: expect.objectContaining({ role: { not: 'DRIVER' }, isActive: true }),
            });
        });

        it('сумма месяца считается по тем же правилам, что и счёт', async () => {
            const { service, prisma } = стенд({ price: 5000 });
            prisma.company.findMany.mockResolvedValue([
                { id: 'c-1', name: 'С тремя', bin: null, createdAt: new Date(), _count: { users: 3 }, subscription: null },
                // Компания без единого сотрудника: в счёте меньше одного не
                // бывает, и в списке должно стоять то же самое.
                { id: 'c-2', name: 'Пустая', bin: null, createdAt: new Date(), _count: { users: 0 }, subscription: null },
            ]);

            const [сТремя, пустая]: any = await service.getSubscriptionsOverview();

            expect(сТремя).toMatchObject({ users: 3, monthlyTotal: 15000 });
            expect(пустая).toMatchObject({ users: 1, monthlyTotal: 5000 });
        });

        it('у оплатившей компании берётся её цена, а не новая', async () => {
            // Тариф мог подорожать после оплаты — в списке должна стоять та
            // сумма, по которой компания живёт сейчас.
            const { service, prisma } = стенд({ price: 9000 });
            prisma.company.findMany.mockResolvedValue([{
                id: 'c-1', name: 'Оплатила раньше', bin: null, createdAt: new Date(),
                _count: { users: 2 },
                subscription: { status: SubscriptionStatus.ACTIVE, plan: { id: 'p-old', name: 'Стандарт', priceMonthly: 5000 } },
            }]);

            const [компания]: any = await service.getSubscriptionsOverview();

            expect(компания).toMatchObject({ pricePerUser: 5000, monthlyTotal: 10000 });
        });
    });

    describe('пока оплата выключена', () => {
        it('цена ноль, даже если тариф заведён', async () => {
            // Иначе на витрине висит цена, которую никто не платит.
            const { service } = стенд({ price: 5000, enabled: false });

            const tariff = await service.getTariff();

            expect(tariff.paid).toBe(false);
            expect(tariff.pricePerUser).toBe(0);
        });
    });
});
