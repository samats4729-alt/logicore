import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOWED_TRANSITIONS, OrdersService } from '../orders/orders.service';
import { OrderDeleteService } from '../orders/order-delete.service';
import { GIVEN_STATUSES, givenItems } from '../exchange/fuel.service';

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v));
const fio = (u?: { lastName: string | null; firstName: string | null } | null) => (u ? [u.lastName, u.firstName].filter(Boolean).join(' ') || null : null);

const COMPANY = { select: { id: true, name: true, bin: true, isExternal: true } } as const;

const DOC_TYPE: Record<string, string> = {
    PAYMENT_INVOICE: 'Счёт на оплату', SERVICE_ACT: 'Акт выполненных работ', RECONCILIATION_ACT: 'Акт сверки', CORRECTION: 'Корректировка',
};
const PAYOUT_STATUS: Record<string, string> = {
    REQUESTED: 'запрошена, ждёт парка', EXPORTED: 'выгружена в 1С, парк платит', PAID: 'выплачена', REJECTED: 'отклонена',
};

/** Деньги и документы заявки — то, по чему расписываются причины. */
interface MoneyView {
    payments: { direction: string; date: Date; amount: number; share: number | null; company: string | null; counterparty: string | null; in1C: boolean }[];
    incomes: { date: Date; amount: number; company: string; description: string }[];
    expenses: { date: Date; amount: number; company: string; description: string }[];
    documents: { type: string; number: string; date: Date; total: number; company: string | null; status: string; in1C: boolean }[];
    payroll: { who: string; amount: number; note: string; company: string | null }[];
    payouts: { driver: string | null; park: string; amount: number; status: string; statusText: string }[];
    given: { kind: 'FUEL' | 'ADVANCE'; amount: number; method: string; date: Date; byRequest: boolean }[];
    fuelReceipts: { amount: number; status: string; date: Date }[];
}

/** Что мешает сделать с заявкой и что сделать, чтобы стало можно. */
export interface Blocker {
    what: string;
    /** Конкретные записи: «Платёж 12.10.2026 на 50 000 ₸ — ТОО «Парк»». */
    items: string[];
    /** Что сделать и где — словами. */
    fix: string;
}

/**
 * Заявка глазами администратора платформы (владелец, 28.10.2026): найти
 * любую заявку, увидеть все её данные и деньги, понять, почему её нельзя
 * отменить или удалить, и что для этого сделать.
 *
 * Правила — те же, что у компаний: удаление — `OrderDeleteService` (без
 * денег и учётных документов), отмена — `ALLOWED_TRANSITIONS`. Здесь они
 * только расписаны по записям, с подсказкой, где запись убрать.
 * Администратору отмену завершённой заявки согласовывать не нужно — это
 * учтено в `OrdersService.updateStatus`.
 */
