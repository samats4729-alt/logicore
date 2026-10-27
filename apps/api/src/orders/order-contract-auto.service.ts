import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toNum } from '../common/utils/money';
import { OrderDocumentsService } from './order-documents.service';

export type AutoContractResult = 'SENT' | 'NOT_SENT' | 'SKIPPED';

/** Кто запустил — его имя встанет в истории рейса. */
interface Actor { sub?: string; id?: string; firstName?: string; lastName?: string; role?: string }

/**
 * Договор-заявка перевозчику — сама, по каждой сделке (задачи шефа, A14).
 *
 * Включается галочкой в настройках компании. Как только у рейса появился
 * перевозчик и его ставка, система формирует договор-заявку, проводит её
 * и отправляет: в кабинет перевозчика, если он на платформе, иначе на
 * почту из его карточки.
 *
 * Проводится без бухгалтера — это и есть смысл галочки, о чём в настройке
 * сказано прямо. Перевозчику, которому договор уже оформлен, второй не
 * шлём: правки (другой водитель, другая ставка) идут, как и раньше,
 * кнопкой «Исправить». Сменился перевозчик — новому уходит свой.
 *
 * Отправить не вышло (нет ни кабинета, ни почты) — документ остаётся
 * проведённым, в истории рейса пишется причина, и его отправляют руками.
 * Сама сделка от этого не ломается: назначение перевозчика уже сохранено.
 */
@Injectable()
export class OrderContractAutoService {
    private readonly logger = new Logger(OrderContractAutoService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly documents: OrderDocumentsService,
        private readonly audit: AuditService,
    ) {}

    /** Не ждём: PDF и письмо не должны задерживать ответ на назначение. */
    schedule(orderId: string, companyId: string | null | undefined, actor: Actor) {
        void this.run(orderId, companyId, actor).catch((e) => {
            this.logger.error(`Договор-заявка по рейсу ${orderId} не сформирована: ${e?.message ?? e}`);
        });
    }

    async run(orderId: string, companyId: string | null | undefined, actor: Actor): Promise<AutoContractResult> {
        if (!companyId) return 'SKIPPED';
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { autoContractRequest: true },
        });
        if (!company?.autoContractRequest) return 'SKIPPED';

        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { status: true, subForwarderId: true, partnerId: true, driverCost: true, subForwarderPrice: true },
        });
        // Черновик — ещё не сделка; закрытый или отменённый — уже не нужна.
        if (!order || ['DRAFT', 'CANCELLED', 'COMPLETED'].includes(order.status)) return 'SKIPPED';
        const carrierId = [order.subForwarderId, order.partnerId].find((id) => id && id !== companyId);
        // Без ставки в договоре стоял бы ноль — такой отправлять нельзя.
        if (!carrierId || !(toNum(order.driverCost ?? order.subForwarderPrice ?? 0) > 0)) return 'SKIPPED';

        const last = await this.prisma.orderDocument.findFirst({
            where: { orderId, companyId, kind: 'CONTRACT' },
            orderBy: { version: 'desc' },
            select: { recipientCounterpartyId: true },
        });
        if (last?.recipientCounterpartyId === carrierId) return 'SKIPPED';

        const userId = actor.sub ?? actor.id ?? '';
        const document = await this.documents.form('CONTRACT', orderId, companyId, userId);
        if (document.status === 'DRAFT') await this.documents.post(document.id, companyId, userId);

        try {
            const sent = await this.documents.send(document.id, companyId, userId);
            await this.audit.log({
                companyId, user: actor, action: 'CREATE', entity: 'order_document', entityId: document.id, orderId,
                entityLabel: `Договор-заявка, версия ${document.version}, отправлена автоматически: ${sent.sentTo}`,
            });
            return 'SENT';
        } catch (e: any) {
            const why = e?.response?.message ?? e?.message ?? 'ошибка отправки';
            await this.audit.log({
                companyId, user: actor, action: 'CREATE', entity: 'order_document', entityId: document.id, orderId,
                entityLabel: `Договор-заявка, версия ${document.version}, сформирована автоматически, но не отправлена: ${why}`,
            });
            return 'NOT_SENT';
        }
    }
}
