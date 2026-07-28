-- Кому слать доверенность по адресу — список у каждой компании свой.
-- В самом адресе почты держать нельзя: адреса бывают общими, и одна
-- компания перетирала бы контакты другой.
CREATE TABLE IF NOT EXISTS "LocationEmailList" (
    "id"         TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "companyId"  TEXT NOT NULL,
    "emails"     TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LocationEmailList_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LocationEmailList_locationId_companyId_key"
    ON "LocationEmailList" ("locationId", "companyId");
CREATE INDEX IF NOT EXISTS "LocationEmailList_companyId_idx"
    ON "LocationEmailList" ("companyId");

ALTER TABLE "LocationEmailList"
    ADD CONSTRAINT "LocationEmailList_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationEmailList"
    ADD CONSTRAINT "LocationEmailList_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
