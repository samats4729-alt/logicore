-- Удаление прежнего журнала счетов (таблица Invoice).
--
-- Почему это безопасно именно сейчас:
--   * из интерфейса раздел не открывался — «Счета» ведут в «Бухгалтерию»,
--     которая работает с AccountingDocument;
--   * мобильное приложение к нему не обращалось;
--   * создание записей было закрыто отдельным изменением ранее;
--   * в продакшене оставалось три записи (15–20 июля) с номерами «001»,
--     «yjvth 24587» и строкой из одной буквы — владелец опознал их как
--     пробные и подтвердил удаление.
--
-- Это единственная за всё время НЕ добавочная миграция, поэтому порядок
-- важен: сначала снимаем ссылки у заявок, потом убираем саму таблицу.
-- Прежде чем применять на продакшене, убедитесь, что в Railway есть свежая
-- резервная копия базы: восстановить удалённую таблицу больше неоткуда.

-- 1. Ссылки на счета у заявок. Внешние ключи снимаем до удаления таблицы,
--    иначе PostgreSQL не даст её тронуть.
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_incomingInvoiceId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_outgoingInvoiceId_fkey";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "incomingInvoiceId";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "outgoingInvoiceId";

-- 2. Сама таблица.
DROP TABLE IF EXISTS "Invoice";

-- 3. Перечисления, которые больше некому использовать.
DROP TYPE IF EXISTS "InvoiceStatus";
DROP TYPE IF EXISTS "InvoiceType";
