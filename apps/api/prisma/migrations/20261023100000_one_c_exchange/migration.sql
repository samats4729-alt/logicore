-- Прямой обмен с 1С (решение владельца 22–23.10.2026). Только новые таблицы.
-- CreateTable
CREATE TABLE "OneCConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nodeCode" TEXT NOT NULL,
    "exchangePlanName" TEXT,
    "peerNodeCode" TEXT,
    "peerName" TEXT,
    "peerConfigVersion" TEXT,
    "formatVersion" TEXT,
    "settingsXml" TEXT,
    "setupAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "sentNo" INTEGER NOT NULL DEFAULT 0,
    "receivedNo" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneCConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneCExchangeLog" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneCExchangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OneCConnection_login_key" ON "OneCConnection"("login");

-- CreateIndex
CREATE INDEX "OneCConnection_companyId_idx" ON "OneCConnection"("companyId");

-- CreateIndex
CREATE INDEX "OneCExchangeLog_connectionId_createdAt_idx" ON "OneCExchangeLog"("connectionId", "createdAt");

-- AddForeignKey
ALTER TABLE "OneCConnection" ADD CONSTRAINT "OneCConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneCExchangeLog" ADD CONSTRAINT "OneCExchangeLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OneCConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

