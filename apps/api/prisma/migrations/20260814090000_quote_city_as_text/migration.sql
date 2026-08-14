-- Города запроса пишутся текстом, справочник только подсказывает.
--
-- До этого город выбирался строго из списка, и компания не смогла завести
-- запрос на Мынарал: посёлка нет в справочнике, потому что справочник
-- наполняется геокодером. Ссылка на справочник остаётся — по ней работают
-- годовые тарифы, — но перестаёт быть обязательной.

ALTER TABLE "QuoteRequest" ALTER COLUMN "originCityId" DROP NOT NULL;
ALTER TABLE "QuoteRequest" ALTER COLUMN "destinationCityId" DROP NOT NULL;

ALTER TABLE "QuoteRequest" ADD COLUMN "originCityName" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN "originCityKey" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN "destinationCityName" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN "destinationCityKey" TEXT;

-- Прежние запросы получают название из справочника: иначе на экране у них
-- пропадёт маршрут, хотя ссылка на город никуда не делась.
UPDATE "QuoteRequest" q
SET "originCityName" = c."name",
    "originCityKey" = btrim(regexp_replace(lower(replace(c."name", 'ё', 'е')), '[-.,;:/\\]+|\s+', ' ', 'g'))
FROM "City" c
WHERE c."id" = q."originCityId";

UPDATE "QuoteRequest" q
SET "destinationCityName" = c."name",
    "destinationCityKey" = btrim(regexp_replace(lower(replace(c."name", 'ё', 'е')), '[-.,;:/\\]+|\s+', ' ', 'g'))
FROM "City" c
WHERE c."id" = q."destinationCityId";

CREATE INDEX "QuoteRequest_companyId_originCityKey_destinationCityKey_idx"
    ON "QuoteRequest" ("companyId", "originCityKey", "destinationCityKey");
