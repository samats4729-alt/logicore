-- Договор-заявка перестаёт быть единственным документом рейса со снимком:
-- доверенность версионируется тем же механизмом. Таблица обобщается —
-- добавляется вид документа, а уникальность версии считается внутри вида.

CREATE TYPE "OrderDocumentKind" AS ENUM ('CONTRACT', 'POWER_OF_ATTORNEY');

ALTER TABLE "OrderContractDocument" RENAME TO "OrderDocument";

ALTER TABLE "OrderDocument" RENAME CONSTRAINT "OrderContractDocument_pkey" TO "OrderDocument_pkey";
ALTER TABLE "OrderDocument" RENAME CONSTRAINT "OrderContractDocument_companyId_fkey" TO "OrderDocument_companyId_fkey";
ALTER TABLE "OrderDocument" RENAME CONSTRAINT "OrderContractDocument_orderId_fkey" TO "OrderDocument_orderId_fkey";
ALTER TABLE "OrderDocument" RENAME CONSTRAINT "OrderContractDocument_createdById_fkey" TO "OrderDocument_createdById_fkey";

-- Всё, что уже сохранено, — договоры-заявки.
ALTER TABLE "OrderDocument" ADD COLUMN "kind" "OrderDocumentKind" NOT NULL DEFAULT 'CONTRACT';
ALTER TABLE "OrderDocument" ALTER COLUMN "kind" DROP DEFAULT;

DROP INDEX "OrderContractDocument_orderId_version_key";
DROP INDEX "OrderContractDocument_companyId_createdAt_idx";

CREATE UNIQUE INDEX "OrderDocument_orderId_kind_version_key" ON "OrderDocument"("orderId", "kind", "version");
CREATE INDEX "OrderDocument_companyId_kind_createdAt_idx" ON "OrderDocument"("companyId", "kind", "createdAt");
