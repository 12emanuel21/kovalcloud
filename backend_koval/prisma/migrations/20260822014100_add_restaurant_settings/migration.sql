-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "description" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "bannerUrl" TEXT,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'COP',
ADD COLUMN "botpressBotId" TEXT DEFAULT 'koval-pizzeria-bot';
