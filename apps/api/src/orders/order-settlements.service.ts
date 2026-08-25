import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    asCalendarDay as asDay,
    dueDateFrom,
    isInvoiceTiming,
    isPaymentAnchor,
    termsAreComplete,
} from '../common/utils/payment-terms';

/**
 * Расчёты по рейсу: НДС сторон и сроки оплаты.
 *
 * Раньше эти ответы давал тот, кто ведёт рейс. Менеджер видел в заявке
 * галочку «НДС» со снятой отметкой и ставку 16% по умолчанию — и либо не
 * трогал их вовсе, либо ставил наугад. Дальше это уходило в договор-заявку с
 * печатью и подписью директора. Про срок оплаты история та же: строка
 * «Условие оплаты перевозчика» была свободным текстом, а в документ
 * печаталось «15 Календарных дней» независимо от того, что в ней написано.
 *
 * Теперь ответы берутся из карточек контрагентов, где их один раз заполнил
 * бухгалтер. Если в карточке ответа нет — рейс не блокируется, но его
 * расчёты ждут человека: пока они не подтверждены, договор нельзя заверить
 * печатью, счёт нельзя выставить, а контрагент видит рейс без налоговой
 * части. Это лучше, чем напечатать «без НДС» и узнать об ошибке от него.
 */

/** Сторона расчётов: одна и та же форма для заказчика и для перевозчика. */
export interface SettlementSide {
    companyId: string | null;
    name: string | null;
    vatPayer: boolean | null;
    vatRate: number | null;
    days: number | null;
    from: string | null;
    /** Плановая дата платежа, если день отсчёта уже известен. */
    dueDate: Date | null;
    /** Чего ждём, чтобы посчитать дату: «выгрузки», «счёта», «оригиналов». */
    dueDependsOn: string | null;
    /** Когда оригиналы накладных дошли до этой стороны. */
    originalsAt: Date | null;
}

export interface SettlementState {
    confirmed: boolean;
    confirmedAt: Date | null;
    confirmedByName: string | null;
    /** Откуда взялось подтверждение: карточки, человек или «до правила». */
    source: 'CARDS' | 'PERSON' | 'LEGACY' | null;
    /** Чего не хватает, чтобы подтвердить само. Человеческим языком. */
    missing: string[];
    customer: SettlementSide;
    carrier: SettlementSide;
    invoiceTiming: string | null;
}

const num = (value: any): number | null => (
    value === null || value === undefined ? null : Number(value)
);

/** Что ждём, чтобы посчитать срок оплаты. */
const WAITING_FOR: Record<string, string> = {
    UNLOAD: 'выгрузки',
    INVOICE: 'выставления счёта',
    ORIGINALS: 'получения оригиналов накладных',
};

/** Сторона расчётов. Заказчик платит нам, перевозчику платим мы. */
export type SettlementSideKey = 'customer' | 'carrier';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Срок оплаты — это день, а не момент.
 *
 * Отметку ставит человек в своём часовом поясе, а сравнивают её с датами
 * маршрута и счетов, которые лежат в базе полуночью UTC. Без приведения
 * «7 августа» из Алматы стало бы 6 августа, и вся отсрочка съехала бы на день.
 */
