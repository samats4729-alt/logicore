-- Ответ поддержки, который видит компания.
--
-- До этого обращение было дорогой в один конец: письмо уходило владельцу в
-- телеграм, а человек на другом конце видел только «принято» и не знал,
-- чем всё кончилось. Ответ живёт рядом с самим обращением: искать его в
-- переписке и в почте — значит не найти.

ALTER TABLE "SupportTicket" ADD COLUMN "answer" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "answeredAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN "answeredById" TEXT;
