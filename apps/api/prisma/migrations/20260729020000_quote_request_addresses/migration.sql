-- Точные адреса погрузки и выгрузки в запросе.
--
-- Города и адреса нужны оба и для разного: по городам ищется история
-- (склад у каждого клиента свой, по адресам совпадений не было бы), а
-- адреса переносятся в заявку, когда клиент согласовал цену.
--
-- Ссылка на справочник — когда адрес там уже есть. Текстовое поле — когда
-- клиент прислал адрес, которого в справочнике ещё нет: иначе он остался
-- бы только в переписке.

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "destinationAddress" TEXT,
ADD COLUMN     "destinationLocationId" TEXT,
ADD COLUMN     "originAddress" TEXT,
ADD COLUMN     "originLocationId" TEXT;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_originLocationId_fkey" FOREIGN KEY ("originLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

