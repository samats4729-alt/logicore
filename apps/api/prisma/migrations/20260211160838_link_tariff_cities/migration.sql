/*
  Warnings:

  - You are about to drop the column `destinationCity` on the `RouteTariff` table. All the data in the column will be lost.
  - You are about to drop the column `originCity` on the `RouteTariff` table. All the data in the column will be lost.
  - Added the required column `destinationCityId` to the `RouteTariff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originCityId` to the `RouteTariff` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "RouteTariff_originCity_destinationCity_idx";

-- AlterTable
ALTER TABLE "RouteTariff" DROP COLUMN "destinationCity",
DROP COLUMN "originCity",
ADD COLUMN     "destinationCityId" TEXT NOT NULL,
ADD COLUMN     "originCityId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "RouteTariff_originCityId_destinationCityId_idx" ON "RouteTariff"("originCityId", "destinationCityId");

-- AddForeignKey
ALTER TABLE "RouteTariff" ADD CONSTRAINT "RouteTariff_originCityId_fkey" FOREIGN KEY ("originCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteTariff" ADD CONSTRAINT "RouteTariff_destinationCityId_fkey" FOREIGN KEY ("destinationCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
