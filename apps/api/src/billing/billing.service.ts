import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus, SubscriptionRequestStatus } from '@prisma/client';
import { TelegramService } from '../telegram/telegram.service';
import { addMonths, kzStartOfMonth } from '../common/utils/business-date';

const SETTING_ENABLED = 'billing_enabled';
const SETTING_TRIAL_DAYS = 'billing_trial_days';
const SETTING_GRACE_DAYS = 'billing_grace_days';
const DEFAULT_TRIAL_DAYS = 14;
/**
 * Сколько дней даётся на оплату тем, кто работал бесплатно, когда владелец
 * назначил цену. Три дня — то, что он назвал; меняется в админке.
 */
const DEFAULT_GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Кэш в памяти, чтобы не ходить в БД на каждый запрос */
const SETTINGS_CACHE_TTL_MS = 30_000;
const ACCESS_CACHE_TTL_MS = 60_000;

/** Статусы, при которых кабинет открыт без оплаты — до даты в `trialEndsAt`. */
const FREE_STATUSES: SubscriptionStatus[] = [SubscriptionStatus.TRIAL, SubscriptionStatus.GRACE];

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);

    constructor(private prisma: PrismaService, private telegram: TelegramService) { }

    private settingsCache: { enabled: boolean; trialDays: number; graceDays: number; expiresAt: number } | null = null;
    private accessCache = new Map<string, { allowed: boolean; expiresAt: number }>();

    private invalidateCaches() {
        this.settingsCache = null;
        this.accessCache.clear();
    }

    // ==================== Настройки ====================

    async getSettings(): Promise<{ enabled: boolean; trialDays: number; graceDays: number }> {
        if (this.settingsCache && this.settingsCache.expiresAt > Date.now()) {
            const { enabled, trialDays, graceDays } = this.settingsCache;
            return { enabled, trialDays, graceDays };
        }
        const rows = await this.prisma.platformSetting.findMany({
            where: { key: { in: [SETTING_ENABLED, SETTING_TRIAL_DAYS, SETTING_GRACE_DAYS] } },
        });
        const map = new Map(rows.map(r => [r.key, r.value]));
        const enabled = map.get(SETTING_ENABLED) === 'true';
        const trialDays = parseInt(map.get(SETTING_TRIAL_DAYS) || '', 10) || DEFAULT_TRIAL_DAYS;
        const graceDays = parseInt(map.get(SETTING_GRACE_DAYS) || '', 10) || DEFAULT_GRACE_DAYS;
        this.settingsCache = { enabled, trialDays, graceDays, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
        return { enabled, trialDays, graceDays };
    }

    /**
     * Настройки тарифа целиком: цена, сроки и рубильник.
     *
     * Цена лежит не в настройках, а в основном тарифном плане — там же, где
     * её видят подписки. Но правится вместе с остальным и одним действием:
     * «назначить цену» и «включить оплату» для владельца одно и то же
     * решение, и разваливаться на два запроса оно не должно.
     */
    async updateSettings(data: {
        enabled?: boolean;
        trialDays?: number;
        graceDays?: number;
        priceMonthly?: number;
    }) {
        const current = await this.getSettings();
        const enabled = data.enabled ?? current.enabled;
        const trialDays = data.trialDays ?? current.trialDays;
        const graceDays = data.graceDays ?? current.graceDays;
        if (trialDays < 1 || trialDays > 365) {
            throw new BadRequestException('Пробный период: от 1 до 365 дней');
        }
        if (graceDays < 1 || graceDays > 90) {
            throw new BadRequestException('Дней на оплату: от 1 до 90');
        }
        if (data.priceMonthly != null && data.priceMonthly < 0) {
            throw new BadRequestException('Цена должна быть неотрицательной');
        }

        if (data.priceMonthly != null) {
            await this.setTariffPrice(Math.round(data.priceMonthly));
        }

        const saved: Array<[string, string]> = [
            [SETTING_ENABLED, String(enabled)],
            [SETTING_TRIAL_DAYS, String(trialDays)],
            [SETTING_GRACE_DAYS, String(graceDays)],
        ];
        for (const [key, value] of saved) {
            await this.prisma.platformSetting.upsert({
                where: { key },
                create: { key, value },
                update: { value },
            });
        }

        // День включения оплаты. Отрубать разом всех, кто работал бесплатно,
        // нельзя: у них рейсы в пути. Каждый получает названное владельцем
        // число дней, чтобы успеть оплатить.
        let graceGranted = 0;
        if (enabled && !current.enabled) {
            graceGranted = await this.provisionGrace(graceDays);
        }

        this.invalidateCaches();
        return { enabled, trialDays, graceDays, graceGranted };
    }

    /**
     * Дать всем работающим компаниям срок на оплату.
     *
     * Правило одно: только добавляем. У кого доступ и так дальше этого срока
     * (оплачен вперёд, бессрочная подписка, длинный пробный период) — того не
     * трогаем, иначе включение оплаты отняло бы у него оплаченные дни.
     */
    private async provisionGrace(graceDays: number): Promise<number> {
        const graceEndsAt = new Date(Date.now() + graceDays * DAY_MS);

        const fresh = await this.prisma.company.findMany({
            where: { isExternal: false, isActive: true, subscription: null },
            select: { id: true },
        });
        if (fresh.length > 0) {
            await this.prisma.companySubscription.createMany({
                data: fresh.map(c => ({
                    companyId: c.id,
                    status: SubscriptionStatus.GRACE,
                    trialEndsAt: graceEndsAt,
                })),
                skipDuplicates: true,
            });
        }

        const shortened = await this.prisma.companySubscription.updateMany({
            where: {
                company: { isExternal: false, isActive: true },
                OR: [
                    // Бесплатный доступ кончается раньше срока на оплату
                    {
                        status: { in: FREE_STATUSES },
                        OR: [{ trialEndsAt: null }, { trialEndsAt: { lt: graceEndsAt } }],
                    },
                    // Оплаченный период кончается раньше (бессрочные — periodEnd
                    // пустой — сюда не попадают и остаются как были)
                    { status: SubscriptionStatus.ACTIVE, periodEnd: { lt: graceEndsAt } },
                    // Уже отключённые: до сегодняшнего дня они всё равно
                    // работали, потому что биллинг был выключен
                    { status: { in: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELLED] } },
                ],
            },
            data: { status: SubscriptionStatus.GRACE, trialEndsAt: graceEndsAt },
        });

        return fresh.length + shortened.count;
    }

    // ==================== Проверка доступа ====================

    /**
     * Разрешён ли компании доступ к платформе.
     * Биллинг выключен — доступ всегда есть. Компании без подписки
     * автоматически выдаётся пробный период (новые регистрации).
     */
    async isCompanyAllowed(companyId: string): Promise<boolean> {
        const { enabled, trialDays } = await this.getSettings();
        if (!enabled) return true;

        const cached = this.accessCache.get(companyId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.allowed;
        }

        const allowed = await this.resolveAccess(companyId, trialDays);
        this.accessCache.set(companyId, { allowed, expiresAt: Date.now() + ACCESS_CACHE_TTL_MS });
        return allowed;
    }

    private async resolveAccess(companyId: string, trialDays: number): Promise<boolean> {
        let sub = await this.prisma.companySubscription.findUnique({ where: { companyId } });

        if (!sub) {
            // Новая компания — автоматический пробный период
            sub = await this.prisma.companySubscription.create({
                data: {
                    companyId,
                    status: SubscriptionStatus.TRIAL,
                    trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
                },
            });
        }

        const now = new Date();

        if (FREE_STATUSES.includes(sub.status)) {
            if (sub.trialEndsAt && sub.trialEndsAt > now) return true;
            await this.prisma.companySubscription.update({
                where: { id: sub.id },
                data: { status: SubscriptionStatus.PAST_DUE },
            });
            return false;
        }

        if (sub.status === SubscriptionStatus.ACTIVE) {
            if (!sub.periodEnd || sub.periodEnd > now) return true;
            await this.prisma.companySubscription.update({
                where: { id: sub.id },
                data: { status: SubscriptionStatus.PAST_DUE },
            });
            return false;
        }

        return false; // PAST_DUE / CANCELLED
    }

    // ==================== Тариф платформы ====================

    /**
     * Основной тариф — тот, что показывают на лендинге и по которому считают
     * счёт. Планов в базе может быть несколько, но продаётся один; берём
     * первый по порядку сортировки.
     */
    private async getMainPlan() {
        return this.prisma.subscriptionPlan.findFirst({
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
        });
    }

    /** Записать цену в основной тариф, заведя его, если тарифа ещё нет. */
    private async setTariffPrice(priceMonthly: number) {
        const plan = await this.getMainPlan();
        if (plan) {
            return this.prisma.subscriptionPlan.update({
                where: { id: plan.id },
                data: { priceMonthly },
            });
        }
        return this.prisma.subscriptionPlan.create({
            data: { name: 'Стандарт', priceMonthly, sortOrder: 0 },
        });
    }

    /**
     * Тариф для лендинга и кабинета. Открыт без авторизации: цену видят и те,
     * кто ещё не зарегистрировался.
     *
     * Пока оплата не включена, цена ноль — независимо от того, какая сумма
     * уже заведена в тарифе. Иначе на сайте висела бы цена, которую никто не
     * платит.
     */
    async getTariff() {
        const { enabled, trialDays } = await this.getSettings();
        const plan = await this.getMainPlan();
        return {
            paid: enabled,
            name: plan?.name ?? 'Стандарт',
            priceMonthly: enabled ? (plan?.priceMonthly ?? 0) : 0,
            currency: plan?.currency ?? 'KZT',
            trialDays,
            features: plan?.features ?? [],
        };
    }

    /** Статус подписки для кабинета компании (плитка «Тариф», пейволл) */
    async getCompanyStatus(companyId?: string) {
        const { enabled } = await this.getSettings();
        if (!enabled || !companyId) {
            return { enabled: false, blocked: false };
        }

        const allowed = await this.isCompanyAllowed(companyId);
        const [sub, tariff, request] = await Promise.all([
            this.prisma.companySubscription.findUnique({
                where: { companyId },
                include: { plan: { select: { id: true, name: true, priceMonthly: true, currency: true } } },
            }),
            this.getTariff(),
            this.prisma.subscriptionRequest.findFirst({
                where: { companyId, status: SubscriptionRequestStatus.PENDING },
                orderBy: { createdAt: 'desc' },
                select: { id: true, months: true, amount: true, createdAt: true },
            }),
        ]);

        // Цена компании — из её плана, если он назначен: тариф мог подорожать
        // после того, как она оплатила.
        const priceMonthly = sub?.plan?.priceMonthly ?? tariff.priceMonthly;
        const until = sub && FREE_STATUSES.includes(sub.status) ? sub.trialEndsAt : sub?.periodEnd ?? null;

        return {
            enabled: true,
            blocked: !allowed,
            status: sub?.status ?? null,
            trialEndsAt: sub?.trialEndsAt ?? null,
            periodEnd: sub?.periodEnd ?? null,
            plan: sub?.plan ?? null,
            priceMonthly,
            until,
            daysLeft: until ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / DAY_MS)) : null,
            request,
        };
    }

    // ==================== Лимиты тарифов ====================

    /** Лимиты плана компании; null = без ограничений (биллинг выключен / план без лимитов / триал) */
    private async getPlanLimits(companyId: string): Promise<{ maxUsers: number | null; maxOrdersPerMonth: number | null } | null> {
        const { enabled } = await this.getSettings();
        if (!enabled) return null;

        const sub = await this.prisma.companySubscription.findUnique({
            where: { companyId },
            include: { plan: { select: { maxUsers: true, maxOrdersPerMonth: true } } },
        });
        if (!sub?.plan) return null; // триал или подписка без плана — не ограничиваем
        return { maxUsers: sub.plan.maxUsers, maxOrdersPerMonth: sub.plan.maxOrdersPerMonth };
    }

    /** Проверка лимита офисных сотрудников (водители не считаются) перед добавлением нового */
    async assertUserLimit(companyId: string): Promise<void> {
        const limits = await this.getPlanLimits(companyId);
        if (!limits?.maxUsers) return;

        const count = await this.prisma.user.count({
            where: { companyId, isActive: true, role: { not: 'DRIVER' } },
        });
        if (count >= limits.maxUsers) {
            throw new ForbiddenException(
                `Достигнут лимит тарифа: до ${limits.maxUsers} сотрудников. Перейдите на тариф выше, чтобы добавить больше.`,
            );
        }
    }

    /** Проверка лимита заявок за календарный месяц перед созданием новой */
    async assertOrderLimit(companyId: string): Promise<void> {
        const limits = await this.getPlanLimits(companyId);
        if (!limits?.maxOrdersPerMonth) return;

        // Месяц считается по Казахстану: иначе ночью первого числа лимит
        // ещё не обнулялся и заявку создать было нельзя.
        const monthStart = kzStartOfMonth();

        const count = await this.prisma.order.count({
            where: { customerCompanyId: companyId, createdAt: { gte: monthStart } },
        });
        if (count >= limits.maxOrdersPerMonth) {
            throw new ForbiddenException(
                `Достигнут лимит тарифа: до ${limits.maxOrdersPerMonth} заявок в месяц. Перейдите на тариф выше, чтобы создавать больше.`,
            );
        }
    }

    // ==================== Тарифные планы ====================

    async getActivePlans() {
        return this.prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
        });
    }

    async getAllPlans() {
        return this.prisma.subscriptionPlan.findMany({
            orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
            include: { _count: { select: { subscriptions: true } } },
        });
    }

    async createPlan(data: {
        name: string;
        description?: string;
        priceMonthly: number;
        maxUsers?: number | null;
        maxOrdersPerMonth?: number | null;
        features?: string[];
        isActive?: boolean;
        sortOrder?: number;
    }) {
        if (!data.name?.trim()) throw new BadRequestException('Название плана обязательно');
        if (data.priceMonthly == null || data.priceMonthly < 0) {
            throw new BadRequestException('Цена должна быть неотрицательной');
        }
        return this.prisma.subscriptionPlan.create({
            data: {
                name: data.name.trim(),
                description: data.description,
                priceMonthly: Math.round(data.priceMonthly),
                maxUsers: data.maxUsers ?? null,
                maxOrdersPerMonth: data.maxOrdersPerMonth ?? null,
                features: data.features ?? [],
                isActive: data.isActive ?? true,
                sortOrder: data.sortOrder ?? 0,
            },
        });
    }

    async updatePlan(id: string, data: Partial<{
        name: string;
        description: string | null;
        priceMonthly: number;
        maxUsers: number | null;
        maxOrdersPerMonth: number | null;
        features: string[];
        isActive: boolean;
        sortOrder: number;
    }>) {
        const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
        if (!plan) throw new NotFoundException('План не найден');
        if (data.priceMonthly != null && data.priceMonthly < 0) {
            throw new BadRequestException('Цена должна быть неотрицательной');
        }
        return this.prisma.subscriptionPlan.update({
            where: { id },
            data: {
                ...data,
                priceMonthly: data.priceMonthly != null ? Math.round(data.priceMonthly) : undefined,
            },
        });
    }

    async deletePlan(id: string) {
        const used = await this.prisma.companySubscription.count({ where: { planId: id } });
        if (used > 0) {
            // План с подписками не удаляем — деактивируем
            return this.prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false } });
        }
        return this.prisma.subscriptionPlan.delete({ where: { id } });
    }

    // ==================== Подписки компаний (админ) ====================

    async getSubscriptionsOverview() {
        const companies = await this.prisma.company.findMany({
            where: { isExternal: false, isActive: true },
            select: {
                id: true,
                name: true,
                bin: true,
                createdAt: true,
                _count: { select: { users: true } },
                subscription: {
                    include: { plan: { select: { id: true, name: true, priceMonthly: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return companies;
    }

    /**
     * Ручное управление подпиской компании (после оплаты по счёту).
     * months — продлить на N месяцев от текущего конца периода (или от сегодня).
     */
    async updateCompanySubscription(companyId: string, data: {
        planId?: string | null;
        status?: SubscriptionStatus;
        months?: number;
        trialEndsAt?: string | Date | null;
        periodEnd?: string | Date | null;
        note?: string | null;
    }) {
        const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
        if (!company) throw new NotFoundException('Компания не найдена');

        if (data.planId) {
            const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: data.planId } });
            if (!plan) throw new BadRequestException('План не найден');
        }

        const existing = await this.prisma.companySubscription.findUnique({ where: { companyId } });

        const update: any = {};
        if (data.planId !== undefined) update.planId = data.planId;
        if (data.status !== undefined) update.status = data.status;
        if (data.note !== undefined) update.note = data.note;
        if (data.trialEndsAt !== undefined) {
            update.trialEndsAt = data.trialEndsAt ? new Date(data.trialEndsAt) : null;
        }
        if (data.periodEnd !== undefined) {
            update.periodEnd = data.periodEnd ? new Date(data.periodEnd) : null;
        }

        // Продление на N месяцев: от конца текущего оплаченного периода, если он в будущем
        if (data.months && data.months > 0) {
            const now = new Date();
            const base = existing?.periodEnd && existing.periodEnd > now ? new Date(existing.periodEnd) : now;
            update.periodEnd = addMonths(base, data.months);
            update.periodStart = existing?.periodStart && existing?.periodEnd && existing.periodEnd > now
                ? existing.periodStart
                : now;
            update.status = SubscriptionStatus.ACTIVE;
        }

        const result = await this.prisma.companySubscription.upsert({
            where: { companyId },
            create: {
                companyId,
                status: update.status ?? SubscriptionStatus.TRIAL,
                planId: update.planId ?? null,
                trialEndsAt: update.trialEndsAt ?? null,
                periodStart: update.periodStart ?? null,
                periodEnd: update.periodEnd ?? null,
                note: update.note ?? null,
            },
            update,
            include: { plan: { select: { id: true, name: true, priceMonthly: true } } },
        });

        this.invalidateCaches();
        return result;
    }

    // ==================== Запросы на покупку ====================

    /**
     * Компания просит счёт на N месяцев.
     *
     * Сумма считается здесь, а не приходит из браузера: цену назначает
     * владелец платформы, и подставить свою компания не должна.
     */
    async createRequest(
        companyId: string,
        user: { id?: string; firstName?: string; lastName?: string },
        data: { months: number; comment?: string },
    ) {
        const months = Math.round(Number(data.months));
        if (!Number.isFinite(months) || months < 1 || months > 36) {
            throw new BadRequestException('Срок подписки: от 1 до 36 месяцев');
        }

        const pending = await this.prisma.subscriptionRequest.findFirst({
            where: { companyId, status: SubscriptionRequestStatus.PENDING },
        });
        if (pending) {
            throw new BadRequestException('Запрос уже отправлен — ждём счёт');
        }

        const [company, plan] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true, bin: true } }),
            this.getMainPlan(),
        ]);
        if (!company) throw new NotFoundException('Компания не найдена');

        // В токене ФИО нет — берём из базы, как это делает аудит-лог. Иначе в
        // админке было бы видно компанию, но не человека, который просил счёт.
        let requesterName = [user.lastName, user.firstName].filter(Boolean).join(' ').trim() || null;
        if (!requesterName && user.id) {
            const dbUser = await this.prisma.user.findUnique({
                where: { id: user.id },
                select: { firstName: true, lastName: true },
            });
            requesterName = [dbUser?.lastName, dbUser?.firstName].filter(Boolean).join(' ').trim() || null;
        }
        const request = await this.prisma.subscriptionRequest.create({
            data: {
                companyId,
                months,
                amount: (plan?.priceMonthly ?? 0) * months,
                planId: plan?.id ?? null,
                requestedById: user.id ?? null,
                requesterName,
                comment: data.comment?.trim() || null,
            },
        });

        await this.notifyOwner(
            'Запрос на подписку\n\n' +
            `${company.name}${company.bin ? ` · БИН ${company.bin}` : ''}\n` +
            `${months} мес · ${request.amount.toLocaleString('ru-RU')} ₸\n` +
            (requesterName ? `Отправил: ${requesterName}\n` : '') +
            (request.comment ? `\n${request.comment}` : ''),
        );

        return request;
    }

    /** Запросы компаний: сначала те, на которые не ответили. */
    async listRequests() {
        return this.prisma.subscriptionRequest.findMany({
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
            take: 200,
            include: {
                company: {
                    select: {
                        id: true, name: true, bin: true,
                        subscription: { select: { status: true, periodEnd: true, trialEndsAt: true } },
                    },
                },
            },
        });
    }

    /** Оплата пришла: продлеваем подписку на запрошенный срок и закрываем запрос. */
    async approveRequest(id: string, note?: string | null) {
        const request = await this.prisma.subscriptionRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Запрос не найден');
        if (request.status !== SubscriptionRequestStatus.PENDING) {
            throw new BadRequestException('На этот запрос уже ответили');
        }

        await this.updateCompanySubscription(request.companyId, {
            months: request.months,
            planId: request.planId ?? undefined,
            note: note?.trim() || `Запрос на ${request.months} мес · ${request.amount.toLocaleString('ru-RU')} ₸`,
        });

        return this.prisma.subscriptionRequest.update({
            where: { id },
            data: {
                status: SubscriptionRequestStatus.APPROVED,
                decisionNote: note?.trim() || null,
                decidedAt: new Date(),
            },
        });
    }

    async rejectRequest(id: string, note?: string | null) {
        const request = await this.prisma.subscriptionRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Запрос не найден');
        if (request.status !== SubscriptionRequestStatus.PENDING) {
            throw new BadRequestException('На этот запрос уже ответили');
        }

        return this.prisma.subscriptionRequest.update({
            where: { id },
            data: {
                status: SubscriptionRequestStatus.REJECTED,
                decisionNote: note?.trim() || null,
                decidedAt: new Date(),
            },
        });
    }

    /**
     * Сообщить владельцу в телеграм. Запрос уже сохранён, поэтому падать
     * из-за мессенджера нельзя: не дошло — значит увидит в админке.
     */
    private async notifyOwner(text: string) {
        try {
            await this.telegram.send(text);
        } catch (error) {
            this.logger.warn(`Не удалось отправить уведомление о подписке: ${error}`);
        }
    }
}
