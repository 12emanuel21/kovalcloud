-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentProofAt" TIMESTAMP(3),
ADD COLUMN     "paymentProofUrl" TEXT;

-- AlterTable
ALTER TABLE "ChatHistory" ADD COLUMN     "mediaMime" TEXT,
ADD COLUMN     "mediaName" TEXT,
ADD COLUMN     "mediaType" TEXT,
ADD COLUMN     "mediaUrl" TEXT;

