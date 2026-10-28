-- Запросы на удаление заявки (решение владельца 29.10.2026): заявку, в которой
-- есть другая зарегистрированная компания, удаляют только с её согласия.
-- Только новая таблица: существующие таблицы и данные не меняются.

-- CreateTable
CREATE TABLE "OrderDeleteRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestedByCompanyId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "reason" TEXT,
    "approvedCompanyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "declinedByCompanyId" TEXT,
    "declineReason" TEXT,
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDeleteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderDeleteRequest_orderId_key" ON "OrderDeleteRequest"("orderId");

-- AddForeignKey
ALTER TABLE "OrderDeleteRequest" ADD CONSTRAINT "OrderDeleteRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
