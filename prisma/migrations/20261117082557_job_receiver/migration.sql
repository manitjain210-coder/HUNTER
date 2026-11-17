-- AlterTable
ALTER TABLE "DeliveryJob" ADD COLUMN "receiverConfirmedAt" DATETIME;
ALTER TABLE "DeliveryJob" ADD COLUMN "receiverConfirmedById" TEXT;
