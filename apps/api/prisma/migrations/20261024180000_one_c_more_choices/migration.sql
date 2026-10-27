-- Обмен с 1С: акты перевозчиков и договоры в 1С, оплаты перевозчикам из 1С (решение владельца 24.10.2026).
-- AlterTable
ALTER TABLE "OneCConnection" ADD COLUMN     "receiveCarrierPayments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendCarrierActs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendContracts" BOOLEAN NOT NULL DEFAULT false;
