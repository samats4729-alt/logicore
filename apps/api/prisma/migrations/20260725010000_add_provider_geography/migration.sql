-- Add stable provider identifiers without replacing existing geography records.
ALTER TABLE "Country"
    ADD COLUMN "externalProvider" TEXT,
    ADD COLUMN "externalId" TEXT;

ALTER TABLE "Region"
    ADD COLUMN "externalProvider" TEXT,
    ADD COLUMN "externalId" TEXT;

ALTER TABLE "City"
    ADD COLUMN "externalProvider" TEXT,
    ADD COLUMN "externalId" TEXT;

ALTER TABLE "Location"
    ADD COLUMN "cityId" TEXT;

CREATE UNIQUE INDEX "Country_externalProvider_externalId_key"
    ON "Country"("externalProvider", "externalId");
CREATE UNIQUE INDEX "Region_externalProvider_externalId_key"
    ON "Region"("externalProvider", "externalId");
CREATE UNIQUE INDEX "City_externalProvider_externalId_key"
    ON "City"("externalProvider", "externalId");
CREATE INDEX "Location_cityId_idx" ON "Location"("cityId");

ALTER TABLE "Location"
    ADD CONSTRAINT "Location_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
