import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/** Сколько живёт публичная ссылка на отчёт. */
export const SHARE_LINK_TTL_DAYS = 7;

export interface ResolvedShareLink {
    id: string;
    companyId: string;
    companyName: string;
    counterpartyId: string;
    counterpartyName: string;
    ourRole: string;
    expiresAt: Date;
}

/**
 * Публичные ссылки на отчёт по взаиморасчётам.
 *
 * Раньше ссылка лежала только в Redis с TTL на семь суток. Выглядело как
 * срок действия, но вело себя иначе: перезапуск кэша убивал все выданные
 * ссылки разом, отозвать конкретную было нечем, а списка выданных не
 * существовало — нельзя было даже ответить на вопрос «кому мы это
 * отправляли».
 *
 * Теперь ссылка — запись в базе. Срок честный, отзыв возможен, видно кому
 * отправляли и открывали ли вообще.
 */
@Injectable()
export class SharedReportLinkService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) {}

    /** Выдать ссылку. Прежние на того же контрагента остаются жить. */
    async create(
        companyId: string,
        userId: string,
        data: { counterpartyId: string; ourRole: string; sentToEmail?: string },
    ) {
        const [company, counterparty] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
            this.prisma.company.findUnique({ where: { id: data.counterpartyId }, select: { name: true } }),
        ]);
        if (!company) throw new NotFoundException('Организация не найдена');
        if (!counterparty) throw new NotFoundException('Контрагент не найден');

        const expiresAt = new Date(Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
        const link = await this.prisma.sharedReportLink.create({
            data: {
                companyId,
                counterpartyId: data.counterpartyId,
                ourRole: data.ourRole,
                expiresAt,
                sentToEmail: data.sentToEmail?.trim() || null,
                createdById: userId,
            },
            select: { id: true, token: true, expiresAt: true },
        });

        return { ...link, shareUrl: this.urlFor(link.token) };
    }

    /**
     * Разобрать токен из публичного запроса.
     *
     * Срок и отзыв проверяются здесь, в одном месте: любой публичный
     * эндпоинт обязан ходить через него, иначе просроченная ссылка где-то
     * продолжит работать.
     */
    async resolve(token: string): Promise<ResolvedShareLink> {
        const link = await this.prisma.sharedReportLink.findUnique({
            where: { token },
            select: {
                id: true,
                companyId: true,
                counterpartyId: true,
                ourRole: true,
                expiresAt: true,
                revokedAt: true,
                company: { select: { name: true } },
                counterparty: { select: { name: true } },
            },
        });

        // Отсутствующая, отозванная и просроченная ссылка отвечают
        // одинаково: по ответу нельзя понять, существовала ли она вообще.
        if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now()) {
            throw new NotFoundException('Ссылка недействительна или истёк срок действия');
        }

        return {
            id: link.id,
            companyId: link.companyId,
            companyName: link.company.name,
            counterpartyId: link.counterpartyId,
            counterpartyName: link.counterparty.name,
            ourRole: link.ourRole,
            expiresAt: link.expiresAt,
        };
    }

    /** Отметить просмотр. Сбой счётчика не должен ломать выдачу отчёта. */
    async trackView(linkId: string) {
        try {
            await this.prisma.sharedReportLink.update({
                where: { id: linkId },
                data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
            });
        } catch {
            // Счётчик — вспомогательный, отчёт важнее.
        }
    }

    /** Выданные ссылки компании: что живо, что истекло, что открывали. */
    async list(companyId: string, counterpartyId?: string) {
        const links = await this.prisma.sharedReportLink.findMany({
            where: { companyId, ...(counterpartyId ? { counterpartyId } : {}) },
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: {
                id: true,
                token: true,
                ourRole: true,
                expiresAt: true,
                revokedAt: true,
                sentToEmail: true,
                viewCount: true,
                lastViewedAt: true,
                createdAt: true,
                counterparty: { select: { id: true, name: true } },
                createdBy: { select: { firstName: true, lastName: true } },
            },
        });

        const now = Date.now();
        return links.map((link) => ({
            ...link,
            shareUrl: this.urlFor(link.token),
            status: link.revokedAt
                ? 'REVOKED'
                : link.expiresAt.getTime() <= now
                    ? 'EXPIRED'
                    : 'ACTIVE',
        }));
    }

    /** Отозвать ссылку досрочно. */
    async revoke(companyId: string, id: string) {
        const link = await this.prisma.sharedReportLink.findUnique({
            where: { id },
            select: { companyId: true, revokedAt: true },
        });
        if (!link) throw new NotFoundException('Ссылка не найдена');
        if (link.companyId !== companyId) {
            throw new ForbiddenException('Ссылка выдана другой организацией');
        }
        if (link.revokedAt) return { id, revokedAt: link.revokedAt };

        const updated = await this.prisma.sharedReportLink.update({
            where: { id },
            data: { revokedAt: new Date() },
            select: { id: true, revokedAt: true },
        });
        return updated;
    }

    private urlFor(token: string): string {
        const base = (this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
        return `${base}/shared/report/${token}`;
    }
}
