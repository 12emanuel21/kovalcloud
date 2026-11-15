-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "wompiTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_wompiTransactionId_key" ON "Order"("wompiTransactionId");
