-- Документы и заявления, пришедшие от контрагента по ссылке на отчёт.
--
-- У контрагента нет учётной записи: он открыл ссылку и приложил накладную
-- или назвал свою сумму. Раньше у документа обязательно был автор-
-- пользователь, поэтому такой файл пришлось бы подписать именем случайного
-- нашего сотрудника — враньё в документообороте. Теперь автором может быть
-- организация.
--
-- Заявление о деньгах тоже бывает двух видов. Плательщик говорит «я
-- перевёл» и прикладывает платёжку. Получатель говорит «мне пришло не
-- столько» — и прикладывать ему нечего, выписка у него своя. Поэтому файл
-- перестал быть обязательным, а вид заявления записывается явно.

CREATE TYPE "PaymentProofKind" AS ENUM ('PAYMENT', 'RECEIPT');

ALTER TABLE "Document" DROP CONSTRAINT "Document_uploadedById_fkey";

ALTER TABLE "Document" ADD COLUMN     "uploadedByCounterpartyId" TEXT,
ALTER COLUMN "uploadedById" DROP NOT NULL;

ALTER TABLE "OrderPaymentProof" ADD COLUMN     "kind" "PaymentProofKind" NOT NULL DEFAULT 'PAYMENT',
ALTER COLUMN "fileName" DROP NOT NULL,
ALTER COLUMN "fileUrl" DROP NOT NULL,
ALTER COLUMN "fileSize" DROP NOT NULL,
ALTER COLUMN "mimeType" DROP NOT NULL;

ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedByCounterpartyId_fkey" FOREIGN KEY ("uploadedByCounterpartyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Счёт, выставленный контрагентом по публичной ссылке.
--
-- Отличить его от черновика, заведённого нашим бухгалтером руками, по
-- одному лишь совпадению контрагента и статуса нельзя. А отличать надо:
-- свой счёт контрагент вправе отозвать, пока его не тронули, чужой — нет.
ALTER TABLE "AccountingDocument" ADD COLUMN     "sharedReportLinkId" TEXT;

ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_sharedReportLinkId_fkey" FOREIGN KEY ("sharedReportLinkId") REFERENCES "SharedReportLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
