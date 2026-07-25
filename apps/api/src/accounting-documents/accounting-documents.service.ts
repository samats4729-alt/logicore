import {
    BadRequestException,
    ConflictException,
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
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PeriodClosingService } from '../accounting/services/period-closing.service';
import type { FinancialReportsService } from '../accounting/services/financial-reports.service';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';
import { toNum } from '../common/utils/money';
import {
    AccountingDocumentListQueryDto,
    BillableOrdersQueryDto,
    CreateAccountingDocumentDto,
    GenerateReconciliationDraftDto,
    UpdateAccountingDocumentDto,
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
    ) {}

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
        const issuerSnapshot = dto.direction === AccountingDocumentDirection.OUTGOING ? ownSnapshot : counterparty;
        const recipientSnapshot = dto.direction === AccountingDocumentDirection.OUTGOING ? counterparty : ownSnapshot;
        const lineCalculation = dto.type === AccountingDocumentType.RECONCILIATION_ACT
            ? null
            : this.calculator.calculateLines(dto.lines ?? []);
        const reconciliationCalculation = dto.type === AccountingDocumentType.RECONCILIATION_ACT
            ? this.calculator.calculateReconciliation(dto.openingBalance, dto.reconciliationLines ?? [])
            : null;
        const documentDate = new Date(dto.documentDate);

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
                    basisSnapshot: contract
                        ? {
                            contractId: contract.id,
                            contractNumber: contract.contractNumber,
                            status: contract.status,
                            startDate: contract.startDate?.toISOString() ?? null,
                            endDate: contract.endDate?.toISOString() ?? null,
                        }
                        : undefined,
                    paymentPurposeCode: dto.paymentPurposeCode?.trim() || null,
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

    async list(companyId: string, query: AccountingDocumentListQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 30;
        const where: Prisma.AccountingDocumentWhereInput = {
            companyId,
            type: query.type,
            direction: query.direction,
            status: query.status,
            counterpartyId: query.counterpartyId,
            documentDate: query.from || query.to
                ? {
                    gte: query.from ? new Date(query.from) : undefined,
                    lte: query.to ? new Date(query.to) : undefined,
                }
                : undefined,
        };
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

    async getById(companyId: string, id: string) {
        const document = await this.prisma.accountingDocument.findFirst({
            where: { id, companyId },
            include: CARD_DOCUMENT_INCLUDE,
        });
        if (!document) throw new NotFoundException('Бухгалтерский документ не найден');
        return document;
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
            snapshots = {
                bankAccountId: bankAccount?.id ?? null,
                issuerSnapshot: (outgoing ? ownSnapshot : counterparty) as Prisma.InputJsonValue,
                recipientSnapshot: (outgoing ? counterparty : ownSnapshot) as Prisma.InputJsonValue,
            };
        }

        const lineCalculation = dto.lines ? this.calculator.calculateLines(dto.lines) : null;
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
        const document = await this.getById(companyId, id);
        if (document.status !== AccountingDocumentStatus.DRAFT) {
            throw new ConflictException('Провести можно только документ в статусе «Черновик»');
        }

        await this.periodClosing.checkPeriodNotClosed(
            companyId,
            document.operationDate ?? document.documentDate,
        );
        this.assertStoredDocumentCanBePosted(document);
        const checksum = this.checksum(document);

        const result = await this.prisma.accountingDocument.updateMany({
            where: { id, companyId, status: AccountingDocumentStatus.DRAFT },
            data: {
                status: AccountingDocumentStatus.POSTED,
                postedById: userId,
                postedAt: new Date(),
                checksum,
            },
        });
        if (result.count !== 1) {
            throw new ConflictException('Документ уже был изменён другим пользователем');
        }
        return this.getById(companyId, id);
    }

    async cancel(companyId: string, userId: string, id: string, reason: string) {
        const document = await this.getById(companyId, id);
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

        const document = {
            type: AccountingDocumentType.PAYMENT_INVOICE,
            direction: query.direction,
            counterpartyId: query.counterpartyId,
        };
        // Без флага — только завершённые: по ним услуга оказана. С флагом
        // добавляются рейсы в работе, чтобы выставить счёт на аванс.
        const statusFilter = query.includeInProgress
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
                            type: AccountingDocumentType.PAYMENT_INVOICE,
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
                routePoints: {
                    orderBy: { sequence: 'asc' },
                    select: {
                        pointType: true,
                        sequence: true,
                        location: { select: { city: true, address: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });

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
            return {
                ...order,
                amount: amount ?? new Prisma.Decimal(0),
                hasVat,
                vatRate: hasVat ? vatRate : new Prisma.Decimal(0),
            };
        });
    }

    private async nextNumber(
        tx: Prisma.TransactionClient,
        companyId: string,
        type: AccountingDocumentType,
        direction: AccountingDocumentDirection,
        year: number,
    ) {
        const defaultPrefix = {
            [AccountingDocumentType.PAYMENT_INVOICE]: 'СЧ',
            [AccountingDocumentType.SERVICE_ACT]: 'АКТ',
            [AccountingDocumentType.RECONCILIATION_ACT]: 'СВ',
            [AccountingDocumentType.CORRECTION]: 'КОР',
        }[type];
        const numbering = await tx.accountingDocumentNumbering.upsert({
            where: { companyId_type_direction_year: { companyId, type, direction, year } },
            create: {
                companyId,
                type,
                direction,
                year,
                prefix: `${defaultPrefix}-${year}-`,
                nextNumber: 2,
            },
            update: { nextNumber: { increment: 1 } },
        });
        const allocated = numbering.nextNumber - 1;
        return `${numbering.prefix}${String(allocated).padStart(numbering.padLength, '0')}`;
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
