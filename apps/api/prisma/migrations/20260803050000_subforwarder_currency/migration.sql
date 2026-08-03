-- Своя валюта у ставки суб-экспедитора.
--
-- Только добавление двух колонок.
--
-- До этого ставка суб-экспедитора была единственной суммой заявки без своей
-- валюты: она молча следовала за валютой заявки. Стоило перевести заявку в
-- доллары — и ставка перевозчика, которую никто не трогал, становилась
-- «столько же, но в долларах». У ставки заказчика и ставки водителя такой
-- проблемы нет: у каждой своя валюта и свой пересчёт.
--
-- Существующим заявкам проставляется валюта самой заявки: именно так их и
-- понимали до сих пор, и переписывать смысл задним числом нельзя.

ALTER TABLE "Order" ADD COLUMN "subForwarderPriceCurrency" VARCHAR(3);
ALTER TABLE "Order" ADD COLUMN "subForwarderPriceBase" DECIMAL(20,2);

UPDATE "Order"
SET "subForwarderPriceCurrency" = COALESCE("currency", 'KZT')
WHERE "subForwarderPrice" IS NOT NULL;

-- Тенговые ставки пересчёта не требуют: тенге к тенге всегда один.
UPDATE "Order"
SET "subForwarderPriceBase" = "subForwarderPrice"
WHERE "subForwarderPrice" IS NOT NULL
  AND COALESCE("subForwarderPriceCurrency", 'KZT') = 'KZT';
