import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    AccountingDocumentDirection,
    AccountingDocumentStatus,
    AccountingDocumentType,
    AccountKind,
    OrderStatus,
    Prisma,
    UserRole,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { PeriodClosingService } from '../accounting/services/period-closing.service';
import type { FinancialReportsService } from '../accounting/services/financial-reports.service';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';
import { toNum } from '../common/utils/money';
import {
    AccountingDocumentListQueryDto,
    AccountingDocumentRegistryQueryDto,
    REGISTRY_MAX_ROWS,
    BillableOrdersQueryDto,
    CreateAccountingDocumentDto,
    GenerateReconciliationDraftDto,
    UpdateAccountingDocumentDto,
    UpdateNumberingDto,
} from './dto/accounting-document.dto';

const COMPANY_SNAPSHOT_SELECT = {
    id: true,
    name: true,
    bin: true,
    address: true,
    actualAddress: true,
    phone: true,
    email: true,
    directorName: true,
    bankAccount: true,
    bankName: true,
    bankBic: true,
    kbe: true,
    // Печатаются в счёте и акте. Хранятся в снимке, а не берутся из
    // карточки при печати: реквизиты меняются, а выданный документ нет.
    paymentPurposeCode: true,
    signatoryPosition: true,
    signatoryName: true,
    vatCertificateSeries: true,
    vatCertificateNumber: true,
    vatCertificateDate: true,
} satisfies Prisma.CompanySelect;

const BANK_ACCOUNT_SELECT = {
    id: true,
    name: true,
    kind: true,
    isActive: true,
    iban: true,
    bankName: true,
    bankBic: true,
    kbe: true,
} satisfies Prisma.FinanceAccountSelect;

const DOCUMENT_INCLUDE = {
    company: { select: COMPANY_SNAPSHOT_SELECT },
    counterparty: { select: COMPANY_SNAPSHOT_SELECT },
    contract: {
        select: {
            id: true,
            contractNumber: true,
            status: true,
            startDate: true,
            endDate: true,
        },
    },
    createdBy: { select: { id: true, firstName: true, lastName: true } },
    postedBy: { select: { id: true, firstName: true, lastName: true } },
    cancelledBy: { select: { id: true, firstName: true, lastName: true } },
    lines: { orderBy: { lineNumber: 'asc' as const } },
    reconciliationLines: { orderBy: { lineNumber: 'asc' as const } },
    orders: { include: { order: { select: { id: true, orderNumber: true } } } },
    paymentAllocations: true,
    sourceLinks: true,
    targetLinks: true,
} satisfies Prisma.AccountingDocumentInclude;

/**
 * Карточка документа внутри компании. В графе «Документ-основание», как в
 * 1С, под номером заявки идёт вторая строка — маршрут, водитель и авто,
 * поэтому здесь заявки раскрываются подробнее.
 *
 * Публичная ссылка использует узкий DOCUMENT_INCLUDE: контрагенту без
 * учётной записи имя и телефон водителя показывать незачем.
 */
const CARD_DOCUMENT_INCLUDE = {
    ...DOCUMENT_INCLUDE,
    // Чем закрыт счёт. В карточке это единственное место, где видно курсовую
    // разницу: счёт выставили по одному курсу, деньги пришли по другому, и
    // расхождение в тенге должно быть названо, а не спрятано.
    paymentAllocations: {
        orderBy: { createdAt: 'asc' as const },
        select: {
            id: true,
            amount: true,
            amountBase: true,
            exchangeDiff: true,
            createdAt: true,
            payment: {
                select: {
                    id: true, date: true, amount: true, currency: true,
                    exchangeRate: true, method: true, note: true,
                },
            },
        },
    },
    orders: {
        include: {
            order: {
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    cargoDescription: true,
                    assignedDriverName: true,
                    assignedDriverPlate: true,
                    routePoints: {
                        orderBy: { sequence: 'asc' as const },
                        select: {
                            pointType: true,
                            sequence: true,
                            location: { select: { city: true, address: true } },
                        },
                    },
                },
            },
        },
    },
} satisfies Prisma.AccountingDocumentInclude;


/** Виды документов, которые нумеруются нами. */
const NUMBERED_TYPES = [
    AccountingDocumentType.PAYMENT_INVOICE,
    AccountingDocumentType.SERVICE_ACT,
    AccountingDocumentType.RECONCILIATION_ACT,
    AccountingDocumentType.CORRECTION,
] as const;

const NUMBERED_DIRECTIONS = [
    AccountingDocumentDirection.OUTGOING,
    AccountingDocumentDirection.INCOMING,
] as const;

/** Префикс по умолчанию — до того, как бухгалтер настроит свой. */
function defaultNumberPrefix(type: AccountingDocumentType, year: number) {
    const short = {
        [AccountingDocumentType.PAYMENT_INVOICE]: 'СЧ',
        [AccountingDocumentType.SERVICE_ACT]: 'АКТ',
        [AccountingDocumentType.RECONCILIATION_ACT]: 'СВ',
        [AccountingDocumentType.CORRECTION]: 'КОР',
    }[type];
    return `${short}-${year}-`;
}

/**
 * Номер документа из настроек: префикс и число, дополненное нулями слева.
 *
 * Одна функция на выдачу номера и на предпросмотр в настройках — иначе
 * пример на экране однажды разойдётся с тем, что реально уйдёт в документ.
 */
function formatDocumentNumber(prefix: string, value: number, padLength: number) {
    return `${prefix}${String(value).padStart(padLength, '0')}`;
}

export const RECONCILIATION_REPORTS = Symbol('RECONCILIATION_REPORTS');
type ReconciliationReports = Pick<FinancialReportsService, 'getReconciliationAct'>;

