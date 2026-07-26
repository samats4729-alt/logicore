-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundOfId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_refundOfId_idx" ON "Payment"("refundOfId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
