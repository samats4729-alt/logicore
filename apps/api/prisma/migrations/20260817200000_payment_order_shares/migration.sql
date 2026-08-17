-- Один платёж — много заявок.
--
-- Так платят заказчики: приходит один перевод, и в нём сидят два десятка
-- рейсов. Платёж умел ссылаться ровно на одну заявку, поэтому закрыть
-- двадцать можно было только двадцатью записями — и выписка банка после
-- этого не сходилась со списком платежей ни по одной строке.
--
-- Доля хранится в валюте платежа и отдельно в тенге по курсу дня оплаты,
-- зафиксированному в самом платеже: пересчёт задним числом менял бы уже
-- закрытые месяцы при каждом движении курса.
CREATE TABLE "PaymentOrderShare" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "amountBase" DECIMAL(20,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentOrderShare_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentOrderShare_orderId_idx" ON "PaymentOrderShare"("orderId");

-- Одна доля на пару «платёж — заявка»: две доли по одной заявке означали бы
-- двойную оплату одного и того же рейса.
CREATE UNIQUE INDEX "PaymentOrderShare_paymentId_orderId_key" ON "PaymentOrderShare"("paymentId", "orderId");

ALTER TABLE "PaymentOrderShare" ADD CONSTRAINT "PaymentOrderShare_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentOrderShare" ADD CONSTRAINT "PaymentOrderShare_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
