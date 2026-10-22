-- Доп. телефоны и контакты для документов водителя биржи (задачи шефа, Q6). Только добавление полей.
-- AlterTable
ALTER TABLE "ExchangeDriver" ADD COLUMN     "docsContact" TEXT,
ADD COLUMN     "docsEmail" TEXT,
ADD COLUMN     "extraPhones" TEXT[] DEFAULT ARRAY[]::TEXT[];

