-- Код приглашения парка: водитель попадает в парк по ссылке или коду.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "parkInviteCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_parkInviteCode_key" ON "Company"("parkInviteCode");
