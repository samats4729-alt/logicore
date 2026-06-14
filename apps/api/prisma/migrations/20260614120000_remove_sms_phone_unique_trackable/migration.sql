-- DropTable
DROP TABLE IF EXISTS "SmsCode";

-- Deduplicate existing phone numbers for drivers (within the same company) and non-drivers (globally)
WITH duplicate_drivers AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "companyId", "phone" ORDER BY "updatedAt" DESC, "createdAt" DESC) as rn
  FROM "User"
  WHERE "role" = 'DRIVER' AND "companyId" IS NOT NULL AND "phone" IS NOT NULL
)
UPDATE "User"
SET "phone" = "phone" || '_dup_' || SUBSTRING(id FROM 1 FOR 6),
    "isActive" = false
WHERE id IN (
  SELECT id FROM duplicate_drivers WHERE rn > 1
);

WITH duplicate_non_drivers AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "phone" ORDER BY "updatedAt" DESC, "createdAt" DESC) as rn
  FROM "User"
  WHERE "role" != 'DRIVER' AND "phone" IS NOT NULL
)
UPDATE "User"
SET "phone" = "phone" || '_dup_' || SUBSTRING(id FROM 1 FOR 6),
    "isActive" = false
WHERE id IN (
  SELECT id FROM duplicate_non_drivers WHERE rn > 1
);

-- DropIndex
DROP INDEX IF EXISTS "User_phone_key";

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_phone_driver_idx" ON "User" ("companyId", "phone") WHERE "role" = 'DRIVER' AND "companyId" IS NOT NULL;
CREATE UNIQUE INDEX "User_phone_non_driver_idx" ON "User" ("phone") WHERE "role" != 'DRIVER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isTrackable" BOOLEAN NOT NULL DEFAULT false;