@Injectable()
export class OrderSettlementsService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Рейс ведёт эта компания — она и распоряжается его расчётами.
     *
     * Проверка обязательна на каждом входе: в расчётах видны обе стороны, а
     * заказчику незачем знать, на каких условиях мы работаем с перевозчиком —
     * из ставки и отсрочки складывается наш заработок. Хозяин рейса —
     * экспедитор, а если его нет, то компания, которая заказала перевозку.
     */
    private assertOwner(order: any, companyId: string) {
        const owner = order.forwarderId || order.partnerId || order.customerCompanyId;
        if (!companyId || owner !== companyId) {
            throw new ForbiddenException('Расчёты по рейсу видит компания, которая его ведёт');
        }
    }

    /**
     * Кто в этом рейсе заказчик, а кто перевозчик — с точки зрения нашей
     * компании.
     *
     * Разбор сторон тот же, что в отчёте по взаиморасчётам: экспедитор — это
     * `forwarderId`, а если его нет — `partnerId`. Перевозчик — та сторона,
     * которой платим мы и которая не мы сами.
     */
    private sidesOf(order: any, companyId: string) {
        const forwarder = order.forwarderId || order.partnerId;
        const weAreForwarder = forwarder === companyId;

        const customerId = weAreForwarder
            ? order.customerCompanyId
            : (order.customerCompanyId === companyId ? null : forwarder);

        const carrierId = [order.subForwarderId, order.partnerId]
            .find((id) => id && id !== companyId && id !== customerId) ?? null;

        return { customerId: customerId ?? null, carrierId };
    }

    /**
     * Условия из карточек сторон и то, что из них следует для рейса.
     *
     * Возвращает готовый набор полей для записи в заявку. Ставки НДС и сроки
     * — снимок: договорённость с контрагентом могут поменять через полгода, а
     * этот рейс прошёл по прежним условиям.
     *
     * Условия заполнены только у карточек справочника — их заводим мы, и
     * договорённость наша. Если сторона рейса — компания, которая сама
     * работает на платформе, её условия хранить у неё нельзя: у неё свои
     * договорённости с другими. По таким рейсам ответ даёт бухгалтер в самой
     * заявке, и до тех пор рейс ждёт его — та же защита, что и при незаполненной
     * карточке.
     */
    async termsFromCards(order: any, companyId: string) {
        const { customerId, carrierId } = this.sidesOf(order, companyId);
        const ids = [customerId, carrierId].filter(Boolean) as string[];
        const cards = ids.length
            ? await this.prisma.company.findMany({
                where: { id: { in: ids } },
                select: {
                    id: true, name: true, vatPayer: true, vatRate: true,
                    invoiceTiming: true,
                    customerPaymentDays: true, customerPaymentFrom: true,
                    carrierPaymentDays: true, carrierPaymentFrom: true,
                    // Наша ли это карточка справочника. У компании, которая
                    // сама работает на платформе, условий не спросишь: они
                    // задаются по рейсу.
                    isExternal: true, createdByCompanyId: true,
                },
            })
            : [];
        const card = (id: string | null) => (id ? cards.find((c) => c.id === id) ?? null : null);

        const customerCard = card(customerId);
        const carrierCard = card(carrierId);

        return {
            customerId,
            carrierId,
            customerCard,
            carrierCard,
            patch: {
                hasVat: customerCard?.vatPayer ?? false,
                vatRate: customerCard?.vatPayer ? num(customerCard.vatRate) ?? 0 : 0,
                executorHasVat: carrierCard?.vatPayer ?? false,
                executorVatRate: carrierCard?.vatPayer ? num(carrierCard.vatRate) ?? 0 : 0,
                customerPaymentDays: customerCard?.customerPaymentDays ?? null,
                customerPaymentFrom: customerCard?.customerPaymentFrom ?? null,
                carrierPaymentDays: carrierCard?.carrierPaymentDays ?? null,
                carrierPaymentFrom: carrierCard?.carrierPaymentFrom ?? null,
            },
        };
    }

    /**
     * Условия для новой заявки — считаются до её создания.
     *
     * Отдельно от `applyFromCards`, потому что у новой заявки ещё нет ни id,
     * ни точек маршрута в базе: условия должны попасть в неё сразу, а не
     * догоняющей правкой. Иначе между двумя запросами существует заявка с
     * «без НДС» по умолчанию — и ровно в этот момент кто-то формирует по ней
     * договор.
     */
    async termsForNewOrder(input: {
        ourCompanyId?: string | null;
        customerCompanyId?: string | null;
        forwarderId?: string | null;
        subForwarderId?: string | null;
        unloadAt?: Date | string | null;
    }) {
        const { patch, customerCard, carrierCard, customerId, carrierId } = await this.termsFromCards(
            {
                customerCompanyId: input.customerCompanyId ?? null,
                forwarderId: input.forwarderId ?? null,
                partnerId: null,
                subForwarderId: input.subForwarderId ?? null,
            },
            input.ourCompanyId ?? '',
        );
        const complete = this.isComplete({ customerId, carrierId, customerCard, carrierCard });

        // У новой заявки известен только день выгрузки: ни счёта, ни оригиналов
        // накладных по ней ещё нет и быть не может. Даты по этим условиям
        // посчитаются позже — когда события произойдут.
        return {
            ...patch,
            customerPaymentDate: patch.customerPaymentFrom === 'UNLOAD'
                ? dueDateFrom(input.unloadAt ?? null, patch.customerPaymentDays)
                : null,
            driverPaymentDate: patch.carrierPaymentFrom === 'UNLOAD'
                ? dueDateFrom(input.unloadAt ?? null, patch.carrierPaymentDays)
                : null,
            settlementsConfirmedAt: complete ? new Date() : null,
        };
    }

    /**
     * День, от которого идёт отсрочка каждой стороны.
     *
     * Точек отсчёта три, и все три теперь настоящие:
     *   * `UNLOAD` — день выгрузки по маршруту;
     *   * `ORIGINALS` — день, когда оригиналы накладных дошли до этой стороны
     *     (отметку ставит человек, до неё дня нет);
     *   * `INVOICE` — день счёта по этому рейсу.
     *
     * Пусто означает «событие ещё не наступило»: заплатить «через 15 дней от
     * получения оригиналов» нельзя, пока оригиналы едут почтой, и выдумывать
     * дату вместо этого — хуже, чем показать, чего ждём.
     */
    private async anchorDates(order: any, companyId: string) {
        const unloadAt = this.unloadDate(order.routePoints);

        const dayOf = async (anchor: string | null, side: SettlementSideKey) => {
            if (anchor === 'UNLOAD') return asDay(unloadAt);
            if (anchor === 'ORIGINALS') {
                return asDay(side === 'carrier' ? order.carrierOriginalsAt : order.customerOriginalsAt);
            }
            if (anchor === 'INVOICE') return this.invoiceDate(order, companyId, side);
            return null;
        };

        return {
            customer: await dayOf(order.customerPaymentFrom ?? null, 'customer'),
            carrier: await dayOf(order.carrierPaymentFrom ?? null, 'carrier'),
        };
    }

    /**
     * Дата счёта, от которой идёт отсрочка.
     *
     * Заказчику счёт выставляем мы — это наш исходящий счёт по этому рейсу.
     * Перевозчик выставляет счёт нам — счёт входящий, и день в нём стоит его,
     * а не тот, когда мы завели документ у себя; поэтому берётся `externalDate`.
     *
     * Считает самый ранний проведённый счёт: отсрочку запускает первый
     * выставленный счёт, а не последняя перевыставленная копия. Черновики и
     * отменённые счета не в счёт — по ним никто ничего не должен.
     */
    private async invoiceDate(order: any, companyId: string, side: SettlementSideKey) {
        if (!order?.id || !companyId) return null;
        const { customerId, carrierId } = this.sidesOf(order, companyId);
        const counterpartyId = side === 'customer' ? customerId : carrierId;
        if (!counterpartyId) return null;

        const invoice = await this.prisma.accountingDocument.findFirst({
            where: {
                companyId,
                counterpartyId,
                type: 'PAYMENT_INVOICE',
                direction: side === 'customer' ? 'OUTGOING' : 'INCOMING',
                status: 'POSTED',
                orders: { some: { orderId: order.id } },
            },
            orderBy: { documentDate: 'asc' },
            select: { documentDate: true, externalDate: true },
        });
        if (!invoice) return null;

        return asDay(side === 'customer'
            ? invoice.documentDate
            : invoice.externalDate ?? invoice.documentDate);
    }

    /**
     * Плановая дата платежа по условиям стороны.
     *
     * `undefined` — «эта дата не наша»: у рейса нет наших условий (старые
     * заявки из Excel), и то, что в поле лежит, вписал человек руками.
     * Затирать его нечем.
     */
    private derivedDueDate(
        days: number | null | undefined,
        anchor: string | null | undefined,
        anchorDate: Date | null,
    ): Date | null | undefined {
        if (days === null || days === undefined || !anchor) return undefined;
        return dueDateFrom(anchorDate, days);
    }

    /**
     * Проставить в рейс условия из карточек — когда поменялись стороны.
     *
     * Подтверждение снимается: бухгалтер проверял расчёты с другими
     * контрагентами, и его проверка к новым отношения не имеет. Если в
     * карточках новых сторон всё заполнено, подтверждение встанет само —
     * проверка должна быть про исключения, иначе бухгалтер весь день жмёт
     * кнопку на рейсах, где решать нечего.
     *
     * Ручную правку бухгалтера этот путь не трогает: если он сам вписал
     * ставку по этому рейсу, карточки её не перебивают.
     */
    async applyFromCards(orderId: string, companyId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true, customerCompanyId: true, forwarderId: true, partnerId: true,
                subForwarderId: true, settlementsConfirmedById: true,
                carrierOriginalsAt: true, customerOriginalsAt: true,
                routePoints: { select: { pointType: true, expectedDate: true }, orderBy: { sequence: 'asc' } },
            },
        });
        if (!order) return null;

        const { patch, customerCard, carrierCard, customerId, carrierId } =
            await this.termsFromCards(order, companyId);

        const complete = this.isComplete({ customerId, carrierId, customerCard, carrierCard });
        // Считаем по новым условиям, а не по тем, что лежат в заявке: стороны
        // только что поменяли, вместе с ними поменялись и сроки.
        const anchors = await this.anchorDates({ ...order, ...patch }, companyId);

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                ...patch,
                customerPaymentDate: dueDateFrom(anchors.customer, patch.customerPaymentDays),
                driverPaymentDate: dueDateFrom(anchors.carrier, patch.carrierPaymentDays),
                settlementsConfirmedAt: complete ? new Date() : null,
                settlementsConfirmedById: null,
            },
            select: { id: true, settlementsConfirmedAt: true },
        });
    }

    /**
     * Пересчитать плановые даты платежей по уже сохранённым условиям.
     *
     * Отдельно от подстановки из карточек: когда в рейсе сдвинули дату
     * выгрузки, отметили оригиналы или провели счёт, сроки оплаты не
     * меняются — меняется день, от которого их считают. Условия и проверку
     * бухгалтера этот путь не трогает, иначе правка даты в маршруте сбрасывала
     * бы его работу.
     */
    async recomputeDueDates(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true, customerCompanyId: true, forwarderId: true, partnerId: true,
                subForwarderId: true,
                customerPaymentDays: true, customerPaymentFrom: true,
                carrierPaymentDays: true, carrierPaymentFrom: true,
                carrierOriginalsAt: true, customerOriginalsAt: true,
                routePoints: { select: { pointType: true, expectedDate: true }, orderBy: { sequence: 'asc' } },
            },
        });
        if (!order) return null;

        const anchors = await this.anchorDates(order, this.ownerOf(order));
        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                customerPaymentDate: this.derivedDueDate(
                    order.customerPaymentDays, order.customerPaymentFrom, anchors.customer,
                ),
                driverPaymentDate: this.derivedDueDate(
                    order.carrierPaymentDays, order.carrierPaymentFrom, anchors.carrier,
                ),
            },
            select: { id: true },
        });
    }

    /**
     * Пересчитать сроки по рейсам, к которым привязан счёт.
     *
     * Зовётся, когда счёт провели или отменили: для условий «от даты счёта»
     * ровно в этот момент появляется (или исчезает) день отсчёта. Без этого
     * плановая дата платежа так и осталась бы пустой у всех, кто работает по
     * счёту, — а это половина заказчиков.
     */
    async recomputeForDocument(documentId: string) {
        const links = await this.prisma.accountingDocumentOrder.findMany({
            where: { documentId },
            select: { orderId: true },
        });
        for (const link of links) {
            await this.recomputeDueDates(link.orderId);
        }
        return links.length;
    }

    /**
     * Отметить, что оригиналы накладных дошли.
     *
     * Отметку ставит тот, кто ведёт рейс: получить оригиналы от перевозчика и
     * убедиться, что заказчик их получил, — обычная работа с документами, а не
     * бухгалтерия. Бухгалтеру принадлежит другое — сколько дней отсрочки и от
     * какого события их считать.
     *
     * Дата разрешена задним числом: оригиналы приходят почтой, и отметку
     * ставят, когда до них дошли руки, а срок идёт с того дня, когда конверт
     * пришёл на самом деле.
     */
    async markOriginals(
        orderId: string,
        companyId: string,
        side: SettlementSideKey,
        date: Date | string | null,
    ) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, forwarderId: true, partnerId: true, customerCompanyId: true },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');
        this.assertOwner(order, companyId);

        const day = asDay(date);
        if (date && !day) throw new BadRequestException('Не понял дату получения оригиналов');
        if (day && day.getTime() > asDay(new Date())!.getTime() + DAY_MS) {
            throw new BadRequestException('Оригиналы нельзя получить завтра');
        }

        await this.prisma.order.update({
            where: { id: orderId },
            data: side === 'carrier' ? { carrierOriginalsAt: day } : { customerOriginalsAt: day },
        });
        await this.recomputeDueDates(orderId);
        return this.stateOf(orderId, companyId);
    }

    /** Компания, которая ведёт рейс. */
    private ownerOf(order: any): string {
        return order.forwarderId || order.partnerId || order.customerCompanyId || '';
    }

    /** Дата выгрузки по маршруту: от неё считаются сроки «от выгрузки». */
    private unloadDate(points: { pointType: string; expectedDate: Date | null }[] = []) {
        const delivery = [...points].reverse().find((p) => p.pointType === 'DELIVERY');
        return delivery?.expectedDate ?? null;
    }

    private isComplete(input: {
        customerId: string | null;
        carrierId: string | null;
        customerCard: any;
        carrierCard: any;
    }) {
        // Сторон может не быть вовсе — перевозчика ищут уже после заведения
        // рейса. Отсутствующая сторона ничему не мешает: подтверждать по ней
        // нечего, документов для неё тоже не выдают.
        const customerOk = !input.customerId || termsAreComplete({
            vatPayer: input.customerCard?.vatPayer,
            days: input.customerCard?.customerPaymentDays,
            anchor: input.customerCard?.customerPaymentFrom,
        });
        const carrierOk = !input.carrierId || termsAreComplete({
            vatPayer: input.carrierCard?.vatPayer,
            days: input.carrierCard?.carrierPaymentDays,
            anchor: input.carrierCard?.carrierPaymentFrom,
        });
        return customerOk && carrierOk;
    }

    /**
     * Состояние расчётов по рейсу — для вкладки «Финансы» и для документов.
     */
    async stateOf(orderId: string, companyId: string): Promise<SettlementState> {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true, customerCompanyId: true, forwarderId: true, partnerId: true,
                subForwarderId: true,
                hasVat: true, vatRate: true, executorHasVat: true, executorVatRate: true,
                customerPaymentDays: true, customerPaymentFrom: true,
                carrierPaymentDays: true, carrierPaymentFrom: true,
                customerPaymentDate: true, driverPaymentDate: true,
                carrierOriginalsAt: true, customerOriginalsAt: true,
                settlementsConfirmedAt: true, settlementsConfirmedById: true,
                routePoints: { select: { pointType: true, expectedDate: true }, orderBy: { sequence: 'asc' } },
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');
        this.assertOwner(order, companyId);

        const { customerId, carrierId, customerCard, carrierCard } =
            await this.termsFromCards(order, companyId);

        const confirmer = order.settlementsConfirmedById
            ? await this.prisma.user.findUnique({
                where: { id: order.settlementsConfirmedById },
                select: { firstName: true, lastName: true },
            })
            : null;

        /**
         * Чего не хватает — и что с этим делать.
         *
         * Два разных случая, и путать их нельзя. Если сторона — наша карточка
         * справочника, ответ живёт в ней и заполняется один раз на все рейсы.
         * Если сторона сама работает на платформе, карточки нет и быть не
         * может: условия задаются здесь, по этому рейсу.
         *
         * Список показывается только у непроверенных расчётов: у проверенных
         * он противоречил бы отметке «проверено».
         */
        const ourCard = (card: any) => !!card?.isExternal && card?.createdByCompanyId === companyId;
        const missing: string[] = [];
        if (!order.settlementsConfirmedAt) {
            if (customerId && !termsAreComplete({
                vatPayer: customerCard?.vatPayer,
                days: customerCard?.customerPaymentDays,
                anchor: customerCard?.customerPaymentFrom,
            })) {
                missing.push(ourCard(customerCard)
                    ? `В карточке заказчика «${customerCard?.name || '—'}» не заполнены условия расчётов`
                    : `Заказчик «${customerCard?.name || '—'}» работает на платформе — условия по этому`
                        + ' рейсу задайте здесь: в чужой карточке их хранить нельзя');
            }
            if (carrierId && !termsAreComplete({
                vatPayer: carrierCard?.vatPayer,
                days: carrierCard?.carrierPaymentDays,
                anchor: carrierCard?.carrierPaymentFrom,
            })) {
                missing.push(ourCard(carrierCard)
                    ? `В карточке перевозчика «${carrierCard?.name || '—'}» не заполнены условия расчётов`
                    : `Перевозчик «${carrierCard?.name || '—'}» работает на платформе — условия по этому`
                        + ' рейсу задайте здесь: в чужой карточке их хранить нельзя');
            }
        }

        // Три разных «подтверждено», и на экране они звучат по-разному.
        //
        // Заявки, заведённые до появления проверки, помечены в миграции без
        // автора: подписывать их чьим-то именем было бы неправдой.
        const source: SettlementState['source'] = !order.settlementsConfirmedAt
            ? null
            : order.settlementsConfirmedById
                ? 'PERSON'
                : (order.customerPaymentDays === null && order.carrierPaymentDays === null
                    ? 'LEGACY'
                    : 'CARDS');

        const side = (input: {
            companyId: string | null;
            name: string | null;
            vatPayer: boolean | null;
            vatRate: number | null;
            days: number | null;
            from: string | null;
            dueDate: Date | null;
            originalsAt: Date | null;
        }): SettlementSide => ({
            ...input,
            dueDependsOn: input.dueDate || !input.from
                ? null
                : WAITING_FOR[input.from] ?? null,
        });

        return {
            confirmed: !!order.settlementsConfirmedAt,
            confirmedAt: order.settlementsConfirmedAt,
            confirmedByName: confirmer
                ? `${confirmer.lastName || ''} ${confirmer.firstName || ''}`.trim() || null
                : null,
            source,
            missing,
            invoiceTiming: isInvoiceTiming(customerCard?.invoiceTiming)
                ? customerCard!.invoiceTiming
                : null,
            customer: side({
                companyId: customerId,
                name: customerCard?.name ?? null,
                vatPayer: order.hasVat,
                vatRate: num(order.vatRate),
                days: order.customerPaymentDays,
                from: order.customerPaymentFrom,
                dueDate: order.customerPaymentDate,
                originalsAt: order.customerOriginalsAt,
            }),
            carrier: side({
                companyId: carrierId,
                name: carrierCard?.name ?? null,
                vatPayer: order.executorHasVat,
                vatRate: num(order.executorVatRate),
                days: order.carrierPaymentDays,
                from: order.carrierPaymentFrom,
                dueDate: order.driverPaymentDate,
                originalsAt: order.carrierOriginalsAt,
            }),
        };
    }

    /**
     * Правка расчётов по одному рейсу — узкий вход для бухгалтера.
     *
     * Узкий намеренно: бухгалтера не пускают править заявку целиком (маршрут,
     * груз, ставки — не его работа и не его ответственность), а менеджеру
     * нечего делать в НДС. Здесь только налоговая часть и сроки, и правка
     * сразу означает проверку: подтверждает тот, кто её и внёс.
     */
    async patchTerms(orderId: string, companyId: string, userId: string, dto: {
        hasVat?: boolean;
        vatRate?: number | null;
        executorHasVat?: boolean;
        executorVatRate?: number | null;
        customerPaymentDays?: number | null;
        customerPaymentFrom?: string | null;
        carrierPaymentDays?: number | null;
        carrierPaymentFrom?: string | null;
    }) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true, forwarderId: true, partnerId: true, customerCompanyId: true,
                subForwarderId: true,
                carrierOriginalsAt: true, customerOriginalsAt: true,
                routePoints: { select: { pointType: true, expectedDate: true }, orderBy: { sequence: 'asc' } },
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');
        this.assertOwner(order, companyId);

        const rate = (value: number | null | undefined) => {
            if (value === null || value === undefined) return null;
            if (!Number.isFinite(value) || value < 0 || value > 100) {
                throw new BadRequestException('Ставка НДС — от 0 до 100 процентов');
            }
            return value;
        };
        const days = (value: number | null | undefined) => {
            if (value === null || value === undefined) return null;
            if (!Number.isInteger(value) || value < 0 || value > 365) {
                throw new BadRequestException('Срок оплаты — целое число дней от 0 до 365');
            }
            return value;
        };
        const anchor = (value: string | null | undefined) => {
            if (!value) return null;
            if (!isPaymentAnchor(value)) {
                throw new BadRequestException('Не понял, от какого дня считать отсрочку');
            }
            return value;
        };

        const patch: Record<string, unknown> = {};
        if (dto.hasVat !== undefined) patch.hasVat = !!dto.hasVat;
        if (dto.vatRate !== undefined) patch.vatRate = rate(dto.vatRate) ?? 0;
        if (dto.executorHasVat !== undefined) patch.executorHasVat = !!dto.executorHasVat;
        if (dto.executorVatRate !== undefined) patch.executorVatRate = rate(dto.executorVatRate) ?? 0;

        if (dto.customerPaymentDays !== undefined || dto.customerPaymentFrom !== undefined) {
            const d = days(dto.customerPaymentDays);
            const a = anchor(dto.customerPaymentFrom);
            if (d !== null && a === null) {
                throw new BadRequestException('Заказчик: укажите, от какого дня считать отсрочку');
            }
            patch.customerPaymentDays = d;
            patch.customerPaymentFrom = a;
        }
        if (dto.carrierPaymentDays !== undefined || dto.carrierPaymentFrom !== undefined) {
            const d = days(dto.carrierPaymentDays);
            const a = anchor(dto.carrierPaymentFrom);
            if (d !== null && a === null) {
                throw new BadRequestException('Перевозчик: укажите, от какого дня считать отсрочку');
            }
            patch.carrierPaymentDays = d;
            patch.carrierPaymentFrom = a;
        }

        // Плановые даты — от новых условий: бухгалтер поменял отсрочку, и день
        // платежа обязан переехать вместе с ней. Если по новой точке отсчёта
        // события ещё не было (оригиналы не пришли, счёт не выставлен), дата
        // очищается — вернётся сама, когда событие наступит.
        const anchors = await this.anchorDates(
            {
                ...order,
                customerPaymentFrom: patch.customerPaymentFrom ?? null,
                carrierPaymentFrom: patch.carrierPaymentFrom ?? null,
            },
            companyId,
        );
        if (patch.customerPaymentFrom !== undefined) {
            patch.customerPaymentDate = dueDateFrom(anchors.customer, patch.customerPaymentDays as number | null);
        }
        if (patch.carrierPaymentFrom !== undefined) {
            patch.driverPaymentDate = dueDateFrom(anchors.carrier, patch.carrierPaymentDays as number | null);
        }

        // Правка бухгалтера и есть проверка: второй кнопки для этого не нужно.
        patch.settlementsConfirmedAt = new Date();
        patch.settlementsConfirmedById = userId;

        await this.prisma.order.update({ where: { id: orderId }, data: patch });
        return this.stateOf(orderId, companyId);
    }

    /** Подтвердить расчёты как есть — без правок. */
    async confirm(orderId: string, companyId: string, userId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, forwarderId: true, partnerId: true, customerCompanyId: true },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');
        this.assertOwner(order, companyId);

        await this.prisma.order.update({
            where: { id: orderId },
            data: { settlementsConfirmedAt: new Date(), settlementsConfirmedById: userId },
        });
        return this.stateOf(orderId, companyId);
    }
}