@Injectable()
export class AccountingDocumentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly calculator: AccountingDocumentCalculatorService,
        private readonly periodClosing: PeriodClosingService,
        @Inject(RECONCILIATION_REPORTS)
        private readonly financialReports: ReconciliationReports,
        private readonly currency: CurrencyService,
    ) {}

    /**
     * Курс валюты документа — тот, что попадёт в сам документ.
     *
     * Берётся на дату документа: именно ею датировано обязательство. Курс
     * записывается внутрь и больше не меняется — завтрашний курс вчерашний
     * счёт не трогает.
     *
     * Валюты нет в справочнике или курса на дату не нашлось — документ всё
     * равно создаётся, но без пересчёта: лучше счёт без справочной суммы в
     * тенге, чем счёт с выдуманной.
     */
    private async documentRate(
        companyId: string,
        currencyCode: string,
        documentDate: Date,
        total: Prisma.Decimal,
    ) {
        if (!currencyCode || currencyCode === 'KZT') {
            return { exchangeRate: new Prisma.Decimal(1), exchangeRateDate: null, totalBase: total };
        }
        const converted = await this.currency.toBase(total, currencyCode, documentDate, { companyId });
        if (!converted) {
            return { exchangeRate: null, exchangeRateDate: null, totalBase: null };
        }
        return {
            exchangeRate: converted.rate,
            exchangeRateDate: converted.rateDate,
            totalBase: converted.amount,
        };
    }

    async createReconciliationDraftFromLedger(
        companyId: string,
        userId: string,
        dto: GenerateReconciliationDraftDto,
    ) {
        const periodFrom = new Date(dto.reportPeriodFrom);
        const periodTo = new Date(dto.reportPeriodTo);
        if (periodFrom > periodTo) {
            throw new BadRequestException('Начало отчётного периода позже его окончания');
        }

        const report = await this.financialReports.getReconciliationAct(
            companyId,
            dto.counterpartyId,
            {
                startDate: dto.reportPeriodFrom,
                endDate: dto.reportPeriodTo,
            },
        );
        if (report.rows.length > 5000) {
            throw new BadRequestException('В периоде больше 5000 операций. Выберите более короткий период');
        }

        return this.createDraft(companyId, userId, {
            type: AccountingDocumentType.RECONCILIATION_ACT,
            direction: AccountingDocumentDirection.OUTGOING,
            counterpartyId: dto.counterpartyId,
            documentDate: dto.documentDate ?? dto.reportPeriodTo,
            reportPeriodFrom: dto.reportPeriodFrom,
            reportPeriodTo: dto.reportPeriodTo,
            openingBalance: report.openingBalance.toFixed(2),
            currency: 'KZT',
            note: dto.note,
            reconciliationLines: report.rows.map((row) => {
                const source = this.splitLedgerDocument(row.doc);
                return {
                    transactionDate: this.utcDateString(row.date),
                    sourceDocumentType: source.type,
                    sourceDocumentNumber: source.number,
                    description: row.description,
                    debit: row.debit.toFixed(2),
                    credit: row.credit.toFixed(2),
                };
            }),
        });
    }

    async createDraft(companyId: string, userId: string, dto: CreateAccountingDocumentDto) {
        if (dto.counterpartyId === companyId) {
            throw new BadRequestException('Организация и контрагент должны отличаться');
        }

        this.assertDocumentContent(dto);
        const [company, counterparty, contract] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId }, select: COMPANY_SNAPSHOT_SELECT }),
            this.prisma.company.findUnique({ where: { id: dto.counterpartyId }, select: COMPANY_SNAPSHOT_SELECT }),
            dto.contractId
                ? this.prisma.contract.findUnique({
                    where: { id: dto.contractId },
                    select: {
                        id: true,
                        contractNumber: true,
                        status: true,
                        startDate: true,
                        endDate: true,
                        customerCompanyId: true,
                        forwarderCompanyId: true,
                    },
                })
                : Promise.resolve(null),
        ]);

        if (!company) throw new NotFoundException('Организация не найдена');
        if (!counterparty) throw new NotFoundException('Контрагент не найден');
        if (dto.contractId) {
            if (!contract) throw new NotFoundException('Договор не найден');
            const parties = [contract.customerCompanyId, contract.forwarderCompanyId];
            if (!parties.includes(companyId) || !parties.includes(dto.counterpartyId)) {
                throw new BadRequestException('Договор не относится к выбранным сторонам документа');
            }
            if (contract.status !== 'ACTIVE') {
                throw new BadRequestException('В документ можно выбрать только действующий договор');
            }
        }

        const orderIds = Array.from(new Set([
            ...(dto.orderIds ?? []),
            ...(dto.lines ?? []).map((line) => line.orderId).filter((id): id is string => Boolean(id)),
        ]));
        await this.assertOrdersAccessible(companyId, dto, orderIds);

        // Расчётный счёт организации: явно выбранный или по умолчанию.
        // Его реквизиты попадают в снимок и печатаются — у компании может быть
        // несколько счетов в разных банках, а в карточке организации хранится
        // только один комплект.
        const bankAccount = await this.resolveBankAccount(companyId, dto.bankAccountId);

        const ownSnapshot = this.applyBankAccount(company, bankAccount);
        const outgoingDocument = dto.direction === AccountingDocumentDirection.OUTGOING;
        const issuerSnapshot = outgoingDocument ? ownSnapshot : counterparty;
        const recipientSnapshot = outgoingDocument ? counterparty : ownSnapshot;
        const lineCalculation = dto.type === AccountingDocumentType.RECONCILIATION_ACT
            ? null
            : this.calculator.calculateLines(dto.lines ?? []);
        const reconciliationCalculation = dto.type === AccountingDocumentType.RECONCILIATION_ACT
            ? this.calculator.calculateReconciliation(dto.openingBalance, dto.reconciliationLines ?? [])
            : null;
        const documentDate = new Date(dto.documentDate);

        const documentTotal = (dto.type === AccountingDocumentType.RECONCILIATION_ACT
            ? reconciliationCalculation?.closingBalance
            : lineCalculation?.total) ?? new Prisma.Decimal(0);
        const rate = await this.documentRate(
            companyId, dto.currency ?? 'KZT', documentDate, documentTotal,
        );

        const created = await this.prisma.$transaction(async (tx) => {
            const number = await this.nextNumber(
                tx,
                companyId,
                dto.type,
                dto.direction,
                documentDate.getUTCFullYear(),
            );

            return tx.accountingDocument.create({
                data: {
                    companyId,
                    counterpartyId: dto.counterpartyId,
                    type: dto.type,
                    direction: dto.direction,
                    number,
                    externalNumber: dto.externalNumber?.trim() || null,
                    externalDate: dto.externalDate ? new Date(dto.externalDate) : null,
                    documentDate,
                    operationDate: dto.operationDate ? new Date(dto.operationDate) : null,
                    dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                    reportPeriodFrom: dto.reportPeriodFrom ? new Date(dto.reportPeriodFrom) : null,
                    reportPeriodTo: dto.reportPeriodTo ? new Date(dto.reportPeriodTo) : null,
                    contractId: dto.contractId || null,
                    currency: dto.currency ?? 'KZT',
                    exchangeRate: rate.exchangeRate,
                    exchangeRateDate: rate.exchangeRateDate,
                    totalBase: rate.totalBase,
                    subtotal: lineCalculation?.subtotal ?? new Prisma.Decimal(0),
                    discountTotal: lineCalculation?.discountTotal ?? new Prisma.Decimal(0),
                    vatTotal: lineCalculation?.vatTotal ?? new Prisma.Decimal(0),
                    total: lineCalculation?.total ?? new Prisma.Decimal(0),
                    amountPaid: new Prisma.Decimal(0),
                    balanceDue: lineCalculation?.total ?? new Prisma.Decimal(0),
                    openingBalance: reconciliationCalculation?.openingBalance,
                    debitTurnover: reconciliationCalculation?.debitTurnover,
                    creditTurnover: reconciliationCalculation?.creditTurnover,
                    closingBalance: reconciliationCalculation?.closingBalance,
                    bankAccountId: bankAccount?.id ?? null,
                    issuerSnapshot,
                    recipientSnapshot,
                    issuerSignatorySnapshot: this.signatoryOf(issuerSnapshot),
                    recipientSignatorySnapshot: this.signatoryOf(recipientSnapshot),
                    basisSnapshot: contract
                        ? {
                            contractId: contract.id,
                            contractNumber: contract.contractNumber,
                            status: contract.status,
                            startDate: contract.startDate?.toISOString() ?? null,
                            endDate: contract.endDate?.toISOString() ?? null,
                        }
                        : undefined,
                    // КНП: явно введённый в документе, иначе — из настроек
                    // организации. Бухгалтер вбивал один и тот же код в
                    // каждый счёт, хотя он у компании не меняется.
                    paymentPurposeCode: dto.paymentPurposeCode?.trim() || company.paymentPurposeCode || null,
                    paymentTerms: dto.paymentTerms?.trim() || null,
                    customerMaterialsInfo: dto.customerMaterialsInfo?.trim() || null,
                    appendixInfo: dto.appendixInfo?.trim() || null,
                    note: dto.note?.trim() || null,
                    createdById: userId,
                    lines: lineCalculation
                        ? { create: lineCalculation.lines }
                        : undefined,
                    reconciliationLines: reconciliationCalculation
                        ? { create: reconciliationCalculation.lines }
                        : undefined,
                    orders: orderIds.length
                        ? { create: orderIds.map((orderId) => ({ orderId })) }
                        : undefined,
                },
                include: DOCUMENT_INCLUDE,
            });
        });

        return created;
    }

    /**
     * Какую организацию показывает журнал — фильтр «Организация» в 1С.
     *
     * По умолчанию это активная компания сессии. Пользователь с несколькими
     * своими организациями может выбрать другую, но право на неё проверяется
     * заново: источник прав — роль в ВЫБРАННОЙ компании, а не общая роль из
     * записи User. Иначе логист одной фирмы читал бы бухгалтерию другой,
     * где он всего лишь водитель.
     */
    async resolveJournalCompany(
        userId: string,
        activeCompanyId: string | null | undefined,
        requestedCompanyId: string | undefined,
        allowedRoles: UserRole[],
    ): Promise<string> {
        if (!requestedCompanyId || requestedCompanyId === activeCompanyId) {
            if (!activeCompanyId) {
                throw new ForbiddenException('Организация не выбрана');
            }
            return activeCompanyId;
        }

        const relation = await this.prisma.userCompanyRelation.findUnique({
            where: { userId_companyId: { userId, companyId: requestedCompanyId } },
            select: { role: true },
        });
        if (!relation) {
            throw new ForbiddenException('Вы не состоите в этой организации');
        }
        if (!allowedRoles.includes(relation.role)) {
            throw new ForbiddenException('В этой организации у вас нет доступа к бухгалтерии');
        }
        return requestedCompanyId;
    }

    /**
     * Отбор журнала. Вынесен отдельно, чтобы печатный реестр отбирал
     * документы ровно теми же правилами, что и список на экране: иначе
     * «Итого» на бумаге разойдётся с «Итого» в журнале.
     */
    private listWhere(
        companyId: string,
        query: AccountingDocumentListQueryDto | AccountingDocumentRegistryQueryDto,
    ): Prisma.AccountingDocumentWhereInput {
        const orderId = 'orderId' in query ? query.orderId : undefined;
        return {
            companyId,
            type: query.type,
            direction: query.direction,
            status: query.status,
            counterpartyId: query.counterpartyId,
            orders: orderId ? { some: { orderId } } : undefined,
            documentDate: query.from || query.to
                ? {
                    gte: query.from ? new Date(query.from) : undefined,
                    lte: query.to ? new Date(query.to) : undefined,
                }
                : undefined,
        };
    }

    async list(companyId: string, query: AccountingDocumentListQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 30;
        const where = this.listWhere(companyId, query);
        const [data, total, sums] = await this.prisma.$transaction([
            this.prisma.accountingDocument.findMany({
                where,
                orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    counterparty: { select: { id: true, name: true, bin: true } },
                    // Заявки-основания: в журнале это колонка «Сделка», по ней
                    // бухгалтер понимает, за какой рейс выставлен документ.
                    orders: {
                        select: { order: { select: { id: true, orderNumber: true } } },
                        take: 5,
                    },
                    _count: { select: { lines: true, reconciliationLines: true, paymentAllocations: true, orders: true } },
                },
            }),
            this.prisma.accountingDocument.count({ where }),
            // Итоги считаются по ВСЕЙ выборке, а не по странице: бухгалтеру
            // нужен ответ «сколько выставлено этому контрагенту за период»,
            // и он не должен зависеть от размера страницы.
            this.prisma.accountingDocument.aggregate({
                where: { ...where, status: { not: AccountingDocumentStatus.CANCELLED } },
                _sum: { total: true, amountPaid: true, balanceDue: true },
            }),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totals: {
                // Отменённые документы в суммы не входят — в 1С они тоже не
                // участвуют в итогах журнала.
                amount: toNum(sums._sum.total),
                paid: toNum(sums._sum.amountPaid),
                due: toNum(sums._sum.balanceDue),
            },
        };
    }

    /**
     * Карточка документа.
     *
     * Видит её и тот, кто документ выпустил, и тот, кому его отправили: это
     * один и тот же документ, а не две копии. Получателю доступ только на
     * чтение — все правки (`updateDraft`, `post`, `cancel`, удаление) как
     * были, так и остались завязаны на `companyId` владельца.
     */
    async getById(companyId: string, id: string) {
        const document = await this.prisma.accountingDocument.findFirst({
            where: {
                id,
                OR: [
                    { companyId },
                    // Доставленный документ — не черновик и не «сам себе»:
                    // отправка возможна только у проведённого.
                    { recipientCompanyId: companyId, sentAt: { not: null } },
                ],
            },
            include: CARD_DOCUMENT_INCLUDE,
        });
        if (!document) throw new NotFoundException('Бухгалтерский документ не найден');
        return document;
    }

    /**
     * Данные для печатной формы «Реестр документов» — журнал за период на
     * бумаге. Отбор тот же, что у списка; пагинации нет, потому что реестр
     * печатается целиком, но объём ограничен REGISTRY_MAX_ROWS.
     *
     * Отмеченные строки (`ids`) сужают выборку, а не заменяют её: печатается
     * пересечение с фильтрами, иначе в реестр «за июнь» попал бы отмеченный
     * ранее июльский документ.
     */
    async listForRegistry(companyId: string, query: AccountingDocumentRegistryQueryDto) {
        const where: Prisma.AccountingDocumentWhereInput = {
            ...this.listWhere(companyId, query),
            ...(query.ids?.length ? { id: { in: query.ids } } : {}),
        };

        const [documents, counterparty, company, sums] = await Promise.all([
            this.prisma.accountingDocument.findMany({
                where,
                orderBy: [{ documentDate: 'asc' }, { createdAt: 'asc' }],
                take: REGISTRY_MAX_ROWS,
                include: {
                    counterparty: { select: { id: true, name: true, bin: true } },
                    orders: {
                        select: { order: { select: { id: true, orderNumber: true } } },
                        take: 5,
                    },
                },
            }),
            query.counterpartyId
                ? this.prisma.company.findUnique({
                    where: { id: query.counterpartyId },
                    select: { name: true },
                })
                : Promise.resolve(null),
            this.prisma.company.findUnique({
                where: { id: companyId },
                select: { name: true, bin: true },
            }),
            this.prisma.accountingDocument.aggregate({
                where: { ...where, status: { not: AccountingDocumentStatus.CANCELLED } },
                _sum: { total: true, amountPaid: true, balanceDue: true },
            }),
        ]);

        return {
            company,
            documents,
            counterpartyName: counterparty?.name ?? null,
            // Итоги считаются, как в журнале: отменённые в сумму не входят.
            totals: {
                amount: toNum(sums._sum.total),
                paid: toNum(sums._sum.amountPaid),
                due: toNum(sums._sum.balanceDue),
            },
        };
    }

    /**
     * Правка черновика из карточки — кнопка «Записать» в 1С.
     *
     * Проведённый документ неизменяем: его исправляют отменой и новым
     * документом, иначе напечатанный контрагенту счёт менялся бы задним
     * числом. Строки приходят целиком: пришёл массив — он заменяет прежние
     * и итоги пересчитываются, не пришёл — строки остаются как были.
     */
    async updateDraft(companyId: string, id: string, dto: UpdateAccountingDocumentDto) {
        const document = await this.prisma.accountingDocument.findFirst({
            where: { id, companyId },
            select: {
                id: true,
                type: true,
                direction: true,
                counterpartyId: true,
                status: true,
                documentDate: true,
                amountPaid: true,
                currency: true,
                orders: { select: { orderId: true } },
            },
        });
        if (!document) throw new NotFoundException('Бухгалтерский документ не найден');
        if (document.status !== AccountingDocumentStatus.DRAFT) {
            throw new ConflictException('Изменить можно только документ в статусе «Черновик»');
        }
        if (document.type === AccountingDocumentType.RECONCILIATION_ACT && dto.lines) {
            throw new BadRequestException('Акт сверки содержит строки взаиморасчётов, а не строки услуг');
        }
        if (dto.lines && !dto.lines.length) {
            throw new BadRequestException('Счёт или акт должен содержать хотя бы одну строку');
        }
        // Номер выдан в разрезе года («СЧ-2026-000001»), поэтому перенос
        // черновика в другой год сделал бы номер неверным.
        if (dto.documentDate) {
            const nextYear = new Date(dto.documentDate).getUTCFullYear();
            if (nextYear !== document.documentDate.getUTCFullYear()) {
                throw new BadRequestException(
                    'Дата другого года меняет нумерацию — создайте документ заново нужной датой',
                );
            }
        }

        const linesOrderIds = (dto.lines ?? [])
            .map((line) => line.orderId)
            .filter((orderId): orderId is string => Boolean(orderId));
        // Список заявок пересобираем, только если он вообще затронут: пришёл
        // явно или изменились строки, которые на заявки ссылаются.
        const nextOrderIds = dto.orderIds !== undefined
            ? Array.from(new Set([...dto.orderIds, ...linesOrderIds]))
            : dto.lines
                ? Array.from(new Set([...document.orders.map((link) => link.orderId), ...linesOrderIds]))
                : null;
        if (nextOrderIds) {
            await this.assertOrdersAccessible(companyId, document, nextOrderIds);
        }

        const bankAccountTouched = dto.bankAccountId !== undefined;
        let snapshots: {
            bankAccountId: string | null;
            issuerSnapshot: Prisma.InputJsonValue;
            recipientSnapshot: Prisma.InputJsonValue;
            issuerSignatorySnapshot: Prisma.InputJsonValue;
            recipientSignatorySnapshot: Prisma.InputJsonValue;
        } | null = null;
        if (bankAccountTouched) {
            const [company, counterparty] = await Promise.all([
                this.prisma.company.findUnique({ where: { id: companyId }, select: COMPANY_SNAPSHOT_SELECT }),
                this.prisma.company.findUnique({
                    where: { id: document.counterpartyId },
                    select: COMPANY_SNAPSHOT_SELECT,
                }),
            ]);
            if (!company) throw new NotFoundException('Организация не найдена');
            if (!counterparty) throw new NotFoundException('Контрагент не найден');

            const bankAccount = await this.resolveBankAccount(companyId, dto.bankAccountId ?? undefined);
            const ownSnapshot = this.applyBankAccount(company, bankAccount);
            const outgoing = document.direction === AccountingDocumentDirection.OUTGOING;
            const issuer = outgoing ? ownSnapshot : counterparty;
            const recipient = outgoing ? counterparty : ownSnapshot;
            snapshots = {
                bankAccountId: bankAccount?.id ?? null,
                issuerSnapshot: issuer as Prisma.InputJsonValue,
                recipientSnapshot: recipient as Prisma.InputJsonValue,
                issuerSignatorySnapshot: this.signatoryOf(issuer) as Prisma.InputJsonValue,
                recipientSignatorySnapshot: this.signatoryOf(recipient) as Prisma.InputJsonValue,
            };
        }

        const lineCalculation = dto.lines ? this.calculator.calculateLines(dto.lines) : null;

        // Валюту черновика не меняем: она задана при создании вместе с
        // нумерацией и снимками сторон. Меняется дата или суммы — пересчёт
        // берётся заново на новую дату документа.
        const nextDocumentDate = dto.documentDate ? new Date(dto.documentDate) : document.documentDate;
        const draftRate = (lineCalculation || dto.documentDate !== undefined)
            ? await this.documentRate(
                companyId,
                document.currency,
                nextDocumentDate,
                lineCalculation?.total ?? new Prisma.Decimal(0),
            )
            : null;

        const trimmed = (value: string | null | undefined) =>
            value === undefined ? undefined : value?.trim() || null;

        await this.prisma.$transaction(async (tx) => {
            if (lineCalculation) {
                await tx.accountingDocumentLine.deleteMany({ where: { documentId: id } });
            }
            if (nextOrderIds) {
                await tx.accountingDocumentOrder.deleteMany({ where: { documentId: id } });
            }

            await tx.accountingDocument.update({
                where: { id },
                data: {
                    ...(dto.documentDate !== undefined
                        ? { documentDate: new Date(dto.documentDate) }
                        : {}),
                    // Поменялись строки или дата — устарел и пересчёт в
                    // учётную валюту: он привязан к дате документа.
                    ...(draftRate ?? {}),
                    ...(dto.operationDate !== undefined
                        ? { operationDate: dto.operationDate ? new Date(dto.operationDate) : null }
                        : {}),
                    ...(dto.dueDate !== undefined
                        ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
                        : {}),
                    ...(dto.externalDate !== undefined
                        ? { externalDate: dto.externalDate ? new Date(dto.externalDate) : null }
                        : {}),
                    externalNumber: trimmed(dto.externalNumber),
                    paymentTerms: trimmed(dto.paymentTerms),
                    note: trimmed(dto.note),
                    ...(snapshots ?? {}),
                    ...(lineCalculation
                        ? {
                            subtotal: lineCalculation.subtotal,
                            discountTotal: lineCalculation.discountTotal,
                            vatTotal: lineCalculation.vatTotal,
                            total: lineCalculation.total,
                            balanceDue: lineCalculation.total.minus(document.amountPaid),
                            lines: { create: lineCalculation.lines },
                        }
                        : {}),
                    ...(nextOrderIds
                        ? { orders: { create: nextOrderIds.map((orderId) => ({ orderId })) } }
                        : {}),
                },
            });
        });

        return this.getById(companyId, id);
    }

    /**
     * Перевыпуск публичной ссылки: старый токен сразу перестаёт работать.
     *
     * У прежней модели счетов ссылка была вечной и отозвать её было нельзя —
     * утёкшая ссылка навсегда открывала документ с реквизитами.
     */
    /** Картинки печати и подписи своей организации для печатной формы. */
    async getStampSource(companyId: string) {
        return this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, stampImage: true, signatureImage: true },
        });
    }

    async regenerateShareToken(companyId: string, id: string) {
        const document = await this.prisma.accountingDocument.findFirst({
            where: { id, companyId },
            select: { id: true },
        });
        if (!document) throw new NotFoundException('Документ не найден');

        return this.prisma.accountingDocument.update({
            where: { id },
            data: { shareToken: randomUUID(), shareRevokedAt: null },
            select: { id: true, shareToken: true, shareRevokedAt: true },
        });
    }

    /** Полный отзыв ссылки: документ перестаёт открываться публично вовсе. */
    async revokeShare(companyId: string, id: string) {
        const document = await this.prisma.accountingDocument.findFirst({
            where: { id, companyId },
            select: { id: true },
        });
        if (!document) throw new NotFoundException('Документ не найден');

        return this.prisma.accountingDocument.update({
            where: { id },
            data: { shareRevokedAt: new Date() },
            select: { id: true, shareRevokedAt: true },
        });
    }

    /**
     * Публичный просмотр документа по токену. Отдаёт только то, что уместно
     * показать контрагенту: сам документ и его строки, без внутренних
     * пометок, автора и истории.
     */
    async getPublicByToken(token: string) {
        const document = await this.prisma.accountingDocument.findUnique({
            where: { shareToken: token },
            include: DOCUMENT_INCLUDE,
        });

        // Отозванная ссылка и несуществующая неразличимы снаружи.
        if (!document || document.shareRevokedAt) {
            throw new NotFoundException('Ссылка недействительна');
        }
        if (document.status === AccountingDocumentStatus.DRAFT) {
            throw new NotFoundException('Ссылка недействительна');
        }

        const { note, createdBy, postedBy, cancelledBy, checksum, ...publicFields } = document;
        return publicFields;
    }

    async post(companyId: string, userId: string, id: string) {
        const document = await this.getOwnById(companyId, id);
        if (document.status !== AccountingDocumentStatus.DRAFT) {
            throw new ConflictException('Провести можно только документ в статусе «Черновик»');
        }

        await this.periodClosing.checkPeriodNotClosed(
            companyId,
            document.operationDate ?? document.documentDate,
        );
        this.assertStoredDocumentCanBePosted(document);

        /**
         * Курс фиксируется в момент проведения — здесь и навсегда.
         *
         * Черновик мог быть заведён в день, на который курса ещё не было, —
         * тогда пробуем взять его сейчас. Если курса нет и теперь, документ
         * НЕ проводится: валютный счёт без курса невозможно показать ни в
         * одном отчёте, а «проведём, потом разберёмся» означает, что цифры
         * разойдутся молча. Лучше внятный отказ с тем, что делать.
         */
        let frozenRate: { exchangeRate: Prisma.Decimal | null; exchangeRateDate: Date | null; totalBase: Prisma.Decimal | null } | null = null;
        if (document.currency && document.currency !== 'KZT') {
            frozenRate = document.exchangeRate && document.totalBase
                ? {
                    exchangeRate: document.exchangeRate,
                    exchangeRateDate: document.exchangeRateDate,
                    totalBase: document.totalBase,
                }
                : await this.documentRate(companyId, document.currency, document.documentDate, document.total);

            if (!frozenRate.exchangeRate || !frozenRate.totalBase) {
                throw new BadRequestException(
                    `Нет курса ${document.currency} на дату документа. ` +
                    'Загрузите курс в разделе «Финансы → Курсы валют» и проведите документ снова.',
                );
            }
        }

        const checksum = this.checksum({ ...document, ...(frozenRate ?? {}) } as any);

        const result = await this.prisma.accountingDocument.updateMany({
            where: { id, companyId, status: AccountingDocumentStatus.DRAFT },
            data: {
                status: AccountingDocumentStatus.POSTED,
                postedById: userId,
                postedAt: new Date(),
                checksum,
                ...(frozenRate ?? {}),
            },
        });
        if (result.count !== 1) {
            throw new ConflictException('Документ уже был изменён другим пользователем');
        }
        return this.getById(companyId, id);
    }

    async cancel(companyId: string, userId: string, id: string, reason: string) {
        const document = await this.getOwnById(companyId, id);
        if (document.status !== AccountingDocumentStatus.POSTED) {
            throw new ConflictException('Отменить можно только проведённый документ');
        }
        if (document.paymentAllocations.length) {
            throw new ConflictException('Сначала снимите распределение платежей с документа');
        }

        await this.periodClosing.checkPeriodNotClosed(
            companyId,
            document.operationDate ?? document.documentDate,
        );
        const result = await this.prisma.accountingDocument.updateMany({
            where: { id, companyId, status: AccountingDocumentStatus.POSTED },
            data: {
                status: AccountingDocumentStatus.CANCELLED,
                cancelledById: userId,
                cancelledAt: new Date(),
                cancellationReason: reason.trim(),
                version: { increment: 1 },
            },
        });
        if (result.count !== 1) {
            throw new ConflictException('Документ уже был изменён другим пользователем');
        }
        return this.getById(companyId, id);
    }


    /**
     * Документ, которым мы вправе распоряжаться.
     *
     * `getById` намеренно шире: доставленный документ видит и получатель.
     * Но менять его — проводить, отменять, удалять — может только тот, кто
     * его выпустил. Без этой проверки получатель добирался бы до защищённого
     * обновления и получал «документ уже изменён другим пользователем»
     * вместо честного «не найден»: сообщение про чужую правку там, где на
     * самом деле нет прав, отправляет искать несуществующую проблему.
     */
    private async getOwnById(companyId: string, id: string) {
        const owned = await this.prisma.accountingDocument.findFirst({
            where: { id, companyId },
            select: { id: true },
        });
        if (!owned) throw new NotFoundException('Бухгалтерский документ не найден');
        return this.getById(companyId, id);
    }

    async deleteDraft(companyId: string, id: string) {
        const result = await this.prisma.accountingDocument.deleteMany({
            where: { id, companyId, status: AccountingDocumentStatus.DRAFT },
        });
        if (result.count !== 1) {
            throw new ConflictException('Удалить можно только существующий черновик');
        }
        return { success: true };
    }

    /**
     * Расчётный счёт, с которого выставляется документ.
     *
     * Явно выбранный проверяется на принадлежность организации; без выбора
     * берётся банковский счёт по умолчанию. Если банковских счетов нет —
     * null, и в документе останутся реквизиты из карточки организации
     * (прежнее поведение).
     */
    private async resolveBankAccount(companyId: string, bankAccountId?: string) {
        if (bankAccountId) {
            const account = await this.prisma.financeAccount.findFirst({
                where: { id: bankAccountId, companyId },
                select: BANK_ACCOUNT_SELECT,
            });
            if (!account) throw new NotFoundException('Расчётный счёт не найден');
            if (account.kind !== AccountKind.BANK) {
                throw new BadRequestException('В документе можно указать только банковский счёт, не кассу');
            }
            if (!account.isActive) {
                throw new BadRequestException('Расчётный счёт закрыт, выберите действующий');
            }
            return account;
        }

        return this.prisma.financeAccount.findFirst({
            where: { companyId, kind: AccountKind.BANK, isActive: true },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            select: BANK_ACCOUNT_SELECT,
        });
    }

    /**
     * Реквизиты выбранного счёта поверх реквизитов организации. Пустые поля
     * счёта не затирают карточку компании — у кассы или недозаполненного
     * счёта печатается то, что известно об организации.
     */
    private applyBankAccount(
        company: Prisma.CompanyGetPayload<{ select: typeof COMPANY_SNAPSHOT_SELECT }>,
        account: Prisma.FinanceAccountGetPayload<{ select: typeof BANK_ACCOUNT_SELECT }> | null,
    ) {
        if (!account) return company;
        return {
            ...company,
            bankAccount: account.iban || company.bankAccount,
            bankName: account.bankName || company.bankName,
            bankBic: account.bankBic || company.bankBic,
            kbe: account.kbe || company.kbe,
        };
    }

    /**
     * Кто подписывает документ со стороны компании.
     *
     * Должность раньше была зашита в печатную форму строкой «директор» —
     * у ИП или у компании, где документы подписывает финдиректор, это
     * просто неправда. ФИО берётся из отдельного поля, если подписывает не
     * директор, иначе — директор.
     */
    private signatoryOf(party: {
        signatoryPosition?: string | null;
        signatoryName?: string | null;
        directorName?: string | null;
    }) {
        return {
            position: party.signatoryPosition || null,
            name: party.signatoryName || party.directorName || null,
        };
    }

    private assertDocumentContent(dto: CreateAccountingDocumentDto) {
        if (dto.reportPeriodFrom && dto.reportPeriodTo) {
            if (new Date(dto.reportPeriodFrom) > new Date(dto.reportPeriodTo)) {
                throw new BadRequestException('Начало отчётного периода позже его окончания');
            }
        } else if (dto.reportPeriodFrom || dto.reportPeriodTo) {
            throw new BadRequestException('Укажите обе границы отчётного периода');
        }

        if (dto.type === AccountingDocumentType.RECONCILIATION_ACT) {
            if (!dto.reportPeriodFrom || !dto.reportPeriodTo) {
                throw new BadRequestException('Для акта сверки обязателен отчётный период');
            }
            if (dto.lines?.length) {
                throw new BadRequestException('Акт сверки должен содержать строки взаиморасчётов, а не строки услуг');
            }
        } else {
            if (!dto.lines?.length) {
                throw new BadRequestException('Счёт или акт должен содержать хотя бы одну строку');
            }
            if (dto.reconciliationLines?.length) {
                throw new BadRequestException('Строки взаиморасчётов допустимы только в акте сверки');
            }
        }
    }

    private splitLedgerDocument(value: string) {
        const match = value.match(/^(.*?)\s+№\s*(.+)$/u);
        return match
            ? { type: match[1].trim(), number: match[2].trim() }
            : { type: value.trim(), number: undefined };
    }

    private utcDateString(value: Date) {
        return new Date(value).toISOString().slice(0, 10);
    }

    /**
     * Условие «эта заявка относится к сторонам документа и в подходящем
     * статусе». Один и тот же фильтр используют подбор заявок и проверка при
     * сохранении — иначе в списке подбора появлялись бы заявки, которые
     * сервер потом отказывается принимать.
     */
    private billableOrdersWhere(
        companyId: string,
        document: Pick<CreateAccountingDocumentDto, 'type' | 'direction' | 'counterpartyId'>,
    ): Prisma.OrderWhereInput {
        const statusFilter = document.type === AccountingDocumentType.SERVICE_ACT
            ? { equals: OrderStatus.COMPLETED }
            : { notIn: [OrderStatus.DRAFT, OrderStatus.PENDING, OrderStatus.CANCELLED] };
        const participantFilter = document.direction === AccountingDocumentDirection.OUTGOING
            ? {
                customerCompanyId: document.counterpartyId,
                OR: [
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { responsibleManager: { companyId } },
                ],
            }
            : {
                AND: [
                    { OR: [{ partnerId: document.counterpartyId }, { subForwarderId: document.counterpartyId }] },
                    { OR: [{ customerCompanyId: companyId }, { forwarderId: companyId }] },
                ],
            };
        return { status: statusFilter, ...participantFilter };
    }

    private async assertOrdersAccessible(
        companyId: string,
        dto: Pick<CreateAccountingDocumentDto, 'type' | 'direction' | 'counterpartyId'>,
        orderIds: string[],
    ) {
        if (!orderIds.length) return;
        if (dto.type === AccountingDocumentType.RECONCILIATION_ACT) {
            throw new BadRequestException('Акт сверки не связывается с отдельными заявками');
        }

        const count = await this.prisma.order.count({
            where: {
                id: { in: orderIds },
                ...this.billableOrdersWhere(companyId, dto),
            },
        });
        if (count !== orderIds.length) {
            throw new BadRequestException('Некоторые заявки недоступны, имеют неверный статус или не относятся к сторонам документа');
        }
    }

    /**
     * «Подобрать по заявкам» — список рейсов контрагента, на которые счёт ещё
     * не выставлен. Аналог одноимённой кнопки в 1С.
     *
     * Уже выставленным считается рейс, попавший в непогашенный документ того
     * же вида и направления; отменённый документ рейс освобождает — иначе
     * ошибочно выставленный счёт навсегда блокировал бы перевыставление.
     */
    async listBillableOrders(
        companyId: string,
        query: BillableOrdersQueryDto,
    ) {
        if (query.counterpartyId === companyId) {
            throw new BadRequestException('Организация и контрагент должны отличаться');
        }

        const type = query.type ?? AccountingDocumentType.PAYMENT_INVOICE;
        if (type === AccountingDocumentType.RECONCILIATION_ACT) {
            throw new BadRequestException('Акт сверки не связывается с отдельными заявками');
        }
        const document = { type, direction: query.direction, counterpartyId: query.counterpartyId };

        // Без флага — только завершённые: по ним услуга оказана. С флагом
        // добавляются рейсы в работе, чтобы выставить счёт на аванс. Для акта
        // флаг игнорируется — актировать неоказанную услугу нельзя.
        const statusFilter = query.includeInProgress && type === AccountingDocumentType.PAYMENT_INVOICE
            ? this.billableOrdersWhere(companyId, document).status
            : { equals: OrderStatus.COMPLETED };

        const orders = await this.prisma.order.findMany({
            where: {
                ...this.billableOrdersWhere(companyId, document),
                status: statusFilter,
                accountingDocuments: {
                    none: {
                        document: {
                            companyId,
                            type,
                            direction: query.direction,
                            status: { not: AccountingDocumentStatus.CANCELLED },
                        },
                    },
                },
            },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                createdAt: true,
                cargoDescription: true,
                currency: true,
                customerPrice: true,
                driverCost: true,
                subForwarderPrice: true,
                subForwarderId: true,
                vatRate: true,
                hasVat: true,
                executorVatRate: true,
                executorHasVat: true,
                assignedDriverName: true,
                assignedDriverPlate: true,
                // Прицеп и марка машины идут в наименование услуги: заказчик
                // сверяет строку счёта со своей заявкой по машине и дате, а не
                // по нашему номеру рейса.
                assignedDriverTrailer: true,
                vehicle: { select: { model: true } },
                // Марка машины. В заявке хранится снимок водителя — имя,
                // телефон, госномер, прицеп, — а марки среди них нет, и в
                // счёте графа «авт.» оставалась пустой. Берём из карточки
                // водителя: в документ она попадёт текстом и там застынет.
                driver: { select: { vehicleModel: true } },
                // Номер этой перевозки в системе заказчика и то, как он у
                // него называется. Печатается в строке счёта, если заказчик
                // этого просит: свой счёт он сверяет именно по нему.
                customerRefNumber: true,
                customerCompany: { select: { customerRefLabel: true, customerRefPrintInvoice: true } },
                routePoints: {
                    orderBy: { sequence: 'asc' },
                    select: {
                        pointType: true,
                        sequence: true,
                        // Дата погрузки — из первой точки маршрута.
                        expectedDate: true,
                        location: { select: { city: true, address: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });

        // Схема НДС компании. При экспедиторской счёт клиенту делится на
        // возмещение расходов и вознаграждение, и НДС берётся только со
        // второго — значит подбору нужна ещё и стоимость перевозчика.
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { vatScheme: true },
        });
        const forwarding = company?.vatScheme === 'FORWARDING';

        // Сумма и НДС зависят от того, кому выставляем: заказчику идёт его
        // цена и его ставка, поставщику — стоимость исполнителя.
        return orders.map((order) => {
            const outgoing = query.direction === AccountingDocumentDirection.OUTGOING;
            const amount = outgoing
                ? order.customerPrice
                : order.subForwarderId === query.counterpartyId
                    ? order.subForwarderPrice
                    : order.driverCost;
            const hasVat = outgoing ? order.hasVat : order.executorHasVat;
            const vatRate = outgoing ? order.vatRate : order.executorVatRate;
            // Сколько по этому рейсу уходит перевозчику. Нужно только своему
            // счёту клиенту: во входящем счёте делить нечего.
            const carrierCost = order.subForwarderId
                ? order.subForwarderPrice
                : order.driverCost;
            return {
                ...order,
                amount: amount ?? new Prisma.Decimal(0),
                hasVat,
                vatRate: hasVat ? vatRate : new Prisma.Decimal(0),
                carrierCost: outgoing ? (carrierCost ?? new Prisma.Decimal(0)) : new Prisma.Decimal(0),
                forwardingVat: forwarding && outgoing,
                // Номер перевозки у заказчика — только если он просил
                // печатать его в счёте.
                customerRefLabel: order.customerCompany?.customerRefPrintInvoice
                    ? order.customerCompany.customerRefLabel
                    : null,
                driverVehicleModel: order.driver?.vehicleModel ?? null,
            };
        });
    }



    // ==================== ДОСТАВКА КОНТРАГЕНТУ ====================

    /**
     * Отправить документ контрагенту на платформе.
     *
     * До сих пор счёт от компании А компании Б у Б не появлялся — она
     * заводила его руками. Один документ существовал дважды, с разными
     * номерами и суммами, набранными на слух, и сверка превращалась в спор,
     * чей вариант правильный.
     *
     * Здесь документ остаётся ОДИН: получателю открывается доступ на чтение
     * к той же строке. Копий не создаётся.
     *
     * Компании сопоставляются по БИН: в справочнике контрагент — это наша
     * копия чужой организации, с настоящим арендатором платформы она никак
     * не связана. Не нашли арендатора с таким БИН — отправлять некуда, и об
     * этом надо сказать прямо, а не молчать: остаётся публичная ссылка.
     */
    async sendToCounterparty(companyId: string, userId: string, id: string) {
        const document = await this.prisma.accountingDocument.findFirst({
            where: { id, companyId },
            select: {
                id: true, number: true, status: true, sentAt: true,
                counterparty: { select: { id: true, name: true, bin: true } },
            },
        });
        if (!document) throw new NotFoundException('Документ не найден');

        // Черновик не отправляется: он ещё меняется, и у контрагента
        // светились бы наши недоделанные суммы.
        if (document.status !== AccountingDocumentStatus.POSTED) {
            throw new BadRequestException(
                'Отправить можно только проведённый документ — черновик ещё меняется',
            );
        }
        if (document.sentAt) {
            throw new BadRequestException('Документ уже отправлен контрагенту');
        }
        if (!document.counterparty?.bin) {
            throw new BadRequestException(
                'У контрагента не заполнен БИН — по нему ищется его организация на платформе',
            );
        }

        const recipient = await this.findPlatformCompanyByBin(document.counterparty.bin, companyId);
        if (!recipient) {
            throw new BadRequestException(
                `Организация с БИН ${document.counterparty.bin} на платформе не зарегистрирована. ` +
                'Отправьте документ на почту — письмо со ссылкой работает без учётной записи',
            );
        }

        return this.prisma.accountingDocument.update({
            where: { id },
            data: {
                recipientCompanyId: recipient.id,
                sentAt: new Date(),
                sentById: userId,
                // Прошлое решение получателя не переносится: документ он ещё
                // не видел.
                receiptStatus: null,
                receiptReason: null,
                receiptAt: null,
                receiptById: null,
            },
            include: { recipientCompany: { select: { id: true, name: true, bin: true } } },
        });
    }

    /**
     * Данные для отправки документа почтой — без записи в базу.
     *
     * Кабинет есть не у всех, а счёт нужен всем. Отдельный шаг «проверить и
     * собрать» нужен для того, чтобы документ не оказался помеченным
     * отправленным, если письмо не ушло: у почты бывает свой отказ, и тогда
     * контрагент не получил ничего, а у нас написано «отправлено».
     */
    async emailDeliveryInfo(companyId: string, id: string) {
        const document = await this.prisma.accountingDocument.findFirst({
            where: { id, companyId },
            select: {
                id: true, number: true, type: true, total: true, status: true, sentAt: true,
                shareToken: true, shareRevokedAt: true,
                counterparty: { select: { name: true, email: true } },
                company: { select: { name: true } },
            },
        });
        if (!document) throw new NotFoundException('Документ не найден');
        if (document.status !== AccountingDocumentStatus.POSTED) {
            throw new BadRequestException(
                'Отправить можно только проведённый документ — черновик ещё меняется',
            );
        }
        if (document.sentAt) {
            throw new BadRequestException('Документ уже отправлен контрагенту');
        }
        if (document.shareRevokedAt) {
            throw new BadRequestException(
                'Ссылка на документ отозвана. Выпустите её заново — иначе письмо приведёт в никуда',
            );
        }

        return {
            token: document.shareToken,
            number: document.number,
            total: Number(document.total ?? 0),
            senderName: document.company?.name || 'LogiCore',
            counterpartyName: document.counterparty?.name || null,
            counterpartyEmail: document.counterparty?.email || null,
        };
    }

    /** Отметить, что документ ушёл почтой. Вызывается после самой отправки. */
    async markSentByEmail(companyId: string, userId: string, id: string) {
        const updated = await this.prisma.accountingDocument.updateMany({
            where: { id, companyId, sentAt: null },
            data: { sentAt: new Date(), sentById: userId },
        });
        if (updated.count === 0) {
            throw new BadRequestException('Документ уже отправлен контрагенту');
        }
        return { ok: true };
    }

    /**
     * Есть ли на платформе организация с таким БИН.
     *
     * Ищется настоящий арендатор, а не справочная копия: у копии (isExternal)
     * нет ни сотрудников, ни входа, доставлять ей некуда. Своя же компания
     * исключается — документ самому себе не отправляют.
     */
    private async findPlatformCompanyByBin(bin: string, exceptCompanyId: string) {
        return this.prisma.company.findFirst({
            where: {
                bin,
                isExternal: false,
                id: { not: exceptCompanyId },
            },
            select: { id: true, name: true, bin: true },
        });
    }

    /**
     * Можно ли отправить документ и кому — для кнопки в карточке.
     *
     * Заодно отдаёт, что с отправленным документом уже стало: без этого
     * отправитель нажимал «Отправить» и больше ничего не узнавал — ни что
     * документ дошёл, ни что его отклонили и по какой причине.
     */
    async deliveryTarget(companyId: string, id: string) {
        const document = await this.prisma.accountingDocument.findFirst({
            where: { id, companyId },
            select: {
                status: true, sentAt: true,
                receiptStatus: true, receiptReason: true, receiptAt: true,
                counterparty: { select: { name: true, bin: true } },
                recipientCompany: { select: { id: true, name: true, bin: true } },
            },
        });
        if (!document) throw new NotFoundException('Документ не найден');

        const sent = document.sentAt
            ? {
                at: document.sentAt,
                to: document.recipientCompany,
                status: document.receiptStatus,
                reason: document.receiptReason,
                reviewedAt: document.receiptAt,
            }
            : null;

        if (!document.counterparty?.bin) {
            return {
                available: false, reason: 'У контрагента не заполнен БИН', recipient: null, sent,
            };
        }
        const recipient = await this.findPlatformCompanyByBin(document.counterparty.bin, companyId);
        if (!recipient) {
            return {
                available: false,
                reason: 'Контрагент не зарегистрирован на платформе — отправьте ссылкой',
                recipient: null,
                sent,
            };
        }
        return {
            available: document.status === AccountingDocumentStatus.POSTED && !document.sentAt,
            reason: document.sentAt
                ? 'Уже отправлен'
                : document.status !== AccountingDocumentStatus.POSTED
                    ? 'Сначала проведите документ'
                    : null,
            recipient,
            sent,
        };
    }

    /**
     * Решение получателя по входящему документу: принять или отклонить.
     *
     * Править чужой документ нельзя — он принадлежит выпустившей стороне.
     * Отклонение с причиной, потому что «отклонено» без объяснения означает
     * телефонный звонок, а он и так был до платформы.
     */
    async reviewIncoming(
        companyId: string,
        userId: string,
        id: string,
        decision: 'ACCEPTED' | 'REJECTED',
        reason?: string,
    ) {
        const document = await this.prisma.accountingDocument.findFirst({
            where: { id, recipientCompanyId: companyId },
            select: { id: true, receiptStatus: true },
        });
        if (!document) throw new NotFoundException('Входящий документ не найден');

        if (decision === 'REJECTED' && !reason?.trim()) {
            throw new BadRequestException('Укажите причину отклонения — контрагенту нужно знать, что исправить');
        }

        return this.prisma.accountingDocument.update({
            where: { id },
            data: {
                receiptStatus: decision,
                receiptReason: decision === 'REJECTED' ? reason!.trim() : null,
                receiptAt: new Date(),
                receiptById: userId,
            },
        });
    }

    /** Документы, доставленные нам контрагентами с платформы. */
    async listIncomingDelivered(companyId: string, query: { status?: string } = {}) {
        return this.prisma.accountingDocument.findMany({
            where: {
                recipientCompanyId: companyId,
                sentAt: { not: null },
                ...(query.status === 'PENDING' ? { receiptStatus: null } : {}),
                ...(query.status === 'ACCEPTED' || query.status === 'REJECTED'
                    ? { receiptStatus: query.status }
                    : {}),
            },
            orderBy: [{ sentAt: 'desc' }],
            take: 200,
            select: {
                id: true, number: true, type: true, documentDate: true, dueDate: true,
                currency: true, total: true, receiptStatus: true, receiptReason: true,
                sentAt: true,
                company: { select: { id: true, name: true, bin: true } },
            },
        });
    }

    // ==================== НУМЕРАЦИЯ ДОКУМЕНТОВ ====================

    /**
     * Настройки нумерации на год: префикс, следующий номер, длина числа.
     *
     * Отдаются все виды документов сразу, даже те, по которым ещё ничего не
     * заводили: настроить нумерацию нужно ДО первого документа, иначе первый
     * счёт уедет со старым номером и переименовать его будет уже нельзя.
     * Поэтому несуществующие строки показываются значениями по умолчанию, а
     * не прячутся.
     */
    async getNumberingSettings(companyId: string, year?: number) {
        const targetYear = year || new Date().getUTCFullYear();

        const [saved, counts] = await Promise.all([
            this.prisma.accountingDocumentNumbering.findMany({
                where: { companyId, year: targetYear },
            }),
            this.prisma.accountingDocument.groupBy({
                by: ['type', 'direction'],
                where: { companyId },
                _count: { _all: true },
            }),
        ]);

        const savedByKey = new Map(saved.map((row) => [`${row.type}__${row.direction}`, row]));
        const countByKey = new Map(counts.map((row) => [`${row.type}__${row.direction}`, row._count._all]));

        const rows: Array<{
            type: AccountingDocumentType;
            direction: AccountingDocumentDirection;
            year: number;
            prefix: string;
            nextNumber: number;
            padLength: number;
            /** Как будет выглядеть следующий номер. */
            example: string;
            /** Сколько документов этого вида уже заведено. */
            documents: number;
        }> = [];

        for (const type of NUMBERED_TYPES) {
            for (const direction of NUMBERED_DIRECTIONS) {
                const key = `${type}__${direction}`;
                const row = savedByKey.get(key);
                const prefix = row?.prefix ?? defaultNumberPrefix(type, targetYear);
                const nextNumber = row?.nextNumber ?? 1;
                const padLength = row?.padLength ?? 6;
                rows.push({
                    type, direction, year: targetYear,
                    prefix, nextNumber, padLength,
                    example: formatDocumentNumber(prefix, nextNumber, padLength),
                    documents: countByKey.get(key) ?? 0,
                });
            }
        }

        return { year: targetYear, rows };
    }

    /**
     * Сохранить нумерацию.
     *
     * Главная защита — от повтора номера. Номер документа уникален в пределах
     * компании и вида, и если бухгалтер отмотает счётчик назад, следующий счёт
     * не создастся вовсе: пользователь увидит ошибку базы на ровном месте.
     * Поэтому занятость проверяется здесь, до сохранения, и в отказе сразу
     * назван свободный номер.
     */
    async updateNumberingSettings(companyId: string, dto: UpdateNumberingDto) {
        const year = dto.year || new Date().getUTCFullYear();
        const prefix = (dto.prefix ?? '').trim();
        const padLength = dto.padLength ?? 6;
        const nextNumber = dto.nextNumber ?? 1;

        if (padLength < 1 || padLength > 12) {
            throw new BadRequestException('Количество цифр — от 1 до 12');
        }
        if (nextNumber < 1) {
            throw new BadRequestException('Следующий номер не может быть меньше единицы');
        }

        const candidate = formatDocumentNumber(prefix, nextNumber, padLength);
        const taken = await this.prisma.accountingDocument.findFirst({
            where: { companyId, type: dto.type, direction: dto.direction, number: candidate },
            select: { id: true },
        });
        if (taken) {
            const free = await this.firstFreeNumber(companyId, dto.type, dto.direction, prefix, padLength, nextNumber);
            throw new BadRequestException(
                `Номер ${candidate} уже занят другим документом. Свободный с этого места — ${free}`,
            );
        }

        return this.prisma.accountingDocumentNumbering.upsert({
            where: {
                companyId_type_direction_year: {
                    companyId, type: dto.type, direction: dto.direction, year,
                },
            },
            create: { companyId, type: dto.type, direction: dto.direction, year, prefix, nextNumber, padLength },
            update: { prefix, nextNumber, padLength },
        });
    }

    /** Первый свободный номер начиная с указанного — чтобы отказ был с подсказкой. */
    private async firstFreeNumber(
        companyId: string,
        type: AccountingDocumentType,
        direction: AccountingDocumentDirection,
        prefix: string,
        padLength: number,
        from: number,
    ) {
        const used = await this.prisma.accountingDocument.findMany({
            where: { companyId, type, direction, number: { startsWith: prefix } },
            select: { number: true },
        });
        const taken = new Set(used.map((row) => row.number));
        let candidate = from;
        // Потолок намеренный: перебирать миллион номеров ради подсказки не
        // стоит, а до него дело не дойдёт ни в одной живой базе.
        for (let i = 0; i < 10000; i++) {
            const value = formatDocumentNumber(prefix, candidate, padLength);
            if (!taken.has(value)) return value;
            candidate += 1;
        }
        return formatDocumentNumber(prefix, candidate, padLength);
    }

    private async nextNumber(
        tx: Prisma.TransactionClient,
        companyId: string,
        type: AccountingDocumentType,
        direction: AccountingDocumentDirection,
        year: number,
    ) {
        const numbering = await tx.accountingDocumentNumbering.upsert({
            where: { companyId_type_direction_year: { companyId, type, direction, year } },
            create: {
                companyId,
                type,
                direction,
                year,
                prefix: defaultNumberPrefix(type, year),
                nextNumber: 2,
            },
            update: { nextNumber: { increment: 1 } },
        });
        const allocated = numbering.nextNumber - 1;
        return formatDocumentNumber(numbering.prefix, allocated, numbering.padLength);
    }

    private assertStoredDocumentCanBePosted(document: Awaited<ReturnType<AccountingDocumentsService['getById']>>) {
        if (document.type === AccountingDocumentType.RECONCILIATION_ACT) {
            if (!document.reportPeriodFrom || !document.reportPeriodTo) {
                throw new BadRequestException('У акта сверки не заполнен отчётный период');
            }
        } else if (!document.lines.length) {
            throw new BadRequestException('Документ не содержит строк');
        }
        if (document.total.lt(0) || document.balanceDue.lt(0)) {
            throw new BadRequestException('Итог документа не может быть отрицательным');
        }
    }

    private checksum(document: Awaited<ReturnType<AccountingDocumentsService['getById']>>) {
        const immutablePayload = {
            id: document.id,
            companyId: document.companyId,
            counterpartyId: document.counterpartyId,
            type: document.type,
            direction: document.direction,
            number: document.number,
            externalNumber: document.externalNumber,
            documentDate: document.documentDate,
            operationDate: document.operationDate,
            currency: document.currency,
            // Курс — часть документа, а не справка: по нему считаются отчёты
            // и по нему же он должен остаться неизменным.
            exchangeRate: document.exchangeRate,
            exchangeRateDate: document.exchangeRateDate,
            subtotal: document.subtotal,
            vatTotal: document.vatTotal,
            total: document.total,
            issuerSnapshot: document.issuerSnapshot,
            recipientSnapshot: document.recipientSnapshot,
            lines: document.lines,
            reconciliationLines: document.reconciliationLines,
        };
        return createHash('sha256').update(JSON.stringify(immutablePayload)).digest('hex');
    }
}
