import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    AccountingDocumentDirection,
    AccountingDocumentStatus,
    AccountingDocumentType,
    UserRole,
} from '@prisma/client';
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
 * Сумма для примечания бухгалтеру — без копеек и с разрядами.
 *
 * Копейки в тексте о расхождении мешают: спор идёт о тысячах, а глаз
 * цепляется за «445 000,00».
 */
const money = (value: { toFixed: (digits: number) => string }) =>
    `${Math.round(Number(value.toFixed(2))).toLocaleString('ru-RU')} ₸`;

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

        const claimedByOrder = new Map(
            (dto.amounts ?? []).map((entry) => [entry.orderId, this.parseAmount(entry.amount)]),
        );

        const lines: { name: string; description?: string; quantity: string; unitPrice: string; orderId: string }[] = [];
        const disagreements: string[] = [];
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
            const ours = this.amountOwedTo(order, counterpartyId);
            const claimed = claimedByOrder.get(order.id) ?? null;
            const amount = claimed ?? ours;

            // Без своей суммы счёт опирается на нашу цифру, и если её нет —
            // выставлять нечего. Названная сумма этот случай закрывает:
            // цену могли не записать в карточку, но перевозчик её знает.
            if (amount.lte(0)) {
                throw new BadRequestException(
                    `По сделке №${order.orderNumber} сумма не указана — укажите свою`,
                );
            }

            const cities = order.routePoints
                .map((point) => point.location?.city)
                .filter(Boolean);
            const route = cities.length ? `${cities[0]} — ${cities[cities.length - 1]}` : null;

            // Расхождение пишется в строку счёта и в примечание.
            //
            // Наша цифра остаётся нашей: заявленная сумма не переписывает
            // карточку рейса. Но увидеть спор бухгалтер обязан до того, как
            // проведёт счёт, — иначе разница уходит в оплату молча.
            const differs = !amount.eq(ours);
            if (differs) {
                const diff = amount.minus(ours);
                disagreements.push(
                    `№${order.orderNumber}: ${money(amount)} вместо ${money(ours)}`
                    + ` (${diff.gt(0) ? '+' : '−'}${money(diff.abs())})`,
                );
            }

            total = total.plus(amount);
            lines.push({
                name: `Транспортные услуги по заявке №${order.orderNumber}`,
                description: [route, differs ? `у нас ${money(ours)}` : null]
                    .filter(Boolean)
                    .join(' · ') || undefined,
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
        const disagreement = disagreements.length
            ? `Суммы контрагента расходятся с нашими: ${disagreements.join('; ')}`
            : null;
        const document = await this.documents.createDraft(companyId, owner.id, {
            type: AccountingDocumentType.PAYMENT_INVOICE,
            // Для нас это входящий счёт: его выставили нам.
            direction: AccountingDocumentDirection.INCOMING,
            counterpartyId,
            documentDate: dto.externalDate || new Date().toISOString().slice(0, 10),
            dueDate: dto.dueDate,
            externalNumber: dto.externalNumber?.trim() || undefined,
            externalDate: dto.externalDate,
            note: [origin, disagreement, dto.note?.trim()].filter(Boolean).join('. '),
            // След происхождения: по нему контрагент вправе отозвать свой
            // счёт, а бухгалтер видит, что документ пришёл снаружи.
            sharedReportLinkId: link.id,
            lines: lines.map(({ orderId, ...line }) => ({ ...line, orderId })) as any,
            orderIds,
        } as any);

        return {
            id: document.id,
            number: document.number,
            status: document.status,
            total: toNum(total),
            ordersCount: orders.length,
            disagreements: disagreements.length,
        };
    }

    /**
     * Контрагент отзывает свой счёт.
     *
     * Пока бухгалтер счёт не тронул, это просто заявление стороны, и
     * держать в нём ошибку насильно незачем: отметив не те рейсы или не ту
     * сумму, человек оказывался заперт — рейсы из счёта у него больше не
     * выбирались, а отменить документ он не мог. Оставалось звонить нам.
     *
     * Границы жёсткие. Отозвать можно только счёт, пришедший по этой же
     * ссылке (то есть свой), только пока он черновик и только пока на нём
     * нет распределённых платежей. Всё остальное — уже наш документ, и
     * трогать его снаружи нельзя.
     */
    async withdrawFromSharedReport(token: string, documentId: string) {
        const link = await this.shareLinks.resolve(token);

        const document = await this.prisma.accountingDocument.findFirst({
            where: {
                id: documentId,
                companyId: link.companyId,
                counterpartyId: link.counterpartyId,
                sharedReportLinkId: { not: null },
            },
            select: {
                id: true,
                number: true,
                status: true,
                sharedReportLink: { select: { counterpartyId: true } },
                _count: { select: { paymentAllocations: true } },
            },
        });
        // Чужой и несуществующий документ отвечают одинаково: по ответу
        // нельзя перебирать чужие номера.
        if (!document || document.sharedReportLink?.counterpartyId !== link.counterpartyId) {
            throw new NotFoundException('Счёт не найден');
        }
        if (document.status !== AccountingDocumentStatus.DRAFT) {
            throw new ConflictException(
                'Счёт уже принят в работу бухгалтерией — отозвать его можно только через отправителя отчёта',
            );
        }
        if (document._count.paymentAllocations) {
            throw new ConflictException('По счёту уже разнесены платежи');
        }

        await this.prisma.accountingDocument.delete({ where: { id: document.id } });
        return { id: document.id, number: document.number, withdrawn: true };
    }

    /**
     * Сумма со слов контрагента: печатают её как придётся.
     *
     * Пробелы разделяют разряды, запятая заменяет точку. Отвергаем только
     * то, что числом не является, — придираться к форме записи в поле,
     * которое заполняют с телефона, значит потерять счёт вовсе.
     */
    private parseAmount(raw: string) {
        const normalized = `${raw}`.replace(/[\s ]/g, '').replace(',', '.');
        if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
            throw new BadRequestException(`Сумма «${raw}» указана неверно`);
        }
        const value = D(normalized);
        if (value.lte(0)) throw new BadRequestException('Сумма должна быть больше нуля');
        return value;
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
