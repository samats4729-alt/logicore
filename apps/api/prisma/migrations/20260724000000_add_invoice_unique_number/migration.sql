-- Дедупликация перед добавлением ограничения уникальности: до этой миграции
-- номер счёта (invoiceNumber) не был ограничен уникальностью (H-7 из аудита),
-- поэтому на реальных данных у одного эмитента могли уже существовать два
-- счёта одного типа с одинаковым номером. Чтобы миграция не упала на таких
-- данных, помечаем более поздние дубликаты суффиксом — самый ранний счёт
-- в каждой группе (по дате создания) сохраняет исходный номер без изменений.
WITH duplicates AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "issuerId", "invoiceNumber", "type"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "rn"
  FROM "Invoice"
)
UPDATE "Invoice" AS i
SET "invoiceNumber" = i."invoiceNumber" || '-dup' || d."rn"
FROM duplicates d
WHERE i."id" = d."id" AND d."rn" > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_issuerId_invoiceNumber_type_key" ON "Invoice"("issuerId", "invoiceNumber", "type");
