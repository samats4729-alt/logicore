-- CreateEnum
CREATE TYPE "ExchangeLoadStatus" AS ENUM ('OPEN', 'TAKEN', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ExchangeLoad" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "ExchangeLoadStatus" NOT NULL DEFAULT 'OPEN',
    "originCityId" TEXT,
    "originCityName" TEXT NOT NULL,
    "originCityKey" TEXT NOT NULL,
    "originAddress" TEXT,
    "destinationCityId" TEXT,
    "destinationCityName" TEXT NOT NULL,
    "destinationCityKey" TEXT NOT NULL,
    "destinationAddress" TEXT,
    "loadingDate" DATE NOT NULL,
    "loadingTime" TEXT,
    "bodyType" TEXT NOT NULL,
    "cargoDescription" TEXT NOT NULL,
    "weightKg" INTEGER,
    "volumeM3" DECIMAL(10,2),
    "requirements" TEXT,
    "price" DECIMAL(18,2) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeLoad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeLoadPhoto" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeLoadPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeLoad_seq_key" ON "ExchangeLoad"("seq");

-- CreateIndex
CREATE INDEX "ExchangeLoad_companyId_status_idx" ON "ExchangeLoad"("companyId", "status");

-- CreateIndex
CREATE INDEX "ExchangeLoad_status_loadingDate_idx" ON "ExchangeLoad"("status", "loadingDate");

-- CreateIndex
CREATE INDEX "ExchangeLoad_originCityKey_destinationCityKey_idx" ON "ExchangeLoad"("originCityKey", "destinationCityKey");

-- CreateIndex
CREATE INDEX "ExchangeLoadPhoto_loadId_idx" ON "ExchangeLoadPhoto"("loadId");

-- AddForeignKey
ALTER TABLE "ExchangeLoad" ADD CONSTRAINT "ExchangeLoad_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeLoad" ADD CONSTRAINT "ExchangeLoad_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeLoad" ADD CONSTRAINT "ExchangeLoad_originCityId_fkey" FOREIGN KEY ("originCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeLoad" ADD CONSTRAINT "ExchangeLoad_destinationCityId_fkey" FOREIGN KEY ("destinationCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeLoadPhoto" ADD CONSTRAINT "ExchangeLoadPhoto_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "ExchangeLoad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

