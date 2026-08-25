-- Завершение рейса водителем ждёт проверки менеджером.
--
-- Водитель закрывает рейс по своей ссылке и прикладывает фото накладной,
-- стоя на выгрузке. Нечитаемое фото можно переснять ровно пока он там: уехал —
-- возвращать некого. В журнале такой рейс выглядел как любой другой
-- завершённый, и менеджер узнавал о нём, только открыв заявку.
ALTER TABLE "Order" ADD COLUMN "driverCompletedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "completionReviewedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "completionReviewedById" TEXT;

ALTER TABLE "Order" ADD CONSTRAINT "Order_completionReviewedById_fkey"
    FOREIGN KEY ("completionReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Журнал спрашивает «что ещё не проверено» на каждой отрисовке списка.
CREATE INDEX "Order_driverCompletedAt_completionReviewedAt_idx"
    ON "Order" ("driverCompletedAt", "completionReviewedAt");

-- Уже завершённые рейсы проверять задним числом некого и незачем: водитель
-- давно уехал. Оставляем их непомеченными, чтобы журнал не вспыхнул
-- сотней старых строк в день выхода правки.
