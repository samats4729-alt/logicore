-- Бухгалтерское документное ядро (добавочная безопасная фаза).
-- Существующие Invoice, Payment, Income, Expense и FinanceOperation не меняются.
-- Миграция только создаёт новые типы/таблицы; переключение API и бэкфилл выполняются
-- отдельными этапами после резервной копии и сверки production-данных.

-- CreateEnum
CREATE TYPE "AccountingDocumentType" AS ENUM (
    'PAYMENT_INVOICE',
    'SERVICE_ACT',
    'RECONCILIATION_ACT',
    'CORRECTION'
);

CREATE TYPE "AccountingDocumentDirection" AS ENUM ('INCOMING', 'OUTGOING');

CREATE TYPE "AccountingDocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

CREATE TYPE "AccountingDocumentLinkType" AS ENUM (
    'BASED_ON',
    'CORRECTS',
    'REPLACES',
    'RECONCILES'
);

CREATE TYPE "AccountingVatTreatment" AS ENUM (
    'WITHOUT_VAT',
    'STANDARD',
    'ZERO',
    'EXEMPT'
);

-- CreateTable
CREATE TABLE "AccountingDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "type" "AccountingDocumentType" NOT NULL,
    "direction" "AccountingDocumentDirection" NOT NULL,
    "status" "AccountingDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "number" TEXT NOT NULL,
    "externalNumber" TEXT,
    "externalDate" DATE,
    "documentDate" DATE NOT NULL,
    "operationDate" DATE,
    "dueDate" DATE,
    "reportPeriodFrom" DATE,
    "reportPeriodTo" DATE,
    "contractId" TEXT,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'KZT',
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "vatTotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(20,2),
    "debitTurnover" DECIMAL(20,2),
    "creditTurnover" DECIMAL(20,2),
    "closingBalance" DECIMAL(20,2),
    "issuerSnapshot" JSONB NOT NULL,
    "recipientSnapshot" JSONB NOT NULL,
    "issuerSignatorySnapshot" JSONB,
    "recipientSignatorySnapshot" JSONB,
    "basisSnapshot" JSONB,
    "paymentPurposeCode" TEXT,
    "paymentTerms" TEXT,
    "customerMaterialsInfo" TEXT,
    "appendixInfo" TEXT,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "checksum" VARCHAR(64),
    "pdfFileUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingDocument_distinct_parties_check" CHECK ("companyId" <> "counterpartyId"),
    CONSTRAINT "AccountingDocument_version_check" CHECK ("version" > 0),
    CONSTRAINT "AccountingDocument_report_period_check" CHECK (
        "reportPeriodFrom" IS NULL
        OR "reportPeriodTo" IS NULL
        OR "reportPeriodFrom" <= "reportPeriodTo"
    )
);

CREATE TABLE "AccountingDocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "serviceCode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceDate" DATE,
    "reportDetails" TEXT,
    "quantity" DECIMAL(20,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(32) NOT NULL DEFAULT 'усл',
    "unitCode" TEXT,
    "unitPrice" DECIMAL(20,2) NOT NULL,
    "subtotal" DECIMAL(20,2) NOT NULL,
    "discountAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "vatTreatment" "AccountingVatTreatment" NOT NULL DEFAULT 'WITHOUT_VAT',
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingDocumentLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingDocumentLine_number_check" CHECK ("lineNumber" > 0),
    CONSTRAINT "AccountingDocumentLine_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "AccountingDocumentLine_vat_rate_check" CHECK ("vatRate" >= 0 AND "vatRate" <= 100)
);

CREATE TABLE "AccountingReconciliationLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "transactionDate" DATE NOT NULL,
    "sourceDocumentType" TEXT,
    "sourceDocumentNumber" TEXT,
    "description" TEXT,
    "debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "runningBalance" DECIMAL(20,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingReconciliationLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingReconciliationLine_number_check" CHECK ("lineNumber" > 0)
);

CREATE TABLE "AccountingDocumentOrder" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingDocumentOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingPaymentAllocation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPaymentAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingPaymentAllocation_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "AccountingDocumentLink" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "targetDocumentId" TEXT NOT NULL,
    "type" "AccountingDocumentLinkType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingDocumentLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingDocumentLink_distinct_documents_check" CHECK ("sourceDocumentId" <> "targetDocumentId")
);

