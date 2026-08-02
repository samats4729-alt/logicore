-- Запросы на расчёт стоимости перевозки.
--
-- Этап между «клиент спросил» и заявкой. Хранит обе цены (почём нашли
-- машину и что предложили клиенту) и исход — согласовал клиент или нет.
-- Ради исхода всё и заводится: без него менеджер через два дня называет
-- ту же цену, на которую уже отказали.
--
-- Миграция только добавляет: новый тип и две таблицы. Существующие
-- таблицы не меняются, данные не трогаются.

-- CreateEnum
CREATE TYPE "QuoteRequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerCompanyId" TEXT NOT NULL,
    "originCityId" TEXT NOT NULL,
    "destinationCityId" TEXT NOT NULL,
    "readyDate" TIMESTAMP(3),
    "cargoDescription" TEXT,
    "natureOfCargo" TEXT,
    "cargoType" TEXT,
    "cargoWeight" DOUBLE PRECISION,
    "cargoVolume" DOUBLE PRECISION,
    "carrierCost" DECIMAL(18,2),
    "customerPrice" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "quotedAt" TIMESTAMP(3),
    "quotedById" TEXT,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'NEW',
    "rejectionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequestNumbering" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'ЗПР-',
    "padding" INTEGER NOT NULL DEFAULT 5,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequestNumbering_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_requestNumber_key" ON "QuoteRequest"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_orderId_key" ON "QuoteRequest"("orderId");

-- CreateIndex
CREATE INDEX "QuoteRequest_companyId_status_idx" ON "QuoteRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "QuoteRequest_customerCompanyId_originCityId_destinationCity_idx" ON "QuoteRequest"("customerCompanyId", "originCityId", "destinationCityId");

-- CreateIndex
CREATE INDEX "QuoteRequest_companyId_originCityId_destinationCityId_idx" ON "QuoteRequest"("companyId", "originCityId", "destinationCityId");

-- CreateIndex
CREATE INDEX "QuoteRequest_createdAt_idx" ON "QuoteRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequestNumbering_companyId_key" ON "QuoteRequestNumbering"("companyId");

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_originCityId_fkey" FOREIGN KEY ("originCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_destinationCityId_fkey" FOREIGN KEY ("destinationCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequestNumbering" ADD CONSTRAINT "QuoteRequestNumbering_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

