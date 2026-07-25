-- AlterTable
ALTER TABLE "AccountingDocument" ADD COLUMN     "bankAccountId" TEXT;

-- AlterTable
ALTER TABLE "FinanceAccount" ADD COLUMN     "bankBic" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "kbe" TEXT;

-- AddForeignKey
ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
