import { AccountingDocumentDirection, DocumentType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { managerOrdersFilter } from '../common/manager-orders';

/**
 * Весть о документе для колокольчика (задачи шефа, C5/H8, H7).
 *
 * Колокольчик знал только смены статусов. Что водитель прислал фото ТТН,
 * что перевозчик выставил счёт или что нам оплатили счёт, узнавали, только
 * открыв нужный раздел. Здесь — эти три события одной лентой.
 */
export interface DocumentNotice {
    id: string;
    kind: 'TTN' | 'INCOMING_INVOICE' | 'INVOICE_PAID';
    title: string;
    text: string;
    at: string;
    href: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** Деньги видят те же, кому открыт журнал счетов. */
const MONEY_ROLES: string[] = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT];

const amount = (value: Prisma.Decimal | number | null, currency: string | null) =>
    `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${!currency || currency === 'KZT' ? '₸' : currency}`;

export async function documentNotices(
    prisma: PrismaService,
    companyId: string,
    viewer: { role?: string | null; userId?: string | null },
    now = new Date(),
): Promise<DocumentNotice[]> {
    const notices: DocumentNotice[] = [];

    // ТТН по нашим рейсам — кроме тех, что приложил сам смотрящий. Менеджер,
    // который видит только свои заявки, и здесь видит только их.
    const свои = await managerOrdersFilter(prisma, { companyId, role: viewer.role, userId: viewer.userId });
    const ttn = await prisma.document.findMany({
        where: {
            type: DocumentType.TTN,
            createdAt: { gte: new Date(now.getTime() - 7 * DAY) },
            ...(viewer.userId ? { NOT: { uploadedById: viewer.userId } } : {}),
            order: {
                AND: [
                    {
                        OR: [
                            { customerCompanyId: companyId },
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { subForwarderId: companyId },
                            { responsibleManager: { companyId } },
                        ],
                    },
                    ...(свои ? [свои] : []),
                ],
            },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
            id: true, createdAt: true,
            order: { select: { id: true, orderNumber: true } },
            uploadedBy: { select: { role: true } },
        },
    });
    for (const doc of ttn) {
        if (!doc.order) continue;
        notices.push({
            id: `ttn-${doc.id}`,
            kind: 'TTN',
            title: `ТТН по заявке ${doc.order.orderNumber}`,
            text: doc.uploadedBy?.role === UserRole.DRIVER || !doc.uploadedBy
                ? 'Водитель прислал фото накладной'
                : 'Приложена накладная',
            at: doc.createdAt.toISOString(),
            href: `/company/orders/${doc.order.id}?tab=documents`,
        });
    }

    if (viewer.role && MONEY_ROLES.includes(viewer.role)) {
        const since = new Date(now.getTime() - 14 * DAY);
        const [delivered, viaLink, paid] = await Promise.all([
            // Перевозчик с платформы отправил нам свой счёт или акт.
            prisma.accountingDocument.findMany({
                where: { recipientCompanyId: companyId, sentAt: { gte: since } },
                orderBy: { sentAt: 'desc' },
                take: 10,
                select: {
                    id: true, number: true, type: true, total: true, currency: true, sentAt: true,
                    company: { select: { name: true } },
                },
            }),
            // Перевозчик без кабинета выставил счёт по ссылке на отчёт.
            prisma.accountingDocument.findMany({
                where: {
                    companyId,
                    direction: AccountingDocumentDirection.INCOMING,
                    sharedReportLinkId: { not: null },
                    createdAt: { gte: since },
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    id: true, number: true, externalNumber: true, total: true, currency: true, createdAt: true,
                    counterparty: { select: { name: true } },
                },
            }),
            // Контрагент сообщил, что оплатил наш счёт или получил оплату.
            prisma.auditLog.findMany({
                where: {
                    entity: 'invoice_paid_notice',
                    createdAt: { gte: new Date(now.getTime() - 30 * DAY) },
                    details: { path: ['recipientCompanyId'], equals: companyId },
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: { id: true, createdAt: true, details: true },
            }),
        ]);

        for (const doc of delivered) {
            notices.push({
                id: `delivered-${doc.id}`,
                kind: 'INCOMING_INVOICE',
                title: `${doc.type === 'SERVICE_ACT' ? 'Акт' : 'Счёт'} № ${doc.number} от ${doc.company?.name ?? 'контрагента'}`,
                text: `На ${amount(doc.total, doc.currency)} — посмотрите и примите`,
                at: (doc.sentAt ?? new Date()).toISOString(),
                href: `/company/accounting/invoices/${doc.id}`,
            });
        }
        for (const doc of viaLink) {
            notices.push({
                id: `link-${doc.id}`,
                kind: 'INCOMING_INVOICE',
                title: `Счёт № ${doc.externalNumber || doc.number} от ${doc.counterparty?.name ?? 'контрагента'}`,
                text: `На ${amount(doc.total, doc.currency)} — выставлен по ссылке на отчёт`,
                at: doc.createdAt.toISOString(),
                href: `/company/accounting/invoices/${doc.id}`,
            });
        }
        for (const row of paid) {
            const d = (row.details ?? {}) as {
                number?: string; incoming?: boolean; senderName?: string;
                paid?: number; total?: number; currency?: string;
            };
            const full = (d.paid ?? 0) >= (d.total ?? 0);
            notices.push({
                id: `paid-${row.id}`,
                kind: 'INVOICE_PAID',
                title: d.incoming
                    ? `${d.senderName ?? 'Контрагент'} ${full ? 'оплатил' : 'частично оплатил'} счёт № ${d.number ?? ''}`
                    : `${d.senderName ?? 'Контрагент'} получил оплату по счёту № ${d.number ?? ''}`,
                text: `Оплачено ${amount(d.paid ?? 0, d.currency ?? null)} из ${amount(d.total ?? 0, d.currency ?? null)}`,
                at: row.createdAt.toISOString(),
                // Оплатили наш счёт — он в нашем журнале; мы оплатили счёт
                // контрагенту — это его входящий документ.
                href: d.incoming ? '/company/accounting/invoices' : '/company/accounting/incoming',
            });
        }
    }

    return notices.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
}
