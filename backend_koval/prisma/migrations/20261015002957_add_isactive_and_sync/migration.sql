-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'DELIVERY', 'TAKEAWAY');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "channel" TEXT DEFAULT 'WEB_MENU',
ADD COLUMN     "orderType" "OrderType" NOT NULL DEFAULT 'DELIVERY',
ADD COLUMN     "tableNumber" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "whatsappPhoneId" TEXT,
ADD COLUMN     "whatsappToken" TEXT,
ADD COLUMN     "whatsappVerifyToken" TEXT,
ADD COLUMN     "whatsappWabaId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isTwoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;
