-- Нештатный водитель без перевозчика — в базе водителей компании.
--
-- Водитель всегда числился у компании: штатный — у своей, водитель
-- перевозчика — у ИП из справочника. Человека со своей фурой и без ИП
-- прописать не у кого, а в базе экспедитора он быть обязан: иначе его не
-- найти в заявке. `baseCompanyId` — чья это база; у остальных водителей поле
-- пустое.
--
-- Только добавление: новая пустая колонка, индекс и связь. Существующие
-- строки не переписываются.
ALTER TABLE "User" ADD COLUMN "baseCompanyId" TEXT;

CREATE INDEX "User_baseCompanyId_idx" ON "User"("baseCompanyId");

ALTER TABLE "User" ADD CONSTRAINT "User_baseCompanyId_fkey" FOREIGN KEY ("baseCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
