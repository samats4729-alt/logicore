-- Доставка документа контрагенту на платформе.
--
-- Только добавление колонок. У всех существующих документов они пустые:
-- никто никому ничего не отправлял, и поведение не меняется.
--
-- Задача. Если счёт выставила компания А компании Б и обе работают в
-- LogiCore, у Б он до сих пор не появлялся — она заводила его руками.
-- Один и тот же документ existовал дважды, с разными номерами и суммами,
-- набранными на слух.
--
-- Решение: документ остаётся ОДИН. У него уже есть companyId (кто выпустил)
-- и counterpartyId (кому). Добавляется получатель — реальная компания
-- платформы, которой открыт доступ на чтение. Копий не появляется, спорить
-- о том, чей номер правильный, не приходится.

-- Кому доставлен документ на платформе. Пусто — не отправляли или у
-- контрагента нет учётной записи (тогда остаётся публичная ссылка).
ALTER TABLE "AccountingDocument" ADD COLUMN "recipientCompanyId" TEXT;
ALTER TABLE "AccountingDocument" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "AccountingDocument" ADD COLUMN "sentById" TEXT;

-- Что получатель с ним сделал: принял или отклонил с причиной. Пусто —
-- ещё не смотрел.
ALTER TABLE "AccountingDocument" ADD COLUMN "receiptStatus" TEXT;
ALTER TABLE "AccountingDocument" ADD COLUMN "receiptReason" TEXT;
ALTER TABLE "AccountingDocument" ADD COLUMN "receiptAt" TIMESTAMP(3);
ALTER TABLE "AccountingDocument" ADD COLUMN "receiptById" TEXT;

CREATE INDEX "AccountingDocument_recipientCompanyId_idx" ON "AccountingDocument"("recipientCompanyId");

ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_recipientCompanyId_fkey"
    FOREIGN KEY ("recipientCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_sentById_fkey"
    FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_receiptById_fkey"
    FOREIGN KEY ("receiptById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