@Injectable()
export class AdminOrdersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly orders: OrdersService,
        private readonly orderDelete: OrderDeleteService,
    ) {}

    /** Поиск по всей платформе: номер, компании сторон, водитель, госномер, город, груз. */
    async search(query?: string, limit = 50) {
        const q = query?.trim();
        const like = (field: string) => ({ [field]: { contains: q, mode: 'insensitive' as const } });
        const company = (rel: string) => ({ [rel]: { OR: [like('name'), like('bin')] } });
        const rows = await this.prisma.order.findMany({
            where: q ? {
                OR: [
                    like('orderNumber'), like('cargoDescription'), like('assignedDriverName'), like('assignedDriverPlate'),
                    company('customerCompany'), company('forwarder'), company('subForwarder'), company('partner'),
                    { routePoints: { some: { location: { OR: [like('city'), like('address'), like('name')] } } } },
                ],
            } : {},
            select: {
                id: true, orderNumber: true, status: true, createdAt: true, completedAt: true, customerPrice: true, driverCost: true,
                assignedDriverName: true, assignedDriverPlate: true,
                customerCompany: COMPANY, forwarder: COMPANY, partner: COMPANY,
                routePoints: { select: { pointType: true, location: { select: { city: true, address: true } } }, orderBy: { sequence: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
            take: Math.min(Math.max(limit, 1), 200),
        });
        return rows.map((r) => ({
            id: r.id, orderNumber: r.orderNumber, status: r.status, createdAt: r.createdAt, completedAt: r.completedAt,
            customerPrice: num(r.customerPrice), driverCost: num(r.driverCost),
            route: routeOf(r.routePoints), driver: r.assignedDriverName, plate: r.assignedDriverPlate,
            customer: r.customerCompany?.name ?? null, forwarder: r.forwarder?.name ?? null, carrier: r.partner?.name ?? null,
        }));
    }

    async details(id: string) {
        const o = await this.prisma.order.findUnique({
            where: { id },
            select: {
                id: true, orderNumber: true, status: true, createdAt: true, completedAt: true,
                cargoDescription: true, cargoWeight: true, customerPrice: true, driverCost: true, subForwarderPrice: true,
                customerCompanyId: true, forwarderId: true, subForwarderId: true, partnerId: true,
                customerCompany: COMPANY, forwarder: COMPANY, subForwarder: COMPANY, partner: COMPANY,
                assignedDriverName: true, assignedDriverPhone: true, assignedDriverPlate: true, assignedDriverTrailer: true,
                driver: { select: { firstName: true, lastName: true, phone: true } },
                routePoints: {
                    select: { pointType: true, expectedDate: true, location: { select: { name: true, city: true, address: true } } },
                    orderBy: { sequence: 'asc' },
                },
                statusHistory: { select: { status: true, changedAt: true, comment: true }, orderBy: { changedAt: 'desc' }, take: 30 },
            },
        });
        if (!o) throw new NotFoundException('Заявка не найдена');

        const [payments, shares, incomes, expenses, docLinks, docLines, accruals, bonuses, payoutItems, documentsCount, fuelIssues, givenLinks, fuelReceipts] = await Promise.all([
            this.prisma.payment.findMany({ where: { orderId: id }, select: PAYMENT }),
            this.prisma.paymentOrderShare.findMany({ where: { orderId: id }, select: { amount: true, payment: { select: PAYMENT } } }),
            this.prisma.income.findMany({ where: { orderId: id }, select: { id: true, companyId: true, date: true, amount: true, description: true } }),
            this.prisma.expense.findMany({ where: { orderId: id }, select: { id: true, companyId: true, date: true, amount: true, description: true } }),
            this.prisma.accountingDocumentOrder.findMany({ where: { orderId: id }, select: { document: { select: DOCUMENT } } }),
            this.prisma.accountingDocumentLine.findMany({ where: { orderId: id }, select: { document: { select: DOCUMENT } } }),
            this.prisma.payrollAccrual.findMany({ where: { orderId: id }, select: { id: true, companyId: true, userId: true, amount: true, periodMonth: true, kind: true } }),
            this.prisma.bonus.findMany({ where: { orderId: id }, select: { id: true, amount: true, status: true, user: { select: { firstName: true, lastName: true, companyId: true } } } }),
            this.prisma.driverPayoutItem.findMany({
                where: { orderId: id },
                select: {
                    toPay: true, net: true,
                    payout: { select: { status: true, requestedAt: true, paidAt: true, park: { select: { name: true } }, driver: { select: { lastName: true, firstName: true } } } },
                },
            }),
            this.prisma.document.count({ where: { orderId: id } }),
            // Выдачи водителю парка (топливо, предоплата) и чеки на топливо — тоже деньги рейса.
            this.prisma.exchangeFuelIssue.findMany({ where: { orderId: id }, select: { id: true, amount: true, method: true, note: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
            this.prisma.driverAdvanceRequest.findMany({ where: { orderId: id, status: { in: GIVEN_STATUSES }, fuelIssueId: { not: null } }, select: { fuelIssueId: true, kind: true, status: true } }),
            this.prisma.exchangeFuelReceipt.findMany({ where: { orderId: id, status: { not: 'REJECTED' } }, select: { amount: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
        ]);

        // Названия компаний и имена сотрудников — одним запросом на всё.
        const companyIds = new Set<string>([...incomes, ...expenses, ...accruals].map((r) => r.companyId));
        const userIds = accruals.map((a) => a.userId);
        const [companies, users] = await Promise.all([
            this.prisma.company.findMany({ where: { id: { in: [...companyIds] } }, select: { id: true, name: true } }),
            this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }),
        ]);
        const companyName = (cid: string) => companies.find((c) => c.id === cid)?.name ?? 'компания';
        const userName = (uid: string) => fio(users.find((u) => u.id === uid)) ?? 'сотрудник';

        const allPayments = new Map<string, PaymentRow & { share?: number }>();
        for (const p of payments) allPayments.set(p.id, p);
        for (const s of shares) allPayments.set(s.payment.id, { ...s.payment, share: Number(s.amount) });
        const docs = new Map<string, DocumentRow>();
        for (const d of [...docLinks, ...docLines]) docs.set(d.document.id, d.document);
        const sentTo1C = new Set((await this.prisma.oneCObjectMap.findMany({
            where: { localId: { in: [...docs.keys(), ...allPayments.keys()] }, sentNo: { not: null } }, select: { localId: true },
        })).map((m) => m.localId));

        const money = {
            payments: [...allPayments.values()].map((p) => ({
                id: p.id, date: p.date, amount: Number(p.amount), share: p.share ?? null, direction: p.direction,
                company: p.company?.name ?? null, counterparty: p.counterparty?.name ?? null, in1C: sentTo1C.has(p.id),
            })),
            incomes: incomes.map((r) => ({ id: r.id, date: r.date, amount: Number(r.amount), description: r.description, company: companyName(r.companyId) })),
            expenses: expenses.map((r) => ({ id: r.id, date: r.date, amount: Number(r.amount), description: r.description, company: companyName(r.companyId) })),
            documents: [...docs.values()].map((d) => ({
                id: d.id, type: DOC_TYPE[d.type] ?? d.type, number: d.number, date: d.documentDate, total: Number(d.total), status: d.status,
                direction: d.direction, company: d.company?.name ?? null, counterparty: d.counterparty?.name ?? null, in1C: sentTo1C.has(d.id),
            })),
            payroll: [
                ...accruals.map((a) => ({ id: a.id, who: userName(a.userId), amount: Number(a.amount), note: `начисление за ${a.periodMonth}`, company: companyName(a.companyId) })),
                ...bonuses.map((b) => ({ id: b.id, who: fio(b.user) ?? 'сотрудник', amount: Number(b.amount), note: `бонус, ${b.status === 'PAID' ? 'выплачен' : 'не выплачен'}`, company: null })),
            ],
            payouts: payoutItems.map((p) => ({
                driver: fio(p.payout.driver), park: p.payout.park.name, amount: Number(p.toPay ?? p.net),
                status: p.payout.status, statusText: PAYOUT_STATUS[p.payout.status] ?? p.payout.status, requestedAt: p.payout.requestedAt, paidAt: p.payout.paidAt,
            })),
            given: givenItems(fuelIssues, givenLinks).map((g) => ({ kind: g.kind, amount: g.amount, method: g.method, date: g.createdAt, byRequest: g.byRequest })),
            fuelReceipts: fuelReceipts.map((r) => ({ amount: Number(r.amount), status: r.status, date: r.createdAt })),
        };

        const parties = [
            { role: 'Заказчик', company: o.customerCompany },
            { role: 'Экспедитор', company: o.forwarder },
            { role: 'Субэкспедитор', company: o.subForwarder },
            { role: 'Перевозчик / парк', company: o.partner },
        ].filter((p) => p.company).map((p) => ({ role: p.role, id: p.company!.id, name: p.company!.name, bin: p.company!.bin, registered: !p.company!.isExternal }));

        return {
            order: {
                id: o.id, orderNumber: o.orderNumber, status: o.status, createdAt: o.createdAt, completedAt: o.completedAt,
                cargo: [o.cargoDescription, o.cargoWeight ? `${o.cargoWeight} кг` : null].filter(Boolean).join(' · ') || null,
                customerPrice: num(o.customerPrice), subForwarderPrice: num(o.subForwarderPrice), driverCost: num(o.driverCost),
                driver: {
                    name: o.assignedDriverName || fio(o.driver), phone: o.assignedDriverPhone || o.driver?.phone || null,
                    plate: o.assignedDriverPlate, trailer: o.assignedDriverTrailer,
                },
                route: o.routePoints.map((p) => ({ type: p.pointType, date: p.expectedDate, place: [p.location.city, p.location.address || p.location.name].filter(Boolean).join(', ') })),
                filesCount: documentsCount,
            },
            parties,
            history: o.statusHistory,
            money,
            cancel: await this.cancelCheck(o),
            delete: this.deleteCheck(await this.orderDelete.blockers(id), money),
        };
    }

    /** Можно ли отменить: правило статусов, как у компаний; администратору согласование не нужно. */
    private async cancelCheck(o: { status: OrderStatus; customerCompanyId: string | null; forwarderId: string | null; partnerId: string | null; subForwarderId: string | null }) {
        if (o.status === OrderStatus.CANCELLED) return { companiesCan: false, adminCan: false, blockers: [] as Blocker[], note: 'Заявка уже отменена.' };
        const adminCan = (ALLOWED_TRANSITIONS[o.status] ?? []).includes(OrderStatus.CANCELLED);
        const blockers: Blocker[] = [];
        if (o.status === OrderStatus.COMPLETED) {
            const registered = await this.orders.getRegisteredParticipants(o);
            if (registered.length > 1) {
                const names = await this.prisma.company.findMany({ where: { id: { in: registered } }, select: { name: true } });
                blockers.push({
                    what: 'Заявка завершена, и в ней несколько компаний, зарегистрированных в LogiCore',
                    items: names.map((c) => c.name),
                    fix: 'Сами компании отменить её не могут: каждой нужно согласие другой, а кнопки согласования нет. Отменить может администратор — кнопкой «Отменить заявку» здесь.',
                });
            }
        }
        if (!adminCan) {
            blockers.push({ what: 'Из этого статуса отмена не предусмотрена', items: [], fix: 'Сначала переведите заявку в другой статус.' });
        }
        return { companiesCan: adminCan && blockers.length === 0, adminCan, blockers, note: null as string | null };
    }

    /** Что мешает удалить — по записям, с подсказкой, где каждую убрать. */
    private deleteCheck(why: string[], m: MoneyView): { can: boolean; blockers: Blocker[] } {
        const tg = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} ₸`;
        const day = (d: Date | string) => new Date(d).toLocaleDateString('ru-RU', { timeZone: 'Asia/Almaty' });
        const in1C = (x: { in1C: boolean }) => (x.in1C ? ' · ушёл в 1С' : '');
        const blockers: Blocker[] = [];
        if (why.includes('платежи')) {
            blockers.push({
                what: 'Платежи по заявке',
                items: m.payments.map((p) => `${p.direction === 'IN' ? 'Поступление' : 'Оплата'} ${day(p.date)} на ${tg(p.share ?? p.amount)} — ${p.company ?? 'компания'}${p.counterparty ? ` ↔ ${p.counterparty}` : ''}${in1C(p)}`),
                fix: 'Удалить платёж или отвязать его от заявки — в «Деньги → Платежи» той компании, которая его внесла. Платёж, ушедший в 1С, удалить и там.',
            });
        }
        if (why.includes('приходы или расходы')) {
            blockers.push({
                what: 'Приходы и расходы по заявке',
                items: [
                    ...m.incomes.map((r) => `Приход ${day(r.date)} на ${tg(r.amount)} — ${r.company}: ${r.description}`),
                    ...m.expenses.map((r) => `Расход ${day(r.date)} на ${tg(r.amount)} — ${r.company}: ${r.description}`),
                ],
                fix: 'Удалить запись в «Деньги → Приходы и расходы» той компании.',
            });
        }
        if (why.includes('счета или акты')) {
            blockers.push({
                what: 'Счета и акты по заявке',
                items: m.documents.map((d) => `${d.type} № ${d.number} от ${day(d.date)} на ${tg(d.total)} — ${d.company ?? 'компания'}${d.status === 'CANCELLED' ? ' · аннулирован' : ''}${in1C(d)}`),
                fix: 'Удалить документ (или убрать из него эту заявку) в «Бухгалтерия → Счета и акты» той компании. Если документ ушёл в 1С — удалить его и в 1С.',
            });
        }
        if (why.includes('начисления зарплаты')) {
            blockers.push({
                what: 'Начисления зарплаты менеджерам',
                items: m.payroll.map((p) => `${p.who}: ${tg(p.amount)} — ${p.note}${p.company ? ` (${p.company})` : ''}`),
                fix: 'Удалить начисление в «Зарплата» той компании за этот месяц.',
            });
        }
        if (why.includes('выплата водителю')) {
            blockers.push({
                what: 'Водитель запросил выплату за этот рейс',
                items: m.payouts.map((p) => `${p.driver ?? 'Водитель'} — ${tg(p.amount)}, ${p.statusText} (${p.park})`),
                fix: m.payouts.some((p) => p.status === 'PAID')
                    ? 'Выплата уже проведена — деньги водителю ушли. Удалять такую заявку нельзя, её можно только отменить.'
                    : 'Парку отклонить эту выплату в «Управление парком → Выплаты водителям» (кнопка «Отклонить»). После этого заявку можно удалить.',
            });
        }
        if (why.includes('выдачи водителю (топливо, предоплата)')) {
            blockers.push({
                what: 'Парк выдал водителю деньги по рейсу',
                items: m.given.map((g) => `${g.kind === 'ADVANCE' ? 'Предоплата' : 'Топливо'} ${tg(g.amount)} — ${day(g.date)}, ${g.method === 'STATION' ? 'на заправке' : 'переводом'}, ${g.byRequest ? 'по запросу водителя' : 'без запроса'}`),
                fix: 'Если записано по ошибке — парку убрать запись: «Рейсы водителей» → «Выдачи и чеки». Если деньги правда выданы — заявку не удалять, только отменить.',
            });
        }
        if (why.includes('чеки на топливо')) {
            blockers.push({
                what: 'Чеки на топливо по рейсу',
                items: m.fuelReceipts.map((r) => `Чек ${tg(r.amount)} — ${day(r.date)}, ${r.status === 'ACCEPTED' ? 'принят' : 'ждёт парка'}`),
                fix: 'Чек, пришедший по ошибке, парк отклоняет там же, в «Выдачи и чеки», с причиной.',
            });
        }
        return { can: why.length === 0, blockers };
    }
}

const PAYMENT = {
    id: true, date: true, amount: true, direction: true,
    company: { select: { name: true } }, counterparty: { select: { name: true } },
} satisfies Prisma.PaymentSelect;
type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT }>;

const DOCUMENT = {
    id: true, type: true, direction: true, status: true, number: true, documentDate: true, total: true,
    company: { select: { name: true } }, counterparty: { select: { name: true } },
} satisfies Prisma.AccountingDocumentSelect;
type DocumentRow = Prisma.AccountingDocumentGetPayload<{ select: typeof DOCUMENT }>;

function routeOf(points: { pointType: string; location: { city: string | null; address: string | null } }[]): string {
    const place = (p?: (typeof points)[number]) => p?.location.city || p?.location.address || '—';
    return `${place(points.find((p) => p.pointType !== 'DELIVERY'))} → ${place([...points].reverse().find((p) => p.pointType === 'DELIVERY'))}`;
}