CREATE TABLE "AccountingDocumentNumbering" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "AccountingDocumentType" NOT NULL,
    "direction" "AccountingDocumentDirection" NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "padLength" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingDocumentNumbering_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingDocumentNumbering_next_number_check" CHECK ("nextNumber" > 0),
    CONSTRAINT "AccountingDocumentNumbering_pad_length_check" CHECK ("padLength" >= 1 AND "padLength" <= 20)
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDocument_companyId_type_number_key"
    ON "AccountingDocument"("companyId", "type", "number");
CREATE INDEX "AccountingDocument_companyId_documentDate_idx"
    ON "AccountingDocument"("companyId", "documentDate");
CREATE INDEX "AccountingDocument_companyId_status_idx"
    ON "AccountingDocument"("companyId", "status");
CREATE INDEX "AccountingDocument_counterpartyId_documentDate_idx"
    ON "AccountingDocument"("counterpartyId", "documentDate");
CREATE INDEX "AccountingDocument_companyId_counterpartyId_externalNumber_idx"
    ON "AccountingDocument"("companyId", "counterpartyId", "externalNumber");
CREATE INDEX "AccountingDocument_contractId_idx" ON "AccountingDocument"("contractId");

CREATE UNIQUE INDEX "AccountingDocumentLine_documentId_lineNumber_key"
    ON "AccountingDocumentLine"("documentId", "lineNumber");
CREATE INDEX "AccountingDocumentLine_orderId_idx" ON "AccountingDocumentLine"("orderId");

CREATE UNIQUE INDEX "AccountingReconciliationLine_documentId_lineNumber_key"
    ON "AccountingReconciliationLine"("documentId", "lineNumber");
CREATE INDEX "AccountingReconciliationLine_transactionDate_idx"
    ON "AccountingReconciliationLine"("transactionDate");

CREATE UNIQUE INDEX "AccountingDocumentOrder_documentId_orderId_key"
    ON "AccountingDocumentOrder"("documentId", "orderId");
CREATE INDEX "AccountingDocumentOrder_orderId_idx" ON "AccountingDocumentOrder"("orderId");

CREATE UNIQUE INDEX "AccountingPaymentAllocation_documentId_paymentId_key"
    ON "AccountingPaymentAllocation"("documentId", "paymentId");
CREATE INDEX "AccountingPaymentAllocation_paymentId_idx"
    ON "AccountingPaymentAllocation"("paymentId");

CREATE UNIQUE INDEX "AccountingDocumentLink_sourceDocumentId_targetDocumentId_type_key"
    ON "AccountingDocumentLink"("sourceDocumentId", "targetDocumentId", "type");
CREATE INDEX "AccountingDocumentLink_targetDocumentId_idx"
    ON "AccountingDocumentLink"("targetDocumentId");

CREATE UNIQUE INDEX "AccountingDocumentNumbering_companyId_type_direction_year_key"
    ON "AccountingDocumentNumbering"("companyId", "type", "direction", "year");
CREATE INDEX "AccountingDocumentNumbering_companyId_idx"
    ON "AccountingDocumentNumbering"("companyId");

-- AddForeignKey
ALTER TABLE "AccountingDocument"
    ADD CONSTRAINT "AccountingDocument_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingDocument"
    ADD CONSTRAINT "AccountingDocument_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingDocument"
    ADD CONSTRAINT "AccountingDocument_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingDocument"
    ADD CONSTRAINT "AccountingDocument_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingDocument"
    ADD CONSTRAINT "AccountingDocument_postedById_fkey"
    FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingDocument"
    ADD CONSTRAINT "AccountingDocument_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingDocumentLine"
    ADD CONSTRAINT "AccountingDocumentLine_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingDocumentLine"
    ADD CONSTRAINT "AccountingDocumentLine_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingReconciliationLine"
    ADD CONSTRAINT "AccountingReconciliationLine_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountingDocumentOrder"
    ADD CONSTRAINT "AccountingDocumentOrder_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingDocumentOrder"
    ADD CONSTRAINT "AccountingDocumentOrder_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingPaymentAllocation"
    ADD CONSTRAINT "AccountingPaymentAllocation_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "AccountingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingPaymentAllocation"
    ADD CONSTRAINT "AccountingPaymentAllocation_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingPaymentAllocation"
    ADD CONSTRAINT "AccountingPaymentAllocation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingDocumentLink"
    ADD CONSTRAINT "AccountingDocumentLink_sourceDocumentId_fkey"
    FOREIGN KEY ("sourceDocumentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingDocumentLink"
    ADD CONSTRAINT "AccountingDocumentLink_targetDocumentId_fkey"
    FOREIGN KEY ("targetDocumentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountingDocumentNumbering"
    ADD CONSTRAINT "AccountingDocumentNumbering_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
