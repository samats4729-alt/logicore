-- Расчёт водителя без ИП (15.10.2026): НДС парка, подтверждение бухгалтером,
-- комиссия парка по умолчанию 10 %. Только новые поля и новое значение по умолчанию.

-- AlterTable
ALTER TABLE "ParkPayoutRates" ALTER COLUMN "commissionPct" SET DEFAULT 10,
ADD COLUMN     "vatPayer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vatPct" DECIMAL(5,2) NOT NULL DEFAULT 16,
ADD COLUMN     "ratesConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "ratesConfirmedById" TEXT;

-- AlterTable
ALTER TABLE "ExchangeTripSettlement" ADD COLUMN     "vat" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "preliminary" BOOLEAN NOT NULL DEFAULT true;
