-- Анкета водителя биржи (задачи владельца от 09.10.2026): удостоверение
-- личности, дата рождения из ИИН и согласие на обработку персональных
-- данных. Только новые поля — ничего не удаляется и не переименовывается.

-- AlterTable
ALTER TABLE "ExchangeDriver" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "idExpiresAt" DATE,
ADD COLUMN     "idIssuedAt" DATE,
ADD COLUMN     "idIssuedBy" TEXT,
ADD COLUMN     "idNumber" TEXT;
