import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SETTING_COMPANIES_ENABLED = 'audit_companies_enabled';
const SETTINGS_CACHE_TTL_MS = 30_000;

export interface AuditEntry {
    companyId?: string | null;
    /** req.user — берём id/имя/роль автора действия */
    user?: { sub?: string; id?: string; firstName?: string; lastName?: string; role?: string } | null;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS' | 'SETTINGS';
    entity: string;
    entityId?: string | null;
    entityLabel?: string | null;
    details?: Record<string, any> | null;
    /** Рейс, к которому относится действие — чтобы карточка заявки собрала свою ленту. */
    orderId?: string | null;
}

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);
    private settingsCache: { companiesEnabled: boolean; expiresAt: number } | null = null;

    constructor(private prisma: PrismaService) { }

    /**
     * Записать событие. Никогда не роняет основную операцию:
     * ошибки журнала только логируются.
     */
    async log(entry: AuditEntry): Promise<void> {
        try {
            const user = entry.user;
            let userName = user
                ? `${user.lastName || ''} ${user.firstName || ''}`.trim() || null
                : null;

            // В JWT нет ФИО — подтягиваем из базы для читаемого журнала
            const userId = user?.sub || user?.id;
            if (!userName && userId) {
                const dbUser = await this.prisma.user.findUnique({
                    where: { id: userId },
                    select: { firstName: true, lastName: true },
                });
                if (dbUser) {
                    userName = `${dbUser.lastName || ''} ${dbUser.firstName || ''}`.trim() || null;
                }
            }

            await this.prisma.auditLog.create({
                data: {
                    companyId: entry.companyId ?? null,
                    userId: user?.sub || user?.id || null,
                    userName,
                    userRole: user?.role || null,
                    action: entry.action,
                    entity: entry.entity,
                    entityId: entry.entityId ?? null,
                    entityLabel: entry.entityLabel ?? null,
                    details: entry.details ?? undefined,
                    orderId: entry.orderId ?? null,
                },
            });
        } catch (error: any) {
            this.logger.warn(`Audit log failed (${entry.entity}/${entry.action}): ${error.message}`);
        }
    }

    // ==================== Чтение ====================

    async getCompanyLog(companyId: string, page = 1, limit = 50) {
        const skip = (Math.max(1, page) - 1) * limit;
        const [data, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where: { companyId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.auditLog.count({ where: { companyId } }),
        ]);
        return { data, total, page, limit };
    }

    /**
     * История одного рейса одной лентой: смены статуса и действия людей.
     *
     * Статусы и журнал действий лежат в разных таблицах и заполнялись
     * независимо — карточка показывала только статусы, и то без автора.
     * «Кто вложил этот документ» узнать было негде.
     *
     * Ленту собираем здесь, а не на экране: сортировка по времени поверх
     * двух источников и подстановка имён — это работа сервера.
     */
    async getOrderHistory(orderId: string) {
        const [statuses, actions] = await Promise.all([
            this.prisma.orderStatusHistory.findMany({
                where: { orderId },
                orderBy: { changedAt: 'desc' },
            }),
            this.prisma.auditLog.findMany({
                where: { orderId },
                orderBy: { createdAt: 'desc' },
                take: 200,
            }),
        ]);

        // Имя автора смены статуса хранится только идентификатором — в отличие
        // от журнала действий, где лежит снимок ФИО. Достаём одним запросом.
        const userIds = Array.from(new Set(statuses.map(s => s.changedById).filter(Boolean))) as string[];
        const users = userIds.length
            ? await this.prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, firstName: true, lastName: true },
            })
            : [];
        const nameById = new Map(
            users.map(u => [u.id, `${u.lastName || ''} ${u.firstName || ''}`.trim() || null]),
        );

        const feed = [
            ...statuses.map(s => ({
                kind: 'STATUS' as const,
                at: s.changedAt,
                status: s.status,
                comment: s.comment,
                userName: s.changedById ? nameById.get(s.changedById) ?? null : null,
                userRole: null as string | null,
            })),
            ...actions.map(a => ({
                kind: 'ACTION' as const,
                at: a.createdAt,
                action: a.action,
                entity: a.entity,
                label: a.entityLabel,
                details: a.details,
                userName: a.userName,
                userRole: a.userRole,
            })),
        ];

        feed.sort((a, b) => b.at.getTime() - a.at.getTime());
        return feed;
    }

    async getPlatformLog(params: { companyId?: string; page?: number; limit?: number }) {
        const limit = Math.min(params.limit || 50, 200);
        const page = Math.max(1, params.page || 1);
        const where = params.companyId ? { companyId: params.companyId } : {};
        const [data, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.auditLog.count({ where }),
        ]);
        return { data, total, page, limit };
    }

    // ==================== Рубильник раздела для компаний ====================

    async isCompaniesUiEnabled(): Promise<boolean> {
        if (this.settingsCache && this.settingsCache.expiresAt > Date.now()) {
            return this.settingsCache.companiesEnabled;
        }
        const row = await this.prisma.platformSetting.findUnique({
            where: { key: SETTING_COMPANIES_ENABLED },
        });
        const enabled = row?.value === 'true';
        this.settingsCache = { companiesEnabled: enabled, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
        return enabled;
    }

    async setCompaniesUiEnabled(enabled: boolean) {
        await this.prisma.platformSetting.upsert({
            where: { key: SETTING_COMPANIES_ENABLED },
            create: { key: SETTING_COMPANIES_ENABLED, value: String(enabled) },
            update: { value: String(enabled) },
        });
        this.settingsCache = null;
        return { companiesEnabled: enabled };
    }
}
