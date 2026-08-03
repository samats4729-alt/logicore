-- Переоценка валютных остатков на конец месяца.
--
-- Только добавление двух таблиц; существующие не трогаются.
--
-- Зачем. Курсовая разница возникает не только когда деньги пришли. Пока
-- долларовый счёт лежит, а долг клиента не оплачен, курс всё равно движется:
-- на конец месяца тысяча долларов стоит уже других тенге. Эта разница должна
-- попасть в отчёт того месяца, иначе баланс на 31 число покажет вчерашние
-- тенге за сегодняшние доллары.
--
-- Переоценка хранится снимком: пересчитывать её при каждом показе нельзя —
-- прошлый месяц менялся бы сам по себе при каждом движении курса.

CREATE TABLE "CurrencyRevaluation" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    -- Дата, на которую переоценены остатки. Обычно последний день месяца.
    "date"        DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"        TEXT,
    -- Итоги снимка: доход и расход показываются по отдельности, «ноль»
    -- вместо «выиграли и потеряли поровну» скрывал бы движение денег.
    "gain"        DECIMAL(20,2) NOT NULL DEFAULT 0,
    "loss"        DECIMAL(20,2) NOT NULL DEFAULT 0,
    CONSTRAINT "CurrencyRevaluation_pkey" PRIMARY KEY ("id")
);

-- Одна переоценка на компанию на дату: две означали бы задвоение разницы.
CREATE UNIQUE INDEX "CurrencyRevaluation_companyId_date_key" ON "CurrencyRevaluation"("companyId", "date");
CREATE INDEX "CurrencyRevaluation_companyId_date_idx" ON "CurrencyRevaluation"("companyId", "date");

ALTER TABLE "CurrencyRevaluation" ADD CONSTRAINT "CurrencyRevaluation_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CurrencyRevaluation" ADD CONSTRAINT "CurrencyRevaluation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CurrencyRevaluationLine" (
    "id"             TEXT NOT NULL,
    "revaluationId"  TEXT NOT NULL,
    -- Что переоценено: ACCOUNT — остаток на счёте, RECEIVABLE — долг клиента,
    -- PAYABLE — наш долг перевозчику.
    "kind"           TEXT NOT NULL,
    -- На что ссылается строка: счёт или бухгалтерский документ.
    "accountId"      TEXT,
    "documentId"     TEXT,
    "currency"       TEXT NOT NULL,
    -- Остаток в валюте и курс, по которому его переоценили.
    "amount"         DECIMAL(20,2) NOT NULL,
    "rate"           DECIMAL(18,6) NOT NULL,
    -- Было в тенге, стало в тенге и разница между ними.
    "baseBefore"     DECIMAL(20,2) NOT NULL,
    "baseAfter"      DECIMAL(20,2) NOT NULL,
    "diff"           DECIMAL(20,2) NOT NULL,
    CONSTRAINT "CurrencyRevaluationLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CurrencyRevaluationLine_revaluationId_idx" ON "CurrencyRevaluationLine"("revaluationId");
-- По этим двум ищется предыдущая переоценка остатка: следующая разница
-- считается от неё, а не от курса документа, иначе одни и те же тенге
-- попали бы в отчёт дважды.
CREATE INDEX "CurrencyRevaluationLine_documentId_idx" ON "CurrencyRevaluationLine"("documentId");
CREATE INDEX "CurrencyRevaluationLine_accountId_idx" ON "CurrencyRevaluationLine"("accountId");

ALTER TABLE "CurrencyRevaluationLine" ADD CONSTRAINT "CurrencyRevaluationLine_revaluationId_fkey"
    FOREIGN KEY ("revaluationId") REFERENCES "CurrencyRevaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CurrencyRevaluationLine" ADD CONSTRAINT "CurrencyRevaluationLine_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CurrencyRevaluationLine" ADD CONSTRAINT "CurrencyRevaluationLine_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
