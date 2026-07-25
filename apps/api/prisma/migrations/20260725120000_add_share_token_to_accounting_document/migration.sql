-- Публичная ссылка на документ + возможность её отозвать.
--
-- shareToken объявлен NOT NULL, а значение по умолчанию у Prisma прикладное
-- (@default(uuid())), поэтому колонка добавляется в три шага: сначала
-- nullable, затем заполняется для уже существующих документов, и только
-- потом становится обязательной. Прямое ADD COLUMN NOT NULL упало бы на
-- любой непустой таблице.

-- AlterTable
ALTER TABLE "AccountingDocument" ADD COLUMN "shareRevokedAt" TIMESTAMP(3);
ALTER TABLE "AccountingDocument" ADD COLUMN "shareToken" TEXT;

UPDATE "AccountingDocument"
SET "shareToken" = gen_random_uuid()::text
WHERE "shareToken" IS NULL;

ALTER TABLE "AccountingDocument" ALTER COLUMN "shareToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDocument_shareToken_key" ON "AccountingDocument"("shareToken");
