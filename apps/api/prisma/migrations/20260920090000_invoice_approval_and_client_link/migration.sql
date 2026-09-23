-- Согласование входящих счетов и постоянная ссылка заказчику.
--
-- 1. Согласование. Между «пришёл счёт» и «оплатили» появляется решение
--    финотдела. Пустое значение означает «ещё не смотрели» — то есть все
--    нынешние счета оказываются несогласованными, и это верно: их никто и
--    не согласовывал. На уже оплаченные это не влияет, запрет стоит только
--    на новом разнесении платежа.
--
-- 2. Вид ссылки. Все выданные ссылки — перевозчикам, поэтому CARRIER по
--    умолчанию. Срок становится необязательным: у ссылки заказчика его нет.
--    Существующим ссылкам срок остаётся прежним, ничего не переписывается.
ALTER TABLE "AccountingDocument" ADD COLUMN "approvalStatus" TEXT;
ALTER TABLE "AccountingDocument" ADD COLUMN "approvalNote" TEXT;
ALTER TABLE "AccountingDocument" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "AccountingDocument" ADD COLUMN "approvedById" TEXT;

ALTER TABLE "AccountingDocument"
    ADD CONSTRAINT "AccountingDocument_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SharedReportLink" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CARRIER';
ALTER TABLE "SharedReportLink" ALTER COLUMN "expiresAt" DROP NOT NULL;

CREATE INDEX "SharedReportLink_companyId_counterpartyId_kind_idx"
    ON "SharedReportLink"("companyId", "counterpartyId", "kind");
