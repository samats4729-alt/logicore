-- G6, владелец 25.10.2026: история версий и предложения правок текста договора.
-- Только добавление: новая колонка со значением по умолчанию и две новые таблицы.
-- CreateEnum
CREATE TYPE "ContractProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'OUTDATED');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "contentVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ContractRevision" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "authorCompanyId" TEXT,
    "authorUserId" TEXT,
    "authorName" TEXT,
    "note" TEXT,
    "proposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractProposal" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "summary" TEXT,
    "status" "ContractProposalStatus" NOT NULL DEFAULT 'PENDING',
    "proposedByCompanyId" TEXT NOT NULL,
    "proposedByUserId" TEXT,
    "proposedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByCompanyId" TEXT,
    "decidedByUserId" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "ContractProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractRevision_contractId_idx" ON "ContractRevision"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractRevision_contractId_version_key" ON "ContractRevision"("contractId", "version");

-- CreateIndex
CREATE INDEX "ContractProposal_contractId_status_idx" ON "ContractProposal"("contractId", "status");

-- AddForeignKey
ALTER TABLE "ContractRevision" ADD CONSTRAINT "ContractRevision_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractProposal" ADD CONSTRAINT "ContractProposal_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

