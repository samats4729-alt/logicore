-- Чёрный список компании (задачи шефа, F5/S2). Только новая таблица.
-- CreateTable
CREATE TABLE "CompanyBlocklist" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "name" TEXT,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyBlocklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBlocklist_companyId_kind_value_key" ON "CompanyBlocklist"("companyId", "kind", "value");

-- AddForeignKey
ALTER TABLE "CompanyBlocklist" ADD CONSTRAINT "CompanyBlocklist_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

