-- Условия перевозки груза: места, штабелирование, температура, ДОПОГ и
-- объявленная стоимость. Это то, что спрашивают в тендерах и без чего
-- перевозчик не может назвать цену.
--
-- Миграция только добавляет столбцы, все они необязательные: существующие
-- заявки остаются валидными и не переписываются.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "placesCount" INTEGER,
ADD COLUMN     "stackable" BOOLEAN,
ADD COLUMN     "tempMin" DOUBLE PRECISION,
ADD COLUMN     "tempMax" DOUBLE PRECISION,
ADD COLUMN     "adr" BOOLEAN,
ADD COLUMN     "adrClass" TEXT,
ADD COLUMN     "cargoValue" DOUBLE PRECISION;
