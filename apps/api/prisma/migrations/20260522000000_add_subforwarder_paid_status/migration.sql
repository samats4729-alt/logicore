-- AddColumn: isSubForwarderPaid and subForwarderPaidAt to Order
ALTER TABLE "Order" ADD COLUMN "isSubForwarderPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "subForwarderPaidAt" TIMESTAMP(3);
