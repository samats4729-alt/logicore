-- CreateEnum
CREATE TYPE "ExchangeDriverKind" AS ENUM ('IP', 'PARK');

-- CreateEnum
CREATE TYPE "ExchangeDriverStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ExchangeDriverDocumentKind" AS ENUM ('ID_FRONT', 'ID_BACK', 'SELFIE_WITH_ID', 'LICENSE', 'VEHICLE_REGISTRATION', 'POWER_OF_ATTORNEY', 'IP_CERTIFICATE');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isPark" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ExchangeDriver" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ExchangeDriverKind",
    "status" "ExchangeDriverStatus" NOT NULL DEFAULT 'DRAFT',
    "parkCompanyId" TEXT,
    "lastName" TEXT,
    "firstName" TEXT,
    "middleName" TEXT,
    "iin" TEXT,
    "phone" TEXT,
    "ipName" TEXT,
    "ipIin" TEXT,
    "vehiclePlate" TEXT,
    "vehicleBodyType" TEXT,
    "vehicleCapacityKg" INTEGER,
    "vehicleIsOwn" BOOLEAN NOT NULL DEFAULT true,
    "contractSignedAt" TIMESTAMP(3),
    "contractSignedDevice" TEXT,
    "contractSignedIp" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectReason" TEXT,
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "tripsCompleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeDriverDocument" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "kind" "ExchangeDriverDocumentKind" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeDriverDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeBlocklist" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeBlocklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeDriver_userId_key" ON "ExchangeDriver"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeDriver_iin_key" ON "ExchangeDriver"("iin");

-- CreateIndex
CREATE INDEX "ExchangeDriver_parkCompanyId_status_idx" ON "ExchangeDriver"("parkCompanyId", "status");

-- CreateIndex
CREATE INDEX "ExchangeDriver_status_idx" ON "ExchangeDriver"("status");

-- CreateIndex
CREATE INDEX "ExchangeDriverDocument_driverId_idx" ON "ExchangeDriverDocument"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeBlocklist_kind_value_key" ON "ExchangeBlocklist"("kind", "value");

-- AddForeignKey
ALTER TABLE "ExchangeDriver" ADD CONSTRAINT "ExchangeDriver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeDriver" ADD CONSTRAINT "ExchangeDriver_parkCompanyId_fkey" FOREIGN KEY ("parkCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeDriverDocument" ADD CONSTRAINT "ExchangeDriverDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "ExchangeDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

