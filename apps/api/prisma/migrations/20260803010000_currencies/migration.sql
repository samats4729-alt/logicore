-- Справочник валют, официальные курсы Нацбанка и свои курсы компаний.
--
-- Только добавление трёх таблиц: существующие данные не трогаются, ничего
-- не удаляется и не переименовывается. Суммы в документах пока остаются как
-- были — это первый шаг, справочник и курсы.
--
-- Два решения, ради которых устройство именно такое.
--
-- 1. Курс хранится историей по датам и записывается как «тенге за одну
--    единицу»: кратность Нацбанка (сум за 100, драм за 10, риал за 10 000)
--    разворачивается при загрузке, а исходные значения остаются рядом,
--    чтобы бухгалтер могла сверить с сайтом глазами.
--
-- 2. Официальный курс и свой курс компании — РАЗНЫЕ таблицы. Курс Нацбанка
--    один для всех и общий. Курс по договору — коммерческая договорённость
--    одной компании, и другим компаниям платформы её видеть нельзя. В одной
--    таблице это неизбежно протекало бы между компаниями.

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
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyExchangeRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "rateDate" DATE NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Currency_isCommon_sortOrder_idx" ON "Currency"("isCommon", "sortOrder");
CREATE UNIQUE INDEX "ExchangeRate_currencyCode_rateDate_key" ON "ExchangeRate"("currencyCode", "rateDate");
CREATE INDEX "ExchangeRate_rateDate_idx" ON "ExchangeRate"("rateDate");
CREATE UNIQUE INDEX "CompanyExchangeRate_companyId_currencyCode_rateDate_key" ON "CompanyExchangeRate"("companyId", "currencyCode", "rateDate");
CREATE INDEX "CompanyExchangeRate_companyId_rateDate_idx" ON "CompanyExchangeRate"("companyId", "rateDate");

ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyExchangeRate" ADD CONSTRAINT "CompanyExchangeRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyExchangeRate" ADD CONSTRAINT "CompanyExchangeRate_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyExchangeRate" ADD CONSTRAINT "CompanyExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
