-- Биржа на заявках: заявку без исполнителя выставляют на биржу.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "exchangeCloseReason" TEXT,
ADD COLUMN     "exchangeClosedAt" TIMESTAMP(3),
ADD COLUMN     "exchangeNote" TEXT,
ADD COLUMN     "exchangePrice" DECIMAL(18,2),
ADD COLUMN     "exchangePublishedAt" TIMESTAMP(3),
ADD COLUMN     "exchangePublishedById" TEXT;

-- CreateIndex
CREATE INDEX "Order_exchangePublishedAt_exchangeClosedAt_idx" ON "Order"("exchangePublishedAt", "exchangeClosedAt");
