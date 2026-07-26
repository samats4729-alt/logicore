-- Реквизиты организации, которые печатаются в счетах и актах.
-- Раньше КНП вбивали в каждый счёт руками, должность подписанта была
-- зашита в код строкой «директор», а свидетельства НДС не было вовсе.
-- Все поля необязательные: у компании без них документы печатаются как прежде.

ALTER TABLE "Company" ADD COLUMN "paymentPurposeCode" TEXT;
ALTER TABLE "Company" ADD COLUMN "signatoryPosition" TEXT;
ALTER TABLE "Company" ADD COLUMN "signatoryName" TEXT;
ALTER TABLE "Company" ADD COLUMN "vatCertificateSeries" TEXT;
ALTER TABLE "Company" ADD COLUMN "vatCertificateNumber" TEXT;
ALTER TABLE "Company" ADD COLUMN "vatCertificateDate" DATE;
