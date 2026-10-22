-- Сроки страховки и техосмотра машины (задачи шефа, R5). Только добавление полей.
ALTER TABLE "Vehicle" ADD COLUMN "insuranceUntil" DATE, ADD COLUMN "inspectionUntil" DATE;
