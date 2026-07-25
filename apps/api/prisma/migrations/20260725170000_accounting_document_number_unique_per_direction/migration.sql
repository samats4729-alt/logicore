-- Номера бухгалтерских документов выдаются отдельными последовательностями
-- для исходящих и входящих (AccountingDocumentNumbering ключуется по
-- companyId+type+direction+year). Прежняя уникальность направление не
-- учитывала, из-за чего первый входящий счёт сталкивался с исходящим
-- «СЧ-2026-000001» и не создавался вовсе.
DROP INDEX IF EXISTS "AccountingDocument_companyId_type_number_key";

CREATE UNIQUE INDEX "AccountingDocument_companyId_type_direction_number_key"
    ON "AccountingDocument" ("companyId", "type", "direction", "number");
