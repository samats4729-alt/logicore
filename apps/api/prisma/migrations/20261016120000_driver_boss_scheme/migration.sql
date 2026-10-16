-- Схема шефа (16.10.2026): топливо по литрам и сезону, прогрессивный ИПН,
-- заявление водителя на вычет, заявка на удаление аккаунта, схема расчёта рейса.
-- Только новые поля.

-- AlterTable
ALTER TABLE "ExchangeDriver" ADD COLUMN     "deductionRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deductionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ExchangeTripSettlement" ADD COLUMN     "base" DECIMAL(18,2),
ADD COLUMN     "ipnBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "scheme" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ParkPayoutRates" ADD COLUMN     "fuelConsumption" DECIMAL(6,2) NOT NULL DEFAULT 30,
ADD COLUMN     "fuelPriceSummer" DECIMAL(10,2) NOT NULL DEFAULT 350,
ADD COLUMN     "fuelPriceWinter" DECIMAL(10,2),
ADD COLUMN     "fuelSeason" TEXT NOT NULL DEFAULT 'SUMMER',
ADD COLUMN     "ipnHighPct" DECIMAL(5,2) NOT NULL DEFAULT 15,
ADD COLUMN     "ipnThresholdMrp" INTEGER NOT NULL DEFAULT 8500;

