import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';

const SETTING_ENABLED = 'billing_enabled';
const SETTING_TRIAL_DAYS = 'billing_trial_days';
const DEFAULT_TRIAL_DAYS = 14;

/** Кэш в памяти, чтобы не ходить в БД на каждый запрос */
const SETTINGS_CACHE_TTL_MS = 30_000;
const ACCESS_CACHE_TTL_MS = 60_000;

@Injectable()
export class BillingService {
    constructor(private prisma: PrismaService) { }

    private settingsCache: { enabled: boolean; trialDays: number; expiresAt: number } | null = null;
    private accessCache = new Map<string, { allowed: boolean; expiresAt: number }>();

    private invalidateCaches() {
        this.settingsCache = null;
        this.accessCache.clear();
    }

    // ==================== Настройки ====================

    async getSettings(): Promise<{ enabled: boolean; trialDays: number }> {
        if (this.settingsCache && this.settingsCache.expiresAt > Date.now()) {
            return { enabled: this.settingsCache.enabled, trialDays: this.settingsCache.trialDays };
        }
        const rows = await this.prisma.platformSetting.findMany({
            where: { key: { in: [SETTING_ENABLED, SETTING_TRIAL_DAYS] } },
        });
        const map = new Map(rows.map(r => [r.key, r.value]));
        const enabled = map.get(SETTING_ENABLED) === 'true';
        const trialDays = parseInt(map.get(SETTING_TRIAL_DAYS) || '', 10) || DEFAULT_TRIAL_DAYS;
        this.settingsCache = { enabled, trialDays, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
        return { enabled, trialDays };
    }

    async updateSettings(data: { enabled?: boolean; trialDays?: number }) {
        const current = await this.getSettings();
        const enabled = data.enabled ?? current.enabled;
        const trialDays = data.trialDays ?? current.trialDays;
        if (trialDays < 1 || trialDays > 365) {
            throw new BadRequestException('Пробный период: от 1 до 365 дней');
        }

        await this.prisma.platformSetting.upsert({
            where: { key: SETTING_ENABLED },
            create: { key: SETTING_ENABLED, value: String(enabled) },
            update: { value: String(enabled) },
        });
        await this.prisma.platformSetting.upsert({
            where: { key: SETTING_TRIAL_DAYS },
            create: { key: SETTING_TRIAL_DAYS, value: String(trialDays) },
            update: { value: String(trialDays) },
        });

        // При включении биллинга все компании без подписки получают пробный период —
        // никого не отрубаем сразу
        let trialsCreated = 0;
        if (enabled && !current.enabled) {
            trialsCreated = await this.provisionTrials(trialDays);
        }

        this.invalidateCaches();
        return { enabled, trialDays, trialsCreated };
    }

    /** Выдать триал всем реальным компаниям без подписки */
    private async provisionTrials(trialDays: number): Promise<number> {
        const companies = await this.prisma.company.findMany({
            where: { isExternal: false, isActive: true, subscription: null },
            select: { id: true },
        });
        if (companies.length === 0) return 0;

        const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
        await this.prisma.companySubscription.createMany({
            data: companies.map(c => ({
                companyId: c.id,
                status: SubscriptionStatus.TRIAL,
                trialEndsAt,
            })),
            skipDuplicates: true,
        });
        return companies.length;
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

        if (sub.status === SubscriptionStatus.TRIAL) {
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

    /** Статус подписки для кабинета компании (баннер, страница тарифов) */
    async getCompanyStatus(companyId?: string) {
        const { enabled } = await this.getSettings();
        if (!enabled || !companyId) {
            return { enabled: false, blocked: false };
        }

        const allowed = await this.isCompanyAllowed(companyId);
        const sub = await this.prisma.companySubscription.findUnique({
            where: { companyId },
            include: { plan: { select: { id: true, name: true, priceMonthly: true, currency: true } } },
        });

        return {
            enabled: true,
            blocked: !allowed,
            status: sub?.status ?? null,
            trialEndsAt: sub?.trialEndsAt ?? null,
            periodEnd: sub?.periodEnd ?? null,
            plan: sub?.plan ?? null,
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

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

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
            base.setMonth(base.getMonth() + data.months);
            update.periodEnd = base;
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
}
