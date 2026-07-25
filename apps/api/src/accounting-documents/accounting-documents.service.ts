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
    OrderStatus,
    Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PeriodClosingService } from '../accounting/services/period-closing.service';
import type { FinancialReportsService } from '../accounting/services/financial-reports.service';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';
import {
    AccountingDocumentListQueryDto,
    CreateAccountingDocumentDto,
    GenerateReconciliationDraftDto,
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

        const issuerSnapshot = dto.direction === AccountingDocumentDirection.OUTGOING ? company : counterparty;
        const recipientSnapshot = dto.direction === AccountingDocumentDirection.OUTGOING ? counterparty : company;
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
        const [data, total] = await this.prisma.$transaction([
            this.prisma.accountingDocument.findMany({
                where,
                orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    counterparty: { select: { id: true, name: true, bin: true } },
                    _count: { select: { lines: true, reconciliationLines: true, paymentAllocations: true } },
                },
            }),
            this.prisma.accountingDocument.count({ where }),
        ]);
        return { data, total, page, limit };
    }

    async getById(companyId: string, id: string) {
        const document = await this.prisma.accountingDocument.findFirst({
            where: { id, companyId },
            include: DOCUMENT_INCLUDE,
        });
        if (!document) throw new NotFoundException('Бухгалтерский документ не найден');
        return document;
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

    private async assertOrdersAccessible(
        companyId: string,
        dto: CreateAccountingDocumentDto,
        orderIds: string[],
    ) {
        if (!orderIds.length) return;
        if (dto.type === AccountingDocumentType.RECONCILIATION_ACT) {
            throw new BadRequestException('Акт сверки не связывается с отдельными заявками');
        }

        const statusFilter = dto.type === AccountingDocumentType.SERVICE_ACT
            ? { equals: OrderStatus.COMPLETED }
            : { notIn: [OrderStatus.DRAFT, OrderStatus.PENDING, OrderStatus.CANCELLED] };
        const participantFilter = dto.direction === AccountingDocumentDirection.OUTGOING
            ? {
                customerCompanyId: dto.counterpartyId,
                OR: [
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { responsibleManager: { companyId } },
                ],
            }
            : {
                AND: [
                    { OR: [{ partnerId: dto.counterpartyId }, { subForwarderId: dto.counterpartyId }] },
                    { OR: [{ customerCompanyId: companyId }, { forwarderId: companyId }] },
                ],
            };
        const count = await this.prisma.order.count({
            where: {
                id: { in: orderIds },
                status: statusFilter,
                ...participantFilter,
            },
        });
        if (count !== orderIds.length) {
            throw new BadRequestException('Некоторые заявки недоступны, имеют неверный статус или не относятся к сторонам документа');
        }
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
