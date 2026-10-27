-- Настройка «договор-заявка перевозчику автоматически» (задачи шефа, A14). Только добавление поля.
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "autoContractRequest" BOOLEAN NOT NULL DEFAULT false;

