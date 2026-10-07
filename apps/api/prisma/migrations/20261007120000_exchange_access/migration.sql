-- Доступ к бирже по компаниям: пока биржу проверяют, она открыта только
-- отмеченным компаниям и водителям их парков.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "exchangeAccess" BOOLEAN NOT NULL DEFAULT false;
