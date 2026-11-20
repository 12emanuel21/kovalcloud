-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "deliveryFeePresets" JSONB,
ADD COLUMN     "flatDeliveryFee" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryFeePending" BOOLEAN NOT NULL DEFAULT false;
