-- Фаза 1 (аудит M-8): единая модель финансовых операций FinanceOperation.
-- Только создание таблицы — существующие Payment/Income/Expense не трогаются,
-- ничего не удаляется и не переносится автоматически. Бэкфилл данных выполняется
-- отдельным скриптом prisma/backfill-finance-operations.js после применения миграции.

-- CreateEnum
CREATE TYPE "FinanceOperationSource" AS ENUM ('PAYMENT', 'INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "FinanceOperation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" "FinanceOperationSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT,
    "categoryLabel" TEXT,
    "description" TEXT,
    "note" TEXT,
    "orderId" TEXT,
    "counterpartyId" TEXT,
    "accountId" TEXT,
    "method" "PaymentMethod",
    "createdById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOperation_source_sourceId_key" ON "FinanceOperation"("source", "sourceId");

-- CreateIndex
CREATE INDEX "FinanceOperation_companyId_date_idx" ON "FinanceOperation"("companyId", "date");

-- CreateIndex
CREATE INDEX "FinanceOperation_companyId_isDeleted_idx" ON "FinanceOperation"("companyId", "isDeleted");

-- CreateIndex
CREATE INDEX "FinanceOperation_orderId_idx" ON "FinanceOperation"("orderId");

-- CreateIndex
CREATE INDEX "FinanceOperation_accountId_idx" ON "FinanceOperation"("accountId");

-- CreateIndex
CREATE INDEX "FinanceOperation_categoryId_idx" ON "FinanceOperation"("categoryId");

-- AddForeignKey
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
