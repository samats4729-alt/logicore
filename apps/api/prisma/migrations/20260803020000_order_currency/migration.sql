-- Учётная валюта компании и валюты в заявке.
--
-- Только добавление колонок. У всех существующих компаний учётной валютой
-- становится тенге, у всех существующих заявок обе валюты — тенге, то есть
-- поведение не меняется ни на копейку.
--
-- Почему валют у заявки две. Российский заказчик платит рублями, а
-- казахстанский перевозчик хочет тенге — это обычный рейс. Пока валюты
-- совпадают, «120 минус 100» ещё что-то значит; как только разошлись, маржу
-- можно считать только в учётной валюте, и для этого рядом хранятся
-- пересчитанные суммы.
--
-- Пересчёт хранится, а не считается на лету: отчёты складывают тысячи
-- заявок, и поход за курсом на каждую строку сделал бы их неподъёмными.

ALTER TABLE "Company" ADD COLUMN "baseCurrency" VARCHAR(3) NOT NULL DEFAULT 'KZT';

ALTER TABLE "Order" ADD COLUMN "driverCostCurrency" VARCHAR(3) NOT NULL DEFAULT 'KZT';
ALTER TABLE "Order" ADD COLUMN "customerPriceBase" DECIMAL(18,2);
ALTER TABLE "Order" ADD COLUMN "driverCostBase" DECIMAL(18,2);
ALTER TABLE "Order" ADD COLUMN "currencyRateDate" DATE;

-- Существующие заявки уже в тенге: пересчёт равен самой сумме. Проставляем
-- явно, чтобы отчёты могли опираться на одну колонку и не разбирать, где
-- пересчёт есть, а где его ещё не делали.
UPDATE "Order"
SET "customerPriceBase" = "customerPrice",
    "driverCostBase" = "driverCost"
WHERE "currency" = 'KZT';
