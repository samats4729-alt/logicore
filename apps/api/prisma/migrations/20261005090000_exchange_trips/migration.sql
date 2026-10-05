-- AlterTable
ALTER TABLE "ExchangeLoad" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "loadedAt" TIMESTAMP(3),
ADD COLUMN     "takenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExchangeLoadDecline" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "afterTaking" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeLoadDecline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeLoadDecline_driverId_idx" ON "ExchangeLoadDecline"("driverId");

-- CreateIndex
CREATE INDEX "ExchangeLoadDecline_loadId_idx" ON "ExchangeLoadDecline"("loadId");

-- CreateIndex
CREATE INDEX "ExchangeLoad_driverId_status_idx" ON "ExchangeLoad"("driverId", "status");

-- AddForeignKey
ALTER TABLE "ExchangeLoad" ADD CONSTRAINT "ExchangeLoad_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeLoadDecline" ADD CONSTRAINT "ExchangeLoadDecline_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "ExchangeLoad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeLoadDecline" ADD CONSTRAINT "ExchangeLoadDecline_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

