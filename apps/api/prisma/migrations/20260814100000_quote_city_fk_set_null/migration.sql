-- Связь с городом стала необязательной — значит и правило удаления другое.
--
-- Пока город был обязателен, Prisma держала на этих ссылках `RESTRICT`:
-- город нельзя удалить, пока на него ссылается запрос. У необязательной
-- связи правило по умолчанию другое — `SET NULL`. Сами ссылки при
-- переводе колонок в NULL не переписывались, и база, собранная из
-- миграций, перестала совпадать со схемой: проверка в CI это и поймала.
--
-- Расхождение не косметическое. Удаление города из справочника упиралось
-- бы в старый запрос месячной давности с невнятным отказом, хотя по схеме
-- ссылка должна просто обнулиться.

ALTER TABLE "QuoteRequest" DROP CONSTRAINT "QuoteRequest_originCityId_fkey";
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_originCityId_fkey"
    FOREIGN KEY ("originCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuoteRequest" DROP CONSTRAINT "QuoteRequest_destinationCityId_fkey";
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_destinationCityId_fkey"
    FOREIGN KEY ("destinationCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
