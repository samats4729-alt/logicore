-- Публичная ссылка на отчёт по взаиморасчётам переезжает из Redis в базу.
-- В кэше срок действия был ненадёжен (перезапуск убивал все ссылки разом),
-- отозвать конкретную ссылку было нечем, а список выданных нигде не хранился.
-- Миграция только добавляет таблицу: ничего существующего не трогает.

CREATE TABLE "SharedReportLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "ourRole" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "sentToEmail" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedReportLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedReportLink_token_key" ON "SharedReportLink"("token");
CREATE INDEX "SharedReportLink_companyId_createdAt_idx" ON "SharedReportLink"("companyId", "createdAt");
CREATE INDEX "SharedReportLink_companyId_counterpartyId_idx" ON "SharedReportLink"("companyId", "counterpartyId");

ALTER TABLE "SharedReportLink" ADD CONSTRAINT "SharedReportLink_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedReportLink" ADD CONSTRAINT "SharedReportLink_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedReportLink" ADD CONSTRAINT "SharedReportLink_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
