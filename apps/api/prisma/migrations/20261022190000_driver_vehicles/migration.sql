-- Тягачи и прицепы водителя биржи (задачи шефа, R4). Только новая таблица.
-- CreateTable
CREATE TABLE "ExchangeDriverVehicle" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "model" TEXT,
    "bodyType" TEXT,
    "capacityKg" INTEGER,
    "regNumber" TEXT,
    "isOwn" BOOLEAN NOT NULL DEFAULT true,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeDriverVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeDriverVehicle_driverId_idx" ON "ExchangeDriverVehicle"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeDriverVehicle_driverId_kind_plate_key" ON "ExchangeDriverVehicle"("driverId", "kind", "plate");

-- AddForeignKey
ALTER TABLE "ExchangeDriverVehicle" ADD CONSTRAINT "ExchangeDriverVehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

