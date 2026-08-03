-- Валюта у денег: счета, кассы, платежи и курсовые разницы.
--
-- Только добавление колонок — ни одна существующая не меняется и не
-- удаляется. Всё, что было заведено раньше, было в тенге, поэтому старым
-- записям проставляется тенге и курс 1: тенге к тенге всегда один.
--
-- Зачем это нужно. Счёт выставили на 1 000 USD по курсу 473 — записали
-- выручку 473 000 ₸. Деньги пришли по 480 — на счёт легло 480 000 ₸. Долг
-- закрыт полностью, но в тенге пришло на 7 000 больше. Эти 7 000 — курсовая
-- разница, и она обязана лежать отдельно: смешаешь её с выручкой — отчёт
-- разойдётся с банком, выбросишь — не сойдётся баланс.

-- Валюта счёта/кассы. Один счёт — одна валюта: валютный счёт в банке
-- физически хранит доллары, и класть на него тенге нельзя.
ALTER TABLE "FinanceAccount" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KZT';

-- Валюта платежа и курс на дату платежа. Курс сохраняется в самом платеже:
-- завтра он другой, но этот платёж обязан навсегда остаться вчерашним.
ALTER TABLE "Payment" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KZT';
ALTER TABLE "Payment" ADD COLUMN "exchangeRate" DECIMAL(18,6);
ALTER TABLE "Payment" ADD COLUMN "exchangeRateDate" DATE;
ALTER TABLE "Payment" ADD COLUMN "amountBase" DECIMAL(20,2);

UPDATE "Payment" SET "amountBase" = "amount", "exchangeRate" = 1 WHERE "currency" = 'KZT';

-- Разнесение платежа на счёт: сколько тенге на это ушло и какая курсовая
-- разница при этом возникла. Разница считается один раз — в момент
-- погашения — и больше не пересчитывается, иначе прошлый месяц менялся бы
-- сам по себе при каждом движении курса.
ALTER TABLE "AccountingPaymentAllocation" ADD COLUMN "amountBase" DECIMAL(20,2);
ALTER TABLE "AccountingPaymentAllocation" ADD COLUMN "exchangeDiff" DECIMAL(20,2);

UPDATE "AccountingPaymentAllocation" SET "amountBase" = "amount", "exchangeDiff" = 0;

CREATE INDEX "Payment_companyId_currency_idx" ON "Payment"("companyId", "currency");
