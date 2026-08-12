-- Условия расчётов у контрагента и порядок жизни документа по рейсу.
--
-- Только добавление колонок. Ни одна существующая не меняется и не удаляется.
--
-- Задача. Решение «с НДС или без» и срок оплаты принимал тот, кто ведёт рейс:
-- менеджер. Про НДС он не знает, а спросить систему было негде — галочка
-- стояла в каждой заявке заново и по умолчанию была снята, поэтому в
-- договор-заявку молча печаталось «без НДС» и «15 календарных дней». Документ
-- при этом заверялся печатью в один клик и уходил контрагенту уже неправильным.
--
-- Решение из двух частей:
--  1) условия расчётов переезжают к контрагенту — договорились один раз;
--  2) у документа появляются состояния: черновик → проведён → отправлен,
--     и печать возможна только на проведённом.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Карточка контрагента: блок «Расчёты»
-- ─────────────────────────────────────────────────────────────────────────

-- Работает ли контрагент с НДС. NULL — не выяснено, и это НЕ «без НДС»:
-- печатать «без НДС» наугад в документе с печатью нельзя.
ALTER TABLE "Company" ADD COLUMN "vatPayer" BOOLEAN;
ALTER TABLE "Company" ADD COLUMN "vatRate" DECIMAL(5,2);

-- Когда мы выставляем счёт заказчику: AFTER_UNLOAD | AFTER_ORIGINALS | MONTHLY.
ALTER TABLE "Company" ADD COLUMN "invoiceTiming" TEXT;

-- Отсрочка, которую мы дали заказчику: сколько дней и от какого дня.
-- Точка отсчёта: UNLOAD | INVOICE | ORIGINALS.
ALTER TABLE "Company" ADD COLUMN "customerPaymentDays" INTEGER;
ALTER TABLE "Company" ADD COLUMN "customerPaymentFrom" TEXT;

-- Отсрочка, которую дал нам перевозчик: сколько дней и от какого дня.
ALTER TABLE "Company" ADD COLUMN "carrierPaymentDays" INTEGER;
ALTER TABLE "Company" ADD COLUMN "carrierPaymentFrom" TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Заявка: снимок условий и проверка расчётов бухгалтером
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "Order" ADD COLUMN "customerPaymentDays" INTEGER;
ALTER TABLE "Order" ADD COLUMN "customerPaymentFrom" TEXT;
ALTER TABLE "Order" ADD COLUMN "carrierPaymentDays" INTEGER;
ALTER TABLE "Order" ADD COLUMN "carrierPaymentFrom" TEXT;

ALTER TABLE "Order" ADD COLUMN "settlementsConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "settlementsConfirmedById" TEXT;

-- Заявки, заведённые до появления проверки, считаются принятыми как есть.
--
-- Иначе в день выкатки все рейсы в работе разом стали бы «расчёты не
-- подтверждены»: печать на договорах отключилась, счёта перестали
-- выставляться, а контрагенты увидели бы «условия уточняются» по перевозкам,
-- которые давно едут. Имя подтвердившего остаётся пустым — никто их правда
-- не проверял, и на экране это так и написано.
UPDATE "Order" SET "settlementsConfirmedAt" = "createdAt" WHERE "settlementsConfirmedAt" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Документ по рейсу: черновик → проведён → отправлен
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "OrderDocument" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "OrderDocument" ADD COLUMN "postedAt" TIMESTAMP(3);
ALTER TABLE "OrderDocument" ADD COLUMN "postedById" TEXT;

ALTER TABLE "OrderDocument" ADD COLUMN "recipientCounterpartyId" TEXT;
ALTER TABLE "OrderDocument" ADD COLUMN "recipientCompanyId" TEXT;
ALTER TABLE "OrderDocument" ADD COLUMN "sentToEmail" TEXT;
ALTER TABLE "OrderDocument" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "OrderDocument" ADD COLUMN "sentById" TEXT;

ALTER TABLE "OrderDocument" ADD COLUMN "receiptStatus" TEXT;
ALTER TABLE "OrderDocument" ADD COLUMN "receiptReason" TEXT;
ALTER TABLE "OrderDocument" ADD COLUMN "receiptAt" TIMESTAMP(3);

ALTER TABLE "OrderDocument" ADD COLUMN "replacesId" TEXT;

-- Уже выданные документы — проведённые.
--
-- Они на руках у перевозчиков и водителей: объявить их черновиками значило бы
-- отобрать печать у бумаг, которые давно подписаны. Дата проведения — дата
-- выдачи, потому что тогда документ и стал действующим.
UPDATE "OrderDocument" SET "status" = 'POSTED', "postedAt" = "createdAt" WHERE "status" = 'DRAFT';

CREATE INDEX "OrderDocument_recipientCompanyId_idx" ON "OrderDocument"("recipientCompanyId");

ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_postedById_fkey"
    FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_sentById_fkey"
    FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
