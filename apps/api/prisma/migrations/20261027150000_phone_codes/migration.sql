-- Коды из СМС для регистрации и входа водителя (решение владельца 25.10.2026, вопрос 26).
-- Только новая таблица: существующие таблицы и данные не меняются.

-- CreateTable
CREATE TABLE "PhoneCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneCode_phone_purpose_createdAt_idx" ON "PhoneCode"("phone", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneCode_ip_createdAt_idx" ON "PhoneCode"("ip", "createdAt");

