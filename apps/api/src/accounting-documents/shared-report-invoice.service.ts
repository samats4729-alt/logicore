import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountingDocumentDirection, AccountingDocumentType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SharedReportLinkService } from '../accounting/services/shared-report-link.service';
import { FinanceCalculatorService } from '../accounting/services/finance-calculator.service';
import { AccountingDocumentsService } from './accounting-documents.service';
import { D, ZERO, toNum } from '../common/utils/money';
import { SharedReportInvoiceDto } from './dto/shared-report-invoice.dto';
import { counterpartyIsExecutor } from '../common/utils/settlement';

/** Сколько сделок можно включить в один счёт из публичной страницы. */
const MAX_ORDERS = 200;

/**
 * Контрагент выставляет счёт по расшаренному отчёту.
 *
 * Контрагент отмечает сделки, по которым просит оплату («крыжит» их), и
 * счёт появляется у нас как ВХОДЯЩИЙ ЧЕРНОВИК. Черновик, а не проведённый
 * документ, — принципиально: запрос пришёл от человека без учётной записи,
 * и превращать его сразу в наше обязательство нельзя. Бухгалтер видит
 * счёт, сверяет и проводит сам.
 *
 * Раньше такой счёт создавался в старой модели `Invoice`: он не попадал в
 * журналы бухгалтерии, а его публичная ссылка была вечной и неотзываемой.
 */
@Injectable()
export class SharedReportInvoiceService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly shareLinks: SharedReportLinkService,
        private readonly documents: AccountingDocumentsService,
        private readonly calculator: FinanceCalculatorService,
    ) {}

    async createFromSharedReport(token: string, dto: SharedReportInvoiceDto) {
        const link = await this.shareLinks.resolve(token);
        const { companyId, counterpartyId } = link;

        const orderIds = [...new Set(dto.orderIds ?? [])];
        if (!orderIds.length) {
            throw new BadRequestException('Отметьте хотя бы одну сделку');
        }
        if (orderIds.length > MAX_ORDERS) {
            throw new BadRequestException(`В один счёт помещается не больше ${MAX_ORDERS} сделок`);
        }

        const orders = await this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                customerCompanyId: true,
                forwarderId: true,
                partnerId: true,
                subForwarderId: true,
                customerPrice: true,
                subForwarderPrice: true,
                driverCost: true,
                routePoints: {
                    orderBy: { sequence: 'asc' },
                    select: { location: { select: { city: true } } },
                },
            },
        });
        if (orders.length !== orderIds.length) {
            throw new BadRequestException('Некоторые сделки не найдены');
        }

        const lines: { name: string; description?: string; quantity: string; unitPrice: string; orderId: string }[] = [];
        let total = ZERO;

        for (const order of orders) {
            // Два разных отказа, и путать их нельзя: «сделка не ваша» —
            // это граница доступа, «сумма не указана» — обычная недоделка
            // в карточке, которую видно и нам, и контрагенту.
            if (!counterpartyIsExecutor(order, companyId, counterpartyId)) {
                throw new BadRequestException(
                    `Сделка №${order.orderNumber} не относится к взаиморасчётам с вами`,
                );
            }
            const amount = this.amountOwedTo(order, counterpartyId);
            if (amount.lte(0)) {
                throw new BadRequestException(`По сделке №${order.orderNumber} сумма не указана`);
            }

            const cities = order.routePoints
                .map((point) => point.location?.city)
                .filter(Boolean);
            const route = cities.length ? `${cities[0]} — ${cities[cities.length - 1]}` : null;

            total = total.plus(amount);
            lines.push({
                name: `Транспортные услуги по заявке №${order.orderNumber}`,
                description: route ?? undefined,
                quantity: '1',
                unitPrice: amount.toFixed(2),
                orderId: order.id,
            });
        }

        // Счёт создаётся от лица нашей организации как входящий: нужен
        // какой-то наш пользователь для поля «кто создал». Настоящего автора
        // нет — запрос пришёл снаружи, поэтому в примечании остаётся след.
        const owner = await this.prisma.user.findFirst({
            where: {
                companyId,
                isActive: true,
                role: { in: [UserRole.ACCOUNTANT, UserRole.COMPANY_ADMIN, UserRole.FORWARDER] },
            },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
        });
        if (!owner) {
            throw new NotFoundException('В организации нет пользователя, к которому можно привязать счёт');
        }

        const origin = `Счёт выставлен контрагентом «${link.counterpartyName}» по ссылке на отчёт`;
        const document = await this.documents.createDraft(companyId, owner.id, {
            type: AccountingDocumentType.PAYMENT_INVOICE,
            // Для нас это входящий счёт: его выставили нам.
            direction: AccountingDocumentDirection.INCOMING,
            counterpartyId,
            documentDate: dto.externalDate || new Date().toISOString().slice(0, 10),
            dueDate: dto.dueDate,
            externalNumber: dto.externalNumber?.trim() || undefined,
            externalDate: dto.externalDate,
            note: [origin, dto.note?.trim()].filter(Boolean).join('. '),
            lines: lines.map(({ orderId, ...line }) => ({ ...line, orderId })) as any,
            orderIds,
        } as any);

        return {
            id: document.id,
            number: document.number,
            status: document.status,
            total: toNum(total),
            ordersCount: orders.length,
        };
    }

    /**
     * Сколько контрагент зарабатывает на этой сделке.
     *
     * Считает тот же калькулятор, что и страница взаиморасчётов, только с
     * точки зрения контрагента: его выручка по нашей сделке — ровно то, что
     * мы ему должны. Своя формула здесь была бы отдельной правдой, и счёт
     * расходился бы с суммой, которую контрагент видит в отчёте.
     */
    private amountOwedTo(
        order: Parameters<FinanceCalculatorService['computeOrderFinance']>[0]['order'],
        counterpartyId: string,
    ) {
        const finance = this.calculator.computeOrderFinance({
            order,
            payments: [],
            incomes: [],
            expenses: [],
            companyId: counterpartyId,
        });
        return D(finance.revenue);
    }
}
