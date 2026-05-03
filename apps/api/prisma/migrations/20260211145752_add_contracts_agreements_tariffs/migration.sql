-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "appliedTariffId" TEXT;

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "customerCompanyId" TEXT NOT NULL,
    "forwarderCompanyId" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplementaryAgreement" (
    "id" TEXT NOT NULL,
    "agreementNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplementaryAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteTariff" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "priceType" "PriceType" NOT NULL DEFAULT 'FIXED',
    "vehicleType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteTariff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_customerCompanyId_idx" ON "Contract"("customerCompanyId");

-- CreateIndex
CREATE INDEX "Contract_forwarderCompanyId_idx" ON "Contract"("forwarderCompanyId");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_customerCompanyId_forwarderCompanyId_contractNumbe_key" ON "Contract"("customerCompanyId", "forwarderCompanyId", "contractNumber");

-- CreateIndex
CREATE INDEX "SupplementaryAgreement_contractId_idx" ON "SupplementaryAgreement"("contractId");

-- CreateIndex
CREATE INDEX "SupplementaryAgreement_status_idx" ON "SupplementaryAgreement"("status");

-- CreateIndex
CREATE INDEX "RouteTariff_agreementId_idx" ON "RouteTariff"("agreementId");

-- CreateIndex
CREATE INDEX "RouteTariff_originCity_destinationCity_idx" ON "RouteTariff"("originCity", "destinationCity");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_appliedTariffId_fkey" FOREIGN KEY ("appliedTariffId") REFERENCES "RouteTariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_forwarderCompanyId_fkey" FOREIGN KEY ("forwarderCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplementaryAgreement" ADD CONSTRAINT "SupplementaryAgreement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteTariff" ADD CONSTRAINT "RouteTariff_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SupplementaryAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
