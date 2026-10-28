import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type Named = { id: string; name: string };

/** Запрос на удаление — как его видит сторона заявки. */
export interface DeleteRequestView {
    requestedBy: Named;
    reason: string | null;
    createdAt: Date;
    /** Кто ещё не согласился. */
    waitingFor: Named[];
    approved: Named[];
    /** Запрос отправила наша компания — можем отозвать. */
    mine: boolean;
    /** Ждут нашего ответа — можем согласиться или отказать. */
    canAnswer: boolean;
    /** Запрос отклонён — видит только отправитель, пока не скроет. */
    declined: { by: Named; reason: string | null; at: Date } | null;
}

export type DeleteResult =
    | { ok: true; orderNumber: string; deleted: true }
    | { ok: true; orderNumber: string; deleted: false; waitingFor: string[] };

const ORDER_SIDES = {
    id: true, orderNumber: true, status: true,
    customerCompanyId: true, forwarderId: true, partnerId: true, subForwarderId: true,
} as const;
type OrderSides = { id: string; orderNumber: string; status: OrderStatus; customerCompanyId: string | null; forwarderId: string | null; partnerId: string | null; subForwarderId: string | null };

/**
 * Удалить заявку (задачи шефа, A12: «заявку не удалить ни из кабинета
 * компании, ни из кабинета парка»).
 *
 * Удаляется только заявка, по которой ещё не было денег и учётных
 * документов: платежей, долей платежа, приходов и расходов, счетов и актов,
 * начислений зарплаты, бонусов, выплат водителю, выдач водителю парка
 * (топливо, предоплата) и чеков на топливо. Такую заявку можно
 * отменить — удаление сбило бы взаиморасчёты, отчёты и зарплату задним
 * числом. Ошибочную или тестовую заявку без денег удаляет её хозяин:
 * экспедитор, а если экспедитора нет — заказчик, который её завёл.
 *
 * Файлы рейса (накладные, фото) и его история уходят вместе с заявкой;
 * в журнале действий остаётся запись, кто и когда удалил.
 *
 * Если в заявке есть другая компания, зарегистрированная в LogiCore
 * (заказчик, экспедитор, перевозчик, парк водителя), одна сторона её не
 * удаляет (владелец, 29.10.2026: «удалилась без согласия заказчика — надо,
 * чтобы отправлялось подтверждение»). Удаление становится запросом:
 * остальные стороны видят его в заявке и в уведомлениях, соглашаются или
 * отказывают. Заявка удаляется, когда согласились все. Запросить может
 * любая зарегистрированная сторона — и та, что заявку не вела: с согласия
 * хозяина заявки это законно.
 */
