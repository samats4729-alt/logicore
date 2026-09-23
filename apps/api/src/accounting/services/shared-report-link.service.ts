import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/** Сколько живёт публичная ссылка на отчёт перевозчику. */
export const SHARE_LINK_TTL_DAYS = 7;

/**
 * Кому выдана ссылка.
 *
 * Перевозчику — под конкретную сверку: живёт неделю, показывает рейсы того,
 * кто её выдал, и по ней выставляют нам счёт. Заказчику — одна и навсегда,
 * со всеми нашими счетами к нему: он открывает её, когда собирается
 * платить, а не когда мы вспомнили о сверке.
 */
export const ВИД_ССЫЛКИ = { ПЕРЕВОЗЧИКУ: 'CARRIER', ЗАКАЗЧИКУ: 'CLIENT' } as const;
export type ShareLinkKind = (typeof ВИД_ССЫЛКИ)[keyof typeof ВИД_ССЫЛКИ];

export interface ResolvedShareLink {
    id: string;
    companyId: string;
    companyName: string;
    counterpartyId: string;
    counterpartyName: string;
    ourRole: string;
    kind: string;
    /** `null` — бессрочная. */
    expiresAt: Date | null;
    /** Кто выдал ссылку — по нему определяется, что за ней видно. */
    createdById: string;
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
     * Постоянная ссылка заказчику: одна на контрагента, всегда та же.
     *
     * Не «выдать ещё одну», а «дай ту, что есть». Заказчик кладёт адрес в
     * закладки и возвращается туда каждый раз, когда собирается платить;
     * новая ссылка на каждый запрос означала бы, что вчерашняя у него
     * протухла — то есть ровно ту работу руками, от которой уходим.
     *
     * Срока нет. Отзыв остаётся: отозванную заменяет новая, и старый адрес
     * перестаёт работать — на случай, если ссылка ушла не туда.
     */
    async ensureClientLink(companyId: string, userId: string, counterpartyId: string) {
        const counterparty = await this.prisma.company.findUnique({
            where: { id: counterpartyId },
            select: { id: true, name: true },
        });
        if (!counterparty) throw new NotFoundException('Контрагент не найден');

        const живая = await this.prisma.sharedReportLink.findFirst({
            where: {
                companyId,
                counterpartyId,
                kind: ВИД_ССЫЛКИ.ЗАКАЗЧИКУ,
                revokedAt: null,
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, token: true, createdAt: true, viewCount: true, lastViewedAt: true },
        });
        if (живая) {
            return {
                ...живая,
                counterpartyName: counterparty.name,
                shareUrl: this.clientUrlFor(живая.token),
                isNew: false,
            };
        }

        const созданная = await this.prisma.sharedReportLink.create({
            data: {
                companyId,
                counterpartyId,
                // Заказчику мы исполнитель: счета выставляем мы.
                ourRole: 'EXECUTOR',
                kind: ВИД_ССЫЛКИ.ЗАКАЗЧИКУ,
                expiresAt: null,
                createdById: userId,
            },
            select: { id: true, token: true, createdAt: true, viewCount: true, lastViewedAt: true },
        });
        return {
            ...созданная,
            counterpartyName: counterparty.name,
            shareUrl: this.clientUrlFor(созданная.token),
            isNew: true,
        };
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
                kind: true,
                expiresAt: true,
                revokedAt: true,
                createdById: true,
                company: { select: { name: true } },
                counterparty: { select: { name: true } },
            },
        });

        // Отсутствующая, отозванная и просроченная ссылка отвечают
        // одинаково: по ответу нельзя понять, существовала ли она вообще.
        if (!link || link.revokedAt || (link.expiresAt && link.expiresAt.getTime() <= Date.now())) {
            throw new NotFoundException('Ссылка недействительна или истёк срок действия');
        }

        return {
            id: link.id,
            companyId: link.companyId,
            companyName: link.company.name,
            counterpartyId: link.counterpartyId,
            counterpartyName: link.counterparty.name,
            ourRole: link.ourRole,
            kind: link.kind,
            expiresAt: link.expiresAt,
            // Кто выдал ссылку. Нужен на выдаче отчёта: ссылка показывает
            // ровно то, что видит отправитель, и у менеджера это только его
            // собственные сделки с этим контрагентом.
            createdById: link.createdById,
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
                kind: true,
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
            shareUrl: link.kind === ВИД_ССЫЛКИ.ЗАКАЗЧИКУ
                ? this.clientUrlFor(link.token)
                : this.urlFor(link.token),
            // Бессрочная ссылка не истекает: у неё нет даты, с которой
            // сравнивать. Живой она перестаёт быть только отзывом.
            status: link.revokedAt
                ? 'REVOKED'
                : link.expiresAt && link.expiresAt.getTime() <= now
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
        return `${this.base()}/shared/report/${token}`;
    }

    /** Ссылка заказчика ведёт на свою страницу: там счета, а не сверка. */
    private clientUrlFor(token: string): string {
        return `${this.base()}/shared/client/${token}`;
    }

    private base(): string {
        return (this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
    }
}
