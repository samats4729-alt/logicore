-- Расчёт рейса водителя парка (владелец, 12.10.2026): водитель называет сумму
-- на руки вместе с топливом, парк досчитывает налоги и комиссии сверху.
-- Расстояние маршрута, расчёт в отклике и в рейсе, топливо (выдано парком и
-- чеки водителя), поля выплат под новый расчёт, настройки парка (топливо на км,
-- вычет по ИПН). Только новое — ничего не удаляется и не переименовывается.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "exchangeDistanceKm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ExchangeOffer" ADD COLUMN     "calc" JSONB,
ADD COLUMN     "driverTotal" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "ParkPayoutRates" ADD COLUMN     "applyDeduction" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deductionMrp" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "fuelPerKm" DECIMAL(10,2) NOT NULL DEFAULT 100,
ADD COLUMN     "mrp" INTEGER NOT NULL DEFAULT 4325;

-- AlterTable
ALTER TABLE "DriverPayout" ADD COLUMN     "fuelIssued" DECIMAL(18,2),
ADD COLUMN     "toPay" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "DriverPayoutItem" ADD COLUMN     "driverTotal" DECIMAL(18,2),
ADD COLUMN     "fuelIssued" DECIMAL(18,2),
ADD COLUMN     "fuelReceipts" DECIMAL(18,2),
ADD COLUMN     "toPay" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "ExchangeTripSettlement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "parkCompanyId" TEXT NOT NULL,
    "taxMonth" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "fuelPerKm" DECIMAL(10,2) NOT NULL,
    "fuelEstimate" DECIMAL(18,2) NOT NULL,
    "driverTotal" DECIMAL(18,2) NOT NULL,
    "workNet" DECIMAL(18,2) NOT NULL,
    "gross" DECIMAL(18,2) NOT NULL,
    "opv" DECIMAL(18,2) NOT NULL,
    "vosms" DECIMAL(18,2) NOT NULL,
    "ipn" DECIMAL(18,2) NOT NULL,
    "so" DECIMAL(18,2) NOT NULL,
    "parkCost" DECIMAL(18,2) NOT NULL,
    "platformFee" DECIMAL(18,2) NOT NULL,
    "parkFee" DECIMAL(18,2) NOT NULL,
    "customerPrice" DECIMAL(18,2) NOT NULL,
    "deductionApplied" BOOLEAN NOT NULL,
    "deductionAmount" DECIMAL(18,2) NOT NULL,
    "rates" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeTripSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeFuelIssue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "parkCompanyId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeFuelIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeFuelReceipt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "parkCompanyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeFuelReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeTripSettlement_orderId_key" ON "ExchangeTripSettlement"("orderId");

-- CreateIndex
CREATE INDEX "ExchangeTripSettlement_driverId_taxMonth_idx" ON "ExchangeTripSettlement"("driverId", "taxMonth");

-- CreateIndex
CREATE INDEX "ExchangeTripSettlement_parkCompanyId_idx" ON "ExchangeTripSettlement"("parkCompanyId");

-- CreateIndex
CREATE INDEX "ExchangeFuelIssue_orderId_idx" ON "ExchangeFuelIssue"("orderId");

-- CreateIndex
CREATE INDEX "ExchangeFuelIssue_parkCompanyId_idx" ON "ExchangeFuelIssue"("parkCompanyId");

-- CreateIndex
CREATE INDEX "ExchangeFuelReceipt_orderId_idx" ON "ExchangeFuelReceipt"("orderId");

-- CreateIndex
CREATE INDEX "ExchangeFuelReceipt_parkCompanyId_status_idx" ON "ExchangeFuelReceipt"("parkCompanyId", "status");

-- CreateIndex
CREATE INDEX "ExchangeFuelReceipt_driverId_idx" ON "ExchangeFuelReceipt"("driverId");

-- AddForeignKey
ALTER TABLE "ExchangeTripSettlement" ADD CONSTRAINT "ExchangeTripSettlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeTripSettlement" ADD CONSTRAINT "ExchangeTripSettlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeFuelIssue" ADD CONSTRAINT "ExchangeFuelIssue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeFuelReceipt" ADD CONSTRAINT "ExchangeFuelReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeFuelReceipt" ADD CONSTRAINT "ExchangeFuelReceipt_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