@Injectable()
export class OrderDeleteService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationsService,
    ) {}

    /** Что мешает удалить — словами; пусто — можно. */
    async blockers(orderId: string): Promise<string[]> {
        const [payments, shares, incomes, expenses, operations, docs, lines, bonuses, accruals, payouts, fuelIssues, fuelReceipts] = await Promise.all([
            this.prisma.payment.count({ where: { orderId } }),
            this.prisma.paymentOrderShare.count({ where: { orderId } }),
            this.prisma.income.count({ where: { orderId } }),
            this.prisma.expense.count({ where: { orderId } }),
            this.prisma.financeOperation.count({ where: { orderId } }),
            this.prisma.accountingDocumentOrder.count({ where: { orderId } }),
            this.prisma.accountingDocumentLine.count({ where: { orderId } }),
            this.prisma.bonus.count({ where: { orderId } }),
            this.prisma.payrollAccrual.count({ where: { orderId } }),
            this.prisma.driverPayoutItem.count({ where: { orderId } }),
            // Парк выдал водителю топливо или предоплату, водитель прислал чеки —
            // это тоже деньги: удаление стёрло бы их из расчёта с водителем.
            this.prisma.exchangeFuelIssue.count({ where: { orderId } }),
            this.prisma.exchangeFuelReceipt.count({ where: { orderId, status: { not: 'REJECTED' } } }),
        ]);
        const why: string[] = [];
        if (payments + shares) why.push('платежи');
        if (incomes + expenses + operations) why.push('приходы или расходы');
        if (docs + lines) why.push('счета или акты');
        if (bonuses + accruals) why.push('начисления зарплаты');
        if (payouts) why.push('выплата водителю');
        if (fuelIssues) why.push('выдачи водителю (топливо, предоплата)');
        if (fuelReceipts) why.push('чеки на топливо');
        return why;
    }

    /** Компании заявки, зарегистрированные в LogiCore (не записи справочника). */
    async sides(order: OrderSides): Promise<string[]> {
        const ids = [...new Set([order.customerCompanyId, order.forwarderId, order.partnerId, order.subForwarderId].filter((x): x is string => !!x))];
        if (!ids.length) return [];
        const companies = await this.prisma.company.findMany({ where: { id: { in: ids }, isExternal: false }, select: { id: true } });
        return companies.map((c) => c.id);
    }

    /** Для окна «Удалить заявку»: что мешает, чьё согласие нужно, есть ли уже запрос. */
    async check(orderId: string, companyId: string | null | undefined, role: string) {
        const order = await this.findOrder(orderId);
        const sides = await this.sides(order);
        if (role !== 'ADMIN' && !(companyId && sides.includes(companyId))) throw new ForbiddenException('Нет доступа к заявке');
        const blockers = await this.blockers(orderId);
        const others = role === 'ADMIN' ? [] : sides.filter((id) => id !== companyId);
        return {
            canDelete: blockers.length === 0,
            blockers,
            needsConsent: (await this.names(others)).map((c) => c.name),
            request: await this.view(orderId, companyId, role),
        };
    }

    async delete(orderId: string, companyId: string | null | undefined, role: string, userId?: string, reason?: string): Promise<DeleteResult> {
        const order = await this.findOrder(orderId);
        const sides = await this.sides(order);
        const isAdmin = role === 'ADMIN';
        const owner = order.forwarderId ? order.forwarderId === companyId : order.customerCompanyId === companyId;
        const isSide = !!companyId && sides.includes(companyId);
        if (!isAdmin && !owner && !isSide) {
            throw new ForbiddenException('Удалить заявку может только тот, кто её ведёт, — экспедитор этой заявки');
        }
        const why = await this.blockers(orderId);
        if (why.length) {
            throw new BadRequestException(
                `По заявке уже есть ${why.join(', ')} — удалить её нельзя, иначе собьются расчёты. Заявку можно отменить.`,
            );
        }

        const others = isAdmin ? [] : sides.filter((id) => id !== companyId);
        if (!others.length) {
            if (!isAdmin && !owner) throw new ForbiddenException('Удалить заявку может только тот, кто её ведёт, — экспедитор этой заявки');
            await this.remove(orderId);
            return { ok: true, orderNumber: order.orderNumber, deleted: true };
        }

        // Другая сторона в LogiCore — без её согласия не удаляем.
        const existing = await this.prisma.orderDeleteRequest.findUnique({ where: { orderId } });
        // Прошлый запрос отклонили — новый его заменяет.
        if (existing?.declinedAt) await this.prisma.orderDeleteRequest.delete({ where: { id: existing.id } });
        else if (existing) {
            throw new BadRequestException(existing.requestedByCompanyId === companyId
                ? 'Запрос на удаление уже отправлен — ожидается ответ другой стороны'
                : 'По заявке уже есть запрос на удаление от другой стороны — ответьте на него в карточке заявки');
        }
        const note = reason?.trim() || null;
        await this.prisma.orderDeleteRequest.create({
            data: { orderId, requestedByCompanyId: companyId as string, requestedByUserId: userId ?? null, reason: note },
        });
        const me = await this.companyName(companyId as string);
        await this.history(order, userId, `${me}: запрос на удаление заявки${note ? `. Причина: ${note}` : ''}`);
        await this.notify(
            others,
            'Запрос на удаление заявки',
            `Запрос на удаление заявки №${order.orderNumber} от ${me}.${note ? ` Причина: ${note}.` : ''} Подтвердите или отклоните запрос в карточке заявки.`,
            orderId,
        );
        return { ok: true, orderNumber: order.orderNumber, deleted: false, waitingFor: (await this.names(others)).map((c) => c.name) };
    }

    /** Запрос на удаление глазами стороны заявки; нет запроса — null. */
    async view(orderId: string, companyId: string | null | undefined, role: string): Promise<DeleteRequestView | null> {
        const request = await this.prisma.orderDeleteRequest.findUnique({ where: { orderId } });
        if (!request) return null;
        const order = await this.findOrder(orderId);
        const sides = await this.sides(order);
        if (role !== 'ADMIN' && !(companyId && sides.includes(companyId))) return null;
        const mine = request.requestedByCompanyId === companyId;
        // Отклонённый запрос — дело отправителя: остальным показывать нечего.
        if (request.declinedAt && !mine) return null;
        const others = sides.filter((id) => id !== request.requestedByCompanyId);
        const named = await this.names([request.requestedByCompanyId, ...others, ...(request.declinedByCompanyId ? [request.declinedByCompanyId] : [])]);
        const name = (id: string) => named.find((c) => c.id === id) ?? { id, name: 'компания' };
        if (request.declinedAt) {
            return {
                requestedBy: name(request.requestedByCompanyId), reason: request.reason, createdAt: request.createdAt,
                waitingFor: [], approved: [], mine, canAnswer: false,
                declined: { by: name(request.declinedByCompanyId ?? ''), reason: request.declineReason, at: request.declinedAt },
            };
        }
        return {
            requestedBy: name(request.requestedByCompanyId),
            reason: request.reason,
            createdAt: request.createdAt,
            waitingFor: others.filter((id) => !request.approvedCompanyIds.includes(id)).map(name),
            approved: others.filter((id) => request.approvedCompanyIds.includes(id)).map(name),
            mine,
            canAnswer: !!companyId && others.includes(companyId) && !request.approvedCompanyIds.includes(companyId),
            declined: null,
        };
    }

    /** Согласиться удалить. Согласились все — заявка удаляется. */
    async approve(orderId: string, companyId: string | null | undefined, userId?: string): Promise<DeleteResult & { requestedById: string }> {
        const { request, order, others } = await this.answering(orderId, companyId);
        const approved = [...new Set([...request.approvedCompanyIds, companyId as string])];
        const me = await this.companyName(companyId as string);
        if (!others.every((id) => approved.includes(id))) {
            await this.prisma.orderDeleteRequest.update({ where: { id: request.id }, data: { approvedCompanyIds: approved } });
            await this.history(order, userId, `${me}: согласие на удаление заявки`);
            const waiting = await this.names(others.filter((id) => !approved.includes(id)));
            return { ok: true, orderNumber: order.orderNumber, deleted: false, waitingFor: waiting.map((c) => c.name), requestedById: request.requestedByCompanyId };
        }
        // Пока ждали ответа, по заявке могли пройти деньги — тогда удалять нельзя.
        const why = await this.blockers(orderId);
        if (why.length) {
            await this.prisma.orderDeleteRequest.delete({ where: { id: request.id } });
            throw new BadRequestException(`По заявке уже есть ${why.join(', ')} — удалить её нельзя, можно только отменить. Запрос на удаление закрыт.`);
        }
        await this.remove(orderId);
        await this.notify([request.requestedByCompanyId], 'Заявка удалена', `Заявка №${order.orderNumber} удалена с согласия ${me}.`, null);
        return { ok: true, orderNumber: order.orderNumber, deleted: true, requestedById: request.requestedByCompanyId };
    }

    /** Отклонить: заявка остаётся, отправитель видит отказ и причину, пока не скроет. */
    async decline(orderId: string, companyId: string | null | undefined, userId?: string, reason?: string) {
        const { request, order } = await this.answering(orderId, companyId);
        const note = reason?.trim() || null;
        await this.prisma.orderDeleteRequest.update({
            where: { id: request.id },
            data: { declinedByCompanyId: companyId as string, declineReason: note, declinedAt: new Date() },
        });
        const me = await this.companyName(companyId as string);
        await this.history(order, userId, `${me}: запрос на удаление отклонён${note ? `. Причина: ${note}` : ''}`);
        await this.notify(
            [request.requestedByCompanyId],
            'Запрос на удаление отклонён',
            `${me}: запрос на удаление заявки №${order.orderNumber} отклонён.${note ? ` Причина: ${note}.` : ''}`,
            orderId,
        );
        return { ok: true, orderNumber: order.orderNumber };
    }

    /** Отозвать свой запрос; у отклонённого — скрыть отказ. */
    async withdraw(orderId: string, companyId: string | null | undefined, role: string, userId?: string) {
        const request = await this.prisma.orderDeleteRequest.findUnique({ where: { orderId } });
        if (!request) throw new NotFoundException('Запроса на удаление нет — его отозвали или на него уже ответили');
        if (role !== 'ADMIN' && request.requestedByCompanyId !== companyId) {
            throw new ForbiddenException('Отозвать запрос может только компания, которая его отправила');
        }
        const order = await this.findOrder(orderId);
        await this.prisma.orderDeleteRequest.delete({ where: { id: request.id } });
        if (!request.declinedAt) await this.history(order, userId, 'Запрос на удаление заявки отозван');
        return { ok: true, orderNumber: order.orderNumber };
    }

    private async answering(orderId: string, companyId: string | null | undefined) {
        const request = await this.prisma.orderDeleteRequest.findUnique({ where: { orderId } });
        if (!request || request.declinedAt) throw new NotFoundException('Запроса на удаление нет — его отозвали или на него уже ответили');
        const order = await this.findOrder(orderId);
        const others = (await this.sides(order)).filter((id) => id !== request.requestedByCompanyId);
        if (!companyId || !others.includes(companyId)) {
            throw new ForbiddenException('Ответить на запрос может только другая сторона заявки');
        }
        return { request, order, others };
    }

    private async findOrder(orderId: string): Promise<OrderSides> {
        const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: ORDER_SIDES });
        if (!order) throw new NotFoundException('Заявка не найдена');
        return order;
    }

    private async remove(orderId: string) {
        await this.prisma.$transaction([
            // У этих связей нет каскадного удаления — убираем руками.
            this.prisma.document.deleteMany({ where: { orderId } }),
            this.prisma.gpsPoint.deleteMany({ where: { orderId } }),
            this.prisma.warehouseQueueItem.deleteMany({ where: { orderId } }),
            this.prisma.order.delete({ where: { id: orderId } }),
        ]);
    }

    private async names(ids: string[]): Promise<Named[]> {
        if (!ids.length) return [];
        const rows = await this.prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
        return ids.map((id) => rows.find((r) => r.id === id) ?? { id, name: 'компания' });
    }

    private async companyName(id: string): Promise<string> {
        return (await this.names([id]))[0].name;
    }

    /** Запись в историю заявки — её видят все стороны. */
    private async history(order: OrderSides, userId: string | undefined, comment: string) {
        await this.prisma.orderStatusHistory.create({ data: { orderId: order.id, status: order.status, comment, changedById: userId ?? null } });
    }

    private async notify(companyIds: string[], title: string, body: string, orderId: string | null) {
        try {
            for (const companyId of companyIds) {
                await this.notifications.notifyCompany(companyId, { title, body, data: { type: 'ORDER_DELETE_REQUEST', ...(orderId ? { orderId } : {}) } });
            }
        } catch (err) {
            console.warn('Delete request notification failed:', err);
        }
    }
}
