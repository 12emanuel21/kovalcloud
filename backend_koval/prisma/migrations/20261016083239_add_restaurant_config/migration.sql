-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "address" TEXT,
ADD COLUMN     "businessHours" JSONB,
ADD COLUMN     "closedMessage" TEXT,
ADD COLUMN     "isTemporarilyClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentDetails" TEXT;
