/*
  Warnings:

  - You are about to drop the column `countryCode` on the `City` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[countryId,regionId,name]` on the table `City` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `countryId` to the `City` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('FIXED', 'PER_KM', 'PER_TON');

-- CreateEnum
CREATE TYPE "PartnershipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- DropIndex
DROP INDEX "City_name_key";

-- AlterTable
ALTER TABLE "City" DROP COLUMN "countryCode",
ADD COLUMN     "countryId" TEXT NOT NULL,
ADD COLUMN     "regionId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerPriceType" "PriceType" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "subForwarderId" TEXT,
ADD COLUMN     "subForwarderPrice" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Partnership" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Partnership_status_idx" ON "Partnership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Partnership_requesterId_recipientId_key" ON "Partnership"("requesterId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Country_code_key" ON "Country"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Region_countryId_name_key" ON "Region"("countryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CargoCategory_name_key" ON "CargoCategory"("name");

-- CreateIndex
CREATE INDEX "CargoType_categoryId_idx" ON "CargoType"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "City_countryId_regionId_name_key" ON "City"("countryId", "regionId", "name");

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_subForwarderId_fkey" FOREIGN KEY ("subForwarderId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoType" ADD CONSTRAINT "CargoType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CargoCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
