-- AlterTable
ALTER TABLE "OneCConnection" ADD COLUMN     "receiveCounterparties" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receivePayments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendActs" BOOLEAN NOT NULL DEFAULT true;

