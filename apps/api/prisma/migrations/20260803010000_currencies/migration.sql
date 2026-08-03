-- Справочник валют и история курсов к тенге.
--
-- Только добавление двух таблиц: существующие данные не трогаются, ничего
-- не удаляется и не переименовывается. Суммы в документах пока остаются как
-- были — это первый шаг, справочник и курсы.
--
-- Ключевое в устройстве: курс хранится историей по датам и записывается
-- как «тенге за одну единицу» — кратность Нацбанка (сум за 100, драм за 10)
-- разворачивается при загрузке, а исходные значения остаются рядом, чтобы
-- бухгалтер могла сверить с сайтом глазами.

CREATE TABLE "Currency" (
    "code" VARCHAR(3) NOT NULL,
    "nameRu" TEXT NOT NULL,
    "symbol" TEXT,
    "quant" INTEGER NOT NULL DEFAULT 1,
    "isCommon" BOOLEAN NOT NULL DEFAULT false,
    "hasOfficialRate" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 500,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "rateDate" DATE NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "sourceRate" DECIMAL(18,6),
    "sourceQuant" INTEGER,
    "source" VARCHAR(10) NOT NULL DEFAULT 'NBK',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Currency_isCommon_sortOrder_idx" ON "Currency"("isCommon", "sortOrder");
CREATE UNIQUE INDEX "ExchangeRate_currencyCode_rateDate_key" ON "ExchangeRate"("currencyCode", "rateDate");
CREATE INDEX "ExchangeRate_rateDate_idx" ON "ExchangeRate"("rateDate");

ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
