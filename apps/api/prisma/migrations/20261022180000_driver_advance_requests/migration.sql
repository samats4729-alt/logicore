-- Запросы водителя парка на топливо и аванс (задачи шефа, Q17). Только новая таблица и поле с долей по умолчанию.
-- AlterTable
ALTER TABLE "ParkPayoutRates" ADD COLUMN     "advanceLimitPct" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "DriverAdvanceRequest" (
    "id" TEXT NOT NULL,
    "parkCompanyId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "parkNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "issuedAmount" DECIMAL(18,2),
    "fuelIssueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverAdvanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverAdvanceRequest_parkCompanyId_status_idx" ON "DriverAdvanceRequest"("parkCompanyId", "status");

-- CreateIndex
CREATE INDEX "DriverAdvanceRequest_driverId_idx" ON "DriverAdvanceRequest"("driverId");

-- CreateIndex
CREATE INDEX "DriverAdvanceRequest_orderId_idx" ON "DriverAdvanceRequest"("orderId");

-- AddForeignKey
ALTER TABLE "DriverAdvanceRequest" ADD CONSTRAINT "DriverAdvanceRequest_parkCompanyId_fkey" FOREIGN KEY ("parkCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAdvanceRequest" ADD CONSTRAINT "DriverAdvanceRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAdvanceRequest" ADD CONSTRAINT "DriverAdvanceRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

