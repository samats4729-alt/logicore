-- Подтверждение компании владельцем платформы.
--
-- БИН в РК — публичные данные, поэтому ввод БИН ничего не доказывает.
-- Компания допускается к работе только после проверки документов человеком.
CREATE TYPE "CompanyVerificationStatus" AS ENUM ('DRAFT', 'PENDING', 'VERIFIED', 'REJECTED');

ALTER TYPE "DocumentType" ADD VALUE 'COMPANY_REGISTRATION';
ALTER TYPE "DocumentType" ADD VALUE 'DIRECTOR_APPOINTMENT';
ALTER TYPE "DocumentType" ADD VALUE 'DIRECTOR_ID';

ALTER TABLE "Company"
    ADD COLUMN "verificationStatus" "CompanyVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "verificationSubmittedAt" TIMESTAMP(3),
    ADD COLUMN "verifiedAt" TIMESTAMP(3),
    ADD COLUMN "verifiedById" TEXT,
    ADD COLUMN "rejectionReason" TEXT;

-- Уже заведённые компании считаем подтверждёнными: они появились до
-- введения проверки, и запирать их задним числом нельзя — иначе рабочая
-- база и тестовые данные разом перестанут работать.
UPDATE "Company" SET "verificationStatus" = 'VERIFIED', "verifiedAt" = NOW();

ALTER TABLE "Company"
    ADD CONSTRAINT "Company_verifiedById_fkey"
    FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Company_verificationStatus_idx" ON "Company" ("verificationStatus");
