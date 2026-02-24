-- AlterTable
ALTER TABLE "User" ADD COLUMN     "docExpiresAt" TIMESTAMP(3),
ADD COLUMN     "docIssuedAt" TIMESTAMP(3),
ADD COLUMN     "docIssuedBy" TEXT,
ADD COLUMN     "docNumber" TEXT,
ADD COLUMN     "docType" TEXT;
