-- Файл подписанного договора (задачи шефа, G5). Только добавление полей.
ALTER TABLE "Contract" ADD COLUMN "signedFileUrl" TEXT, ADD COLUMN "signedFileName" TEXT, ADD COLUMN "signedFileMime" TEXT, ADD COLUMN "signedFileSize" INTEGER, ADD COLUMN "signedUploadedAt" TIMESTAMP(3);
