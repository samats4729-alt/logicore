-- Сформированный договор-заявка со снимком данных заявки.
--
-- Подписанный документ не должен меняться, если заявку потом правят.
-- Изменилась сумма — формируется новая версия, прежняя остаётся в истории.
-- Своего номера у документа нет: в печатной форме стоит номер заявки.
CREATE TABLE "OrderContractDocument" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "orderId"     TEXT NOT NULL,
    "version"     INTEGER NOT NULL,
    "snapshot"    JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderContractDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderContractDocument_orderId_version_key"
    ON "OrderContractDocument" ("orderId", "version");
CREATE INDEX "OrderContractDocument_companyId_createdAt_idx"
    ON "OrderContractDocument" ("companyId", "createdAt");

ALTER TABLE "OrderContractDocument"
    ADD CONSTRAINT "OrderContractDocument_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "OrderContractDocument_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "OrderContractDocument_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
