-- Отметка о том, что обращение ушло владельцу в телеграм.
--
-- Пусто у всех существующих записей — и это правильно: отправка появилась
-- позже них, значит ни одно из них в мессенджер не уходило. Админка по этому
-- полю досылает накопившееся и не отправляет одно обращение дважды.
ALTER TABLE "SupportTicket" ADD COLUMN "telegramSentAt" TIMESTAMP(3);

CREATE INDEX "SupportTicket_telegramSentAt_idx" ON "SupportTicket"("telegramSentAt");
