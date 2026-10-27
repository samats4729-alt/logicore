-- CreateTable
CREATE TABLE "OneCObjectMap" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneCObjectMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OneCObjectMap_connectionId_objectType_localId_idx" ON "OneCObjectMap"("connectionId", "objectType", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "OneCObjectMap_connectionId_objectType_ref_key" ON "OneCObjectMap"("connectionId", "objectType", "ref");

-- AddForeignKey
ALTER TABLE "OneCObjectMap" ADD CONSTRAINT "OneCObjectMap_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OneCConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

