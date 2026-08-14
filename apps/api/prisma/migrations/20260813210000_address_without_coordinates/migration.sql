-- Адрес живёт без координат: раньше при недоступном геокодере новую точку
-- нельзя было завести вовсе, и работа вставала.
ALTER TABLE "Location" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "Location" ALTER COLUMN "longitude" DROP NOT NULL;

-- Части адреса, введённые человеком, и следы поиска координат.
ALTER TABLE "Location" ADD COLUMN "country" TEXT;
ALTER TABLE "Location" ADD COLUMN "region" TEXT;
ALTER TABLE "Location" ADD COLUMN "street" TEXT;
ALTER TABLE "Location" ADD COLUMN "house" TEXT;
ALTER TABLE "Location" ADD COLUMN "coordinatesManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Location" ADD COLUMN "geocodeFailedAt" TIMESTAMP(3);

-- Отбор «адреса без координат» идёт по этому условию, и он должен быть
-- быстрым: список открывается на каждой странице справочника адресов.
CREATE INDEX "Location_missing_coordinates_idx" ON "Location" ("companyId") WHERE "latitude" IS NULL;
