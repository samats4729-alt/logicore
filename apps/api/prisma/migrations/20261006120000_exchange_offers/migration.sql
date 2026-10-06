-- Отклики перевозчиков и водителей на заявки биржи.

-- CreateEnum
CREATE TYPE "ExchangeOfferStatus" AS ENUM ('ACTIVE', 'WITHDRAWN', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "ExchangeOffer" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT,
    "companyId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "ExchangeOfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "price" DECIMAL(18,2) NOT NULL,
    "agreed" BOOLEAN NOT NULL DEFAULT false,
    "readyDate" DATE,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeOffer_orderId_status_idx" ON "ExchangeOffer"("orderId", "status");

-- CreateIndex
CREATE INDEX "ExchangeOffer_driverId_idx" ON "ExchangeOffer"("driverId");

-- CreateIndex
CREATE INDEX "ExchangeOffer_companyId_idx" ON "ExchangeOffer"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeOffer_orderId_driverId_key" ON "ExchangeOffer"("orderId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeOffer_orderId_companyId_key" ON "ExchangeOffer"("orderId", "companyId");

-- AddForeignKey
ALTER TABLE "ExchangeOffer" ADD CONSTRAINT "ExchangeOffer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeOffer" ADD CONSTRAINT "ExchangeOffer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeOffer" ADD CONSTRAINT "ExchangeOffer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
