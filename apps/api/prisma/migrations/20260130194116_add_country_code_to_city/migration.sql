-- AlterTable
ALTER TABLE "City" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'KZ';

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "city" TEXT;
