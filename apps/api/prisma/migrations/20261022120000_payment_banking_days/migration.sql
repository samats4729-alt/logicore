-- Отсрочка в банковских днях (задачи шефа, F3; «да» владельца 22.10.2026).
-- Только новые поля. По умолчанию — календарные дни, как было.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "carrierPaymentBanking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customerPaymentBanking" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "carrierPaymentBanking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customerPaymentBanking" BOOLEAN NOT NULL DEFAULT false;
