-- Договор водителя с парком (владелец, 09.10.2026): адрес прописки, марка и
-- модель машины, номер техпаспорта — в анкету; подписанные экземпляры
-- договора — отдельной таблицей с замороженным текстом. Только новое —
-- ничего не удаляется и не переименовывается.

-- AlterTable
ALTER TABLE "ExchangeDriver" ADD COLUMN     "registrationAddress" TEXT,
ADD COLUMN     "vehicleModel" TEXT,
ADD COLUMN     "vehicleRegNumber" TEXT;

-- CreateTable
CREATE TABLE "ExchangeDriverContract" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "parkCompanyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "signedDevice" TEXT,
    "signedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeDriverContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeDriverContract_driverId_signedAt_idx" ON "ExchangeDriverContract"("driverId", "signedAt");

-- CreateIndex
CREATE INDEX "ExchangeDriverContract_parkCompanyId_idx" ON "ExchangeDriverContract"("parkCompanyId");

-- AddForeignKey
ALTER TABLE "ExchangeDriverContract" ADD CONSTRAINT "ExchangeDriverContract_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

