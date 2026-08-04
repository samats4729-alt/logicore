import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { BillingService } from './billing.service';

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
        subscription?: any;
        companies?: any[];
        plan?: any;
        userCount?: number;
        orderCount?: number;
    } = {}) => {
        // Настройки живут в базе, а не в объекте сборки: сохранение обязано
        // менять то, что прочитают следующим запросом, иначе проверка
        // «выключил биллинг — разблокировало» ничего не проверяет.
        const settings = new Map<string, string>([
            ['billing_enabled', String(options.enabled ?? false)],
            ...(options.trialDays === undefined
                ? []
                : [['billing_trial_days', options.trialDays] as [string, string]]),
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
                update: jest.fn().mockResolvedValue({}),
                upsert: jest.fn(async (args: any) => ({ companyId: COMPANY, ...args.update })),
                count: jest.fn().mockResolvedValue(0),
            },
            company: {
                findMany: jest.fn().mockResolvedValue(options.companies ?? []),
                findUnique: jest.fn().mockResolvedValue({ id: COMPANY }),
            },
            subscriptionPlan: {
                findUnique: jest.fn().mockResolvedValue(options.plan ?? null),
                create: jest.fn(async ({ data }: any) => data),
                update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
                delete: jest.fn().mockResolvedValue({}),
                findMany: jest.fn().mockResolvedValue([]),
            },
            user: { count: jest.fn().mockResolvedValue(options.userCount ?? 0) },
            order: { count: jest.fn().mockResolvedValue(options.orderCount ?? 0) },
        };
        return { service: new BillingService(prisma), prisma };
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

    describe('включение биллинга', () => {
        it('все действующие компании получают пробный период', async () => {
            // Иначе в момент включения вся платформа встаёт разом.
            const { service, prisma } = build({
                enabled: false,
                companies: [{ id: 'c-1' }, { id: 'c-2' }],
            });

            const result = await service.updateSettings({ enabled: true });

            expect(result.trialsCreated).toBe(2);
            expect(prisma.companySubscription.createMany.mock.calls[0][0].data).toHaveLength(2);
        });

        it('триал выдаётся только настоящим арендаторам', async () => {
            const { service, prisma } = build({ enabled: false, companies: [{ id: 'c-1' }] });
            await service.updateSettings({ enabled: true });

            const where = prisma.company.findMany.mock.calls[0][0].where;
            expect(where.isExternal).toBe(false);
            expect(where.isActive).toBe(true);
            expect(where.subscription).toBeNull();
        });

        it('повторное сохранение настроек триалы не раздаёт', async () => {
            // Иначе правка срока пробного периода продлевала бы жизнь всем,
            // кого уже отключили за неоплату.
            const { service, prisma } = build({ enabled: true, companies: [{ id: 'c-1' }] });

            const result = await service.updateSettings({ trialDays: 20 });

            expect(result.trialsCreated).toBe(0);
            expect(prisma.companySubscription.createMany).not.toHaveBeenCalled();
        });

        it('выключение биллинга разблокирует сразу', async () => {
            const { service } = build({
                enabled: true,
                subscription: { id: 's-1', status: SubscriptionStatus.TRIAL, trialEndsAt: past(1) },
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

            const periodEnd: Date = prisma.companySubscription.upsert.mock.calls[0][0].update.periodEnd;
            const expected = new Date(end);
            expected.setMonth(expected.getMonth() + 1);
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
});
