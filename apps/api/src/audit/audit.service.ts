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
