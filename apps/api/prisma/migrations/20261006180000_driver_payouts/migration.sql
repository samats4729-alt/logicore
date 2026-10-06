-- Деньги водителей парка: ставки удержаний, выплаты и строки по рейсам, счёт водителя.

-- CreateEnum
CREATE TYPE "DriverPayoutStatus" AS ENUM ('REQUESTED', 'EXPORTED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "ExchangeDriver" ADD COLUMN     "payoutBank" TEXT,
ADD COLUMN     "payoutIban" TEXT;

-- CreateTable
CREATE TABLE "ParkPayoutRates" (
    "id" TEXT NOT NULL,
    "parkCompanyId" TEXT NOT NULL,
    "commissionPct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "opvPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "vosmsPct" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "ipnPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "soPct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkPayoutRates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPayout" (
    "id" TEXT NOT NULL,
    "parkCompanyId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "DriverPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "gross" DECIMAL(18,2) NOT NULL,
    "commission" DECIMAL(18,2) NOT NULL,
    "opv" DECIMAL(18,2) NOT NULL,
    "vosms" DECIMAL(18,2) NOT NULL,
    "ipn" DECIMAL(18,2) NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,
    "so" DECIMAL(18,2) NOT NULL,
    "iban" TEXT,
    "bank" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exportedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPayoutItem" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "gross" DECIMAL(18,2) NOT NULL,
    "commission" DECIMAL(18,2) NOT NULL,
    "opv" DECIMAL(18,2) NOT NULL,
    "vosms" DECIMAL(18,2) NOT NULL,
    "ipn" DECIMAL(18,2) NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,
    "so" DECIMAL(18,2) NOT NULL,
    "commissionPct" DECIMAL(5,2) NOT NULL,
    "opvPct" DECIMAL(5,2) NOT NULL,
    "vosmsPct" DECIMAL(5,2) NOT NULL,
    "ipnPct" DECIMAL(5,2) NOT NULL,
    "soPct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "DriverPayoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParkPayoutRates_parkCompanyId_key" ON "ParkPayoutRates"("parkCompanyId");

-- CreateIndex
CREATE INDEX "DriverPayout_parkCompanyId_status_idx" ON "DriverPayout"("parkCompanyId", "status");

-- CreateIndex
CREATE INDEX "DriverPayout_driverId_idx" ON "DriverPayout"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPayoutItem_orderId_key" ON "DriverPayoutItem"("orderId");

-- CreateIndex
CREATE INDEX "DriverPayoutItem_payoutId_idx" ON "DriverPayoutItem"("payoutId");

-- AddForeignKey
ALTER TABLE "ParkPayoutRates" ADD CONSTRAINT "ParkPayoutRates_parkCompanyId_fkey" FOREIGN KEY ("parkCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayout" ADD CONSTRAINT "DriverPayout_parkCompanyId_fkey" FOREIGN KEY ("parkCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayout" ADD CONSTRAINT "DriverPayout_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayoutItem" ADD CONSTRAINT "DriverPayoutItem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "DriverPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayoutItem" ADD CONSTRAINT "DriverPayoutItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

