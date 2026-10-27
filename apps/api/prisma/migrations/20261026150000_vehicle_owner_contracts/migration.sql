-- Договоры парка с владельцами машин (задачи шефа, Q9, решение владельца 25.10.2026).
-- Только новая таблица: существующие таблицы и данные не меняются.

-- CreateTable
CREATE TABLE "ExchangeVehicleOwnerContract" (
    "id" TEXT NOT NULL,
    "parkCompanyId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ownerKind" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerIinBin" TEXT,
    "ownerIdNumber" TEXT,
    "ownerIdIssuedBy" TEXT,
    "ownerIdIssuedAt" DATE,
    "ownerAddress" TEXT,
    "ownerPhone" TEXT,
    "ownerIban" TEXT,
    "ownerBank" TEXT,
    "ownerBankBic" TEXT,
    "ownerSigner" TEXT,
    "vehicleModel" TEXT,
    "vehiclePlate" TEXT NOT NULL,
    "vehicleRegNumber" TEXT,
    "rentAmount" DECIMAL(14,2) NOT NULL,
    "rentBasis" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "signedFileUrl" TEXT,
    "signedFileName" TEXT,
    "signedFileMime" TEXT,
    "signedFileSize" INTEGER,
    "signedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeVehicleOwnerContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeVehicleOwnerContract_parkCompanyId_driverId_idx" ON "ExchangeVehicleOwnerContract"("parkCompanyId", "driverId");

-- CreateIndex
CREATE INDEX "ExchangeVehicleOwnerContract_driverId_idx" ON "ExchangeVehicleOwnerContract"("driverId");

-- AddForeignKey
ALTER TABLE "ExchangeVehicleOwnerContract" ADD CONSTRAINT "ExchangeVehicleOwnerContract_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

